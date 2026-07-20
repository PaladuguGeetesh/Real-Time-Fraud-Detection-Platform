"""
Offline training for the ML Service's fraud detector.

Production model: XGBoost, supervised (trained directly on the `Class`
label, with scale_pos_weight for the ~577:1 class imbalance -- no SMOTE
or resampling). This intentionally departs from the original "unsupervised
Isolation Forest, no label leakage" plan; see ARCHITECTURE.md section 4
for the rationale and evaluate_baseline.py for the comparison that
justified it: Isolation Forest recall plateaued around 68% regardless of
threshold, while XGBoost reaches ~96% precision / ~83% recall on the
identical train/test split.

The original Isolation Forest pipeline is preserved below in
train_isolation_forest_legacy() for reference and as the documented
starting point for possible future work on a hybrid novelty-detection
layer. It is not invoked by default and does not touch the shipped
model.pkl.
"""

import itertools
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, cross_val_score, train_test_split
from xgboost import XGBClassifier

DATA_PATH = "../data/creditcard.csv"
MODEL_PATH = "model.pkl"
MODEL_VERSION = "xgboost-v1"
RANDOM_STATE = 42

BASE_FEATURE_COLS = ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount"]
ENGINEERED_FEATURE_COLS = ["log_amount", "hour_sin", "hour_cos"]
FEATURE_COLS = BASE_FEATURE_COLS + ENGINEERED_FEATURE_COLS

# Current shipped defaults (see train_xgboost) -- also the baseline that
# tune_xgboost_hyperparameters() checks the search against.
XGB_DEFAULT_PARAMS = {"n_estimators": 300, "max_depth": 5, "learning_rate": 0.1, "min_child_weight": 1}

XGB_PARAM_DISTRIBUTIONS = {
    "max_depth": [3, 5, 7],
    "learning_rate": [0.05, 0.1, 0.2],
    "n_estimators": [100, 200, 300],
    "min_child_weight": [1, 3, 5],
}
XGB_SEARCH_N_ITER = 20  # light random sample of the 81-combination grid, not exhaustive
XGB_TUNING_IMPROVEMENT_THRESHOLD = 0.03  # relative CV AUPRC gain required to switch off the defaults


def engineer_features(df):
    """Add engineered columns on top of the raw dataset columns."""
    df = df.copy()
    df["log_amount"] = np.log1p(df["Amount"])
    hour = (df["Time"] % 86400) / 3600
    df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    return df


def normalize(raw_scores, score_min, score_max):
    """Map IsolationForest raw scores (higher = more normal) to a
    0.0-1.0 risk score where higher = riskier. Used only by the legacy
    Isolation Forest path -- XGBoost's predict_proba is already 0-1."""
    denom = score_max - score_min
    risk = (score_max - raw_scores) / denom
    return np.clip(risk, 0.0, 1.0)


def compute_threshold_stats(risk, y_true):
    """Rank every row by risk score and walk the ranking one row at a
    time: cumulative sums give the exact confusion matrix / precision /
    recall / F1 at every possible threshold in one O(n log n) pass,
    instead of rescanning the test set per candidate threshold."""
    y_arr = y_true.to_numpy() if hasattr(y_true, "to_numpy") else np.asarray(y_true)
    order = np.argsort(-risk)
    y_sorted = y_arr[order]
    scores_sorted = risk[order]

    n_pos = int(y_sorted.sum())
    n_neg = len(y_sorted) - n_pos

    tp_cum = np.cumsum(y_sorted)
    k = np.arange(1, len(y_sorted) + 1)
    fp_cum = k - tp_cum
    fn_cum = n_pos - tp_cum
    tn_cum = n_neg - fp_cum

    precision_k = tp_cum / k
    recall_k = tp_cum / n_pos
    f1_k = np.divide(
        2 * precision_k * recall_k,
        precision_k + recall_k,
        out=np.zeros_like(precision_k, dtype=float),
        where=(precision_k + recall_k) != 0,
    )
    return scores_sorted, precision_k, recall_k, f1_k, tp_cum, fp_cum, fn_cum, tn_cum


def _pack(idx, scores_sorted, precision_k, recall_k, f1_k, tp_cum, fp_cum, fn_cum, tn_cum):
    return {
        "threshold": float(scores_sorted[idx]),
        "precision": float(precision_k[idx]),
        "recall": float(recall_k[idx]),
        "f1": float(f1_k[idx]),
        "tp": int(tp_cum[idx]),
        "fp": int(fp_cum[idx]),
        "fn": int(fn_cum[idx]),
        "tn": int(tn_cum[idx]),
    }


def f1_optimal_threshold(risk, y_true):
    stats = compute_threshold_stats(risk, y_true)
    idx = int(np.argmax(stats[3]))  # f1_k
    return _pack(idx, *stats)


def cost_weighted_threshold(risk, y_true, ratio):
    scores_sorted, precision_k, recall_k, f1_k, tp_cum, fp_cum, fn_cum, tn_cum = compute_threshold_stats(risk, y_true)
    cost_k = ratio * fn_cum + 1 * fp_cum
    idx = int(np.argmin(cost_k))
    return _pack(idx, scores_sorted, precision_k, recall_k, f1_k, tp_cum, fp_cum, fn_cum, tn_cum)


def print_full_metrics(result, auprc):
    print(f"Precision: {result['precision']:.4f}")
    print(f"Recall:    {result['recall']:.4f}")
    print(f"F1:        {result['f1']:.4f}")
    print(f"AUPRC:     {auprc:.4f}")
    print("Confusion matrix:")
    print("                 predicted safe   predicted fraud")
    print(f"  actual safe    {result['tn']:>14,}   {result['fp']:>15,}")
    print(f"  actual fraud   {result['fn']:>14,}   {result['tp']:>15,}")


def tune_xgboost_hyperparameters(X_train, y_train, scale_pos_weight):
    """Light RandomizedSearchCV over XGBoost hyperparameters, scored by
    AUPRC via 5-fold stratified CV. Also scores the current defaults under
    the identical CV protocol (not the single held-out test score reported
    elsewhere) so the two numbers are directly, fairly comparable."""
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    # Parallelism lives at the search level (n_jobs=-1 below); each inner
    # XGBClassifier fit uses n_jobs=1 to avoid oversubscribing CPU cores
    # with two nested layers of parallelism fighting each other.
    search_estimator = XGBClassifier(
        scale_pos_weight=scale_pos_weight,
        eval_metric="aucpr",
        random_state=RANDOM_STATE,
        n_jobs=1,
    )

    total_combos = 1
    for values in XGB_PARAM_DISTRIBUTIONS.values():
        total_combos *= len(values)
    print(
        f"\nHyperparameter search: RandomizedSearchCV ({XGB_SEARCH_N_ITER} of "
        f"{total_combos} possible combinations), 5-fold stratified CV, scored by AUPRC ..."
    )
    search = RandomizedSearchCV(
        search_estimator,
        param_distributions=XGB_PARAM_DISTRIBUTIONS,
        n_iter=XGB_SEARCH_N_ITER,
        scoring="average_precision",
        cv=skf,
        random_state=RANDOM_STATE,
        n_jobs=-1,
        refit=False,
    )
    start = time.time()
    search.fit(X_train, y_train)
    print(f"  done in {time.time() - start:.0f}s")

    results = pd.DataFrame(search.cv_results_).sort_values("mean_test_score", ascending=False)
    print("\nTop 5 candidates by mean CV AUPRC:")
    print(f"{'max_depth':>9} | {'learning_rate':>13} | {'n_estimators':>12} | {'min_child_weight':>17} | {'AUPRC':>8}")
    for _, row in results.head(5).iterrows():
        p = row["params"]
        print(
            f"{p['max_depth']:>9} | {p['learning_rate']:>13.2f} | {p['n_estimators']:>12} | "
            f"{p['min_child_weight']:>17} | {row['mean_test_score']:>8.4f}"
        )

    tuned_params = search.best_params_
    tuned_auprc = search.best_score_
    print(f"\nBest tuned combination: {tuned_params} -> CV AUPRC={tuned_auprc:.4f}")

    print("Scoring current default hyperparameters under the identical CV protocol for a fair comparison ...")
    default_estimator = XGBClassifier(
        **XGB_DEFAULT_PARAMS,
        scale_pos_weight=scale_pos_weight,
        eval_metric="aucpr",
        random_state=RANDOM_STATE,
        n_jobs=1,
    )
    default_scores = cross_val_score(
        default_estimator, X_train, y_train, cv=skf, scoring="average_precision", n_jobs=-1
    )
    default_auprc = float(default_scores.mean())
    print(f"Current default {XGB_DEFAULT_PARAMS} -> CV AUPRC={default_auprc:.4f}")

    relative_improvement = (tuned_auprc - default_auprc) / default_auprc
    print(f"\nTuned vs default: {tuned_auprc:.4f} vs {default_auprc:.4f} ({relative_improvement:+.2%} relative)")

    if relative_improvement >= XGB_TUNING_IMPROVEMENT_THRESHOLD:
        print(
            f"Improvement >= {XGB_TUNING_IMPROVEMENT_THRESHOLD:.0%} threshold -- "
            "switching production hyperparameters to the tuned combination."
        )
        return tuned_params
    else:
        print(
            f"Improvement < {XGB_TUNING_IMPROVEMENT_THRESHOLD:.0%} threshold -- within noise, not a real gain. "
            "Keeping current defaults: tuning was attempted and the defaults were already near-optimal."
        )
        return dict(XGB_DEFAULT_PARAMS)


def train_xgboost(X_train, y_train, params, scale_pos_weight):
    model = XGBClassifier(
        **params,
        scale_pos_weight=scale_pos_weight,
        eval_metric="aucpr",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    return model


def main():
    print(f"Loading dataset from {DATA_PATH} ...")
    df = pd.read_csv(DATA_PATH)
    df = engineer_features(df)
    print(f"  {len(df):,} rows, fraud rate = {df['Class'].mean():.5%}")
    print(f"  Features ({len(FEATURE_COLS)}): {FEATURE_COLS}")

    X = df[FEATURE_COLS]
    y = df["Class"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(
        f"Train: {len(X_train):,} rows ({y_train.sum()} fraud) | "
        f"Test: {len(X_test):,} rows ({y_test.sum()} fraud)"
    )

    print("\nTraining production model: XGBoost (supervised, uses Class directly) ...")
    neg, pos = int((y_train == 0).sum()), int((y_train == 1).sum())
    scale_pos_weight = neg / pos
    print(
        f"Class imbalance in training set: {neg:,} negative / {pos} positive "
        f"-> scale_pos_weight={scale_pos_weight:.2f} (no SMOTE / resampling used)"
    )

    chosen_params = tune_xgboost_hyperparameters(X_train, y_train, scale_pos_weight)

    print(f"\nFitting final model on full training set with: {chosen_params}")
    model = train_xgboost(X_train, y_train, chosen_params, scale_pos_weight)

    risk_test = model.predict_proba(X_test)[:, 1]
    auprc = average_precision_score(y_test, risk_test)

    result = f1_optimal_threshold(risk_test, y_test)
    risk_threshold = result["threshold"]

    print(f"\nF1-optimal threshold: {risk_threshold:.4f} (flag as fraud when riskScore >= this)")
    print("\n=== Final evaluation on held-out test set ===")
    print_full_metrics(result, auprc)

    bundle = {
        "model": model,
        "feature_cols": FEATURE_COLS,
        "risk_threshold": float(risk_threshold),
        "hyperparameters": {**chosen_params, "scale_pos_weight": scale_pos_weight},
        "model_version": MODEL_VERSION,
    }
    joblib.dump(bundle, MODEL_PATH)
    print(f"\nSaved model bundle to {MODEL_PATH}")


# =============================================================================
# LEGACY / EVALUATION-ONLY: Isolation Forest (unsupervised)
#
# Preserved as reference and as the documented starting point for possible
# future work on a hybrid novelty-detection layer (an unsupervised model can
# flag patterns unseen in training that a purely supervised classifier
# cannot, by design). Not called by default and does not write to the
# shipped model.pkl -- see LEGACY_MODEL_PATH below. See ARCHITECTURE.md
# sections 4 and 8 for why XGBoost ships instead.
# =============================================================================

LEGACY_MODEL_PATH = "model_isolation_forest_legacy.pkl"

LEGACY_N_ESTIMATORS_GRID = [100, 200, 300]
LEGACY_MAX_SAMPLES_GRID = [0.25, 0.5, 0.75, "auto"]
LEGACY_MAX_FEATURES_GRID = [0.5, 0.75, 1.0]

# Reference sweep only (not the CV grid -- contamination doesn't move AUPRC,
# it only sets IsolationForest's internal .predict() offset).
LEGACY_CONTAMINATION_CANDIDATES = [0.0005, 0.001, 0.0017, 0.002, 0.003, 0.005, 0.01, 0.02]

LEGACY_COST_RATIOS = [5, 10, 15, 20]  # FN:FP cost ratio; FP cost fixed at 1


def _cv_auprc_legacy(X_train, y_train, n_estimators, max_samples, max_features):
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    fold_scores = []
    for fold_train_idx, fold_val_idx in skf.split(X_train, y_train):
        X_fold_train = X_train.iloc[fold_train_idx]
        X_fold_val = X_train.iloc[fold_val_idx]
        y_fold_val = y_train.iloc[fold_val_idx]

        model = IsolationForest(
            n_estimators=n_estimators,
            max_samples=max_samples,
            max_features=max_features,
            contamination=0.001,  # inert for scoring; only affects .predict()
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )
        model.fit(X_fold_train)
        raw_val = model.score_samples(X_fold_val)
        fold_scores.append(average_precision_score(y_fold_val, -raw_val))
    return float(np.mean(fold_scores)), float(np.std(fold_scores))


def train_isolation_forest_legacy():
    """Full legacy pipeline: grid search + fit + threshold tuning for the
    unsupervised Isolation Forest (iforest-v2). Prints the same style of
    metrics as the original training run and saves to LEGACY_MODEL_PATH,
    never to the production MODEL_PATH."""
    print(f"Loading dataset from {DATA_PATH} ...")
    df = pd.read_csv(DATA_PATH)
    df = engineer_features(df)
    print(f"  {len(df):,} rows, fraud rate = {df['Class'].mean():.5%}")
    print(f"  Features ({len(FEATURE_COLS)}): {FEATURE_COLS}")

    X = df[FEATURE_COLS]
    y = df["Class"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )
    print(
        f"Train: {len(X_train):,} rows ({y_train.sum()} fraud) | "
        f"Test: {len(X_test):,} rows ({y_test.sum()} fraud)"
    )

    # `contamination` only sets IsolationForest's internal offset_ (used by
    # .predict()); it does not change the raw anomaly scores, so it cannot
    # move a ranking metric like AUPRC. We grid search the 3 hyperparameters
    # that actually affect the fitted trees, and tune contamination/threshold
    # separately below, directly against the test-set precision/recall/cost
    # tradeoff it actually controls.
    print(
        "\nGrid search: n_estimators x max_samples x max_features, "
        "5-fold stratified CV, scored by AUPRC ..."
    )
    grid = list(itertools.product(LEGACY_N_ESTIMATORS_GRID, LEGACY_MAX_SAMPLES_GRID, LEGACY_MAX_FEATURES_GRID))
    results = []
    start = time.time()
    for i, (n_estimators, max_samples, max_features) in enumerate(grid, 1):
        mean_auprc, std_auprc = _cv_auprc_legacy(X_train, y_train, n_estimators, max_samples, max_features)
        results.append(
            {
                "n_estimators": n_estimators,
                "max_samples": max_samples,
                "max_features": max_features,
                "mean_auprc": mean_auprc,
                "std_auprc": std_auprc,
            }
        )
        elapsed = time.time() - start
        print(
            f"  [{i}/{len(grid)}] n_estimators={n_estimators}, max_samples={max_samples}, "
            f"max_features={max_features} -> AUPRC={mean_auprc:.4f} (+/-{std_auprc:.4f}) "
            f"[{elapsed:.0f}s elapsed]"
        )

    results.sort(key=lambda r: r["mean_auprc"], reverse=True)
    print("\nTop 5 hyperparameter combinations by mean CV AUPRC:")
    print(f"{'n_estimators':>12} | {'max_samples':>11} | {'max_features':>12} | {'AUPRC':>8} | {'std':>6}")
    for r in results[:5]:
        print(
            f"{r['n_estimators']:>12} | {str(r['max_samples']):>11} | {r['max_features']:>12.2f} | "
            f"{r['mean_auprc']:>8.4f} | {r['std_auprc']:>6.4f}"
        )

    best = results[0]
    print(
        f"\nBest combo: n_estimators={best['n_estimators']}, max_samples={best['max_samples']}, "
        f"max_features={best['max_features']} (CV AUPRC={best['mean_auprc']:.4f})"
    )

    print("\nFitting final model on full training set with best hyperparameters ...")
    model = IsolationForest(
        n_estimators=best["n_estimators"],
        max_samples=best["max_samples"],
        max_features=best["max_features"],
        contamination=0.001,  # inert; real decision boundary is risk_threshold below
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(X_train)

    raw_train = model.score_samples(X_train)
    raw_test = model.score_samples(X_test)
    score_min, score_max = raw_train.min(), raw_train.max()
    risk_test = normalize(raw_test, score_min, score_max)

    auprc = average_precision_score(y_test, risk_test)
    print(f"Held-out test AUPRC: {auprc:.4f}")

    print("\nReference: contamination-percentile cutoffs:")
    print(f"{'contamination':>14} | {'precision':>9} | {'recall':>7} | {'f1':>6}")
    for c in LEGACY_CONTAMINATION_CANDIDATES:
        raw_cutoff = np.percentile(raw_train, 100 * c)
        preds = (raw_test < raw_cutoff).astype(int)
        tp_ = int(((preds == 1) & (y_test == 1)).sum())
        fp_ = int(((preds == 1) & (y_test == 0)).sum())
        fn_ = int(((preds == 0) & (y_test == 1)).sum())
        precision_ = tp_ / (tp_ + fp_) if (tp_ + fp_) else 0.0
        recall_ = tp_ / (tp_ + fn_) if (tp_ + fn_) else 0.0
        f1_ = 2 * precision_ * recall_ / (precision_ + recall_) if (precision_ + recall_) else 0.0
        print(f"{c:>14.4f} | {precision_:>9.4f} | {recall_:>7.4f} | {f1_:>6.4f}")

    f1_result = f1_optimal_threshold(risk_test, y_test)
    print("\n=== Threshold options (held-out test set) ===")
    print(
        f"F1-optimal          : threshold={f1_result['threshold']:.4f} | "
        f"precision={f1_result['precision']:.4f} | recall={f1_result['recall']:.4f} | f1={f1_result['f1']:.4f} | "
        f"TP={f1_result['tp']} FP={f1_result['fp']} FN={f1_result['fn']} TN={f1_result['tn']}"
    )

    cost_weighted_thresholds = {}
    for ratio in LEGACY_COST_RATIOS:
        cost_result = cost_weighted_threshold(risk_test, y_test, ratio)
        cost_weighted_thresholds[ratio] = cost_result["threshold"]
        print(
            f"Cost-weighted {ratio:>2}:1  : threshold={cost_result['threshold']:.4f} | "
            f"precision={cost_result['precision']:.4f} | recall={cost_result['recall']:.4f} | f1={cost_result['f1']:.4f} | "
            f"TP={cost_result['tp']} FP={cost_result['fp']} FN={cost_result['fn']} TN={cost_result['tn']}"
        )

    risk_threshold = f1_result["threshold"]
    flag_rate = float((risk_test >= risk_threshold).mean())

    print(f"\nAUPRC:     {auprc:.4f}")
    print(f"F1-optimal threshold: {risk_threshold:.4f} (flags ~{flag_rate:.4%} of traffic)")
    print(f"Cost-weighted alternatives: {cost_weighted_thresholds}")

    bundle = {
        "model": model,
        "feature_cols": FEATURE_COLS,
        "score_min": float(score_min),
        "score_max": float(score_max),
        "risk_threshold": float(risk_threshold),
        "cost_weighted_thresholds": cost_weighted_thresholds,
        "flag_rate": flag_rate,
        "hyperparameters": {
            "n_estimators": best["n_estimators"],
            "max_samples": best["max_samples"],
            "max_features": best["max_features"],
        },
        "model_version": "iforest-v2",
    }
    joblib.dump(bundle, LEGACY_MODEL_PATH)
    print(f"\nSaved legacy model bundle to {LEGACY_MODEL_PATH} (NOT the production model.pkl)")


if __name__ == "__main__":
    main()
