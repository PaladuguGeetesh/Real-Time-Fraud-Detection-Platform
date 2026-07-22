"""
LEGACY / EVALUATION-ONLY: Isolation Forest (unsupervised).

Standalone script -- not part of the production training path. Preserved
as reference and as the documented starting point for possible future
work on a hybrid novelty-detection layer (an unsupervised model can flag
patterns unseen in training that a purely supervised classifier cannot,
by design). Run directly with `python train_isolation_forest_legacy.py`;
it is never imported or invoked by train.py.

Saves to LEGACY_MODEL_PATH (model_isolation_forest_legacy.pkl), completely
separate from the production model.pkl. See ARCHITECTURE.md sections 4
and 8, and train.py's module docstring, for why XGBoost ships instead.
"""

import itertools
import os
import sys
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score
from sklearn.model_selection import StratifiedKFold, train_test_split

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import (  # reuse the production module's shared utilities verbatim
    DATA_PATH,
    FEATURE_COLS,
    RANDOM_STATE,
    cost_weighted_threshold,
    engineer_features,
    f1_optimal_threshold,
)

LEGACY_MODEL_PATH = "model_isolation_forest_legacy.pkl"

LEGACY_N_ESTIMATORS_GRID = [100, 200, 300]
LEGACY_MAX_SAMPLES_GRID = [0.25, 0.5, 0.75, "auto"]
LEGACY_MAX_FEATURES_GRID = [0.5, 0.75, 1.0]

# Reference sweep only (not the CV grid -- contamination doesn't move AUPRC,
# it only sets IsolationForest's internal .predict() offset).
LEGACY_CONTAMINATION_CANDIDATES = [0.0005, 0.001, 0.0017, 0.002, 0.003, 0.005, 0.01, 0.02]

LEGACY_COST_RATIOS = [5, 10, 15, 20]  # FN:FP cost ratio; FP cost fixed at 1


def normalize(raw_scores, score_min, score_max):
    """Map IsolationForest raw scores (higher = more normal) to a
    0.0-1.0 risk score where higher = riskier."""
    denom = score_max - score_min
    risk = (score_max - raw_scores) / denom
    return np.clip(risk, 0.0, 1.0)


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
    train_isolation_forest_legacy()
