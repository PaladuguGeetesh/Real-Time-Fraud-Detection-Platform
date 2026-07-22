"""
Standalone comparison: four supervised classifiers -- Logistic Regression,
Random Forest, LightGBM, and XGBoost (the shipped config) -- trained under
identical conditions: same train/test split, same engineered feature set,
same F1-optimal threshold selection. Precision/recall/F1/AUPRC are
therefore directly comparable across models.

No SMOTE or resampling anywhere. Every model handles the ~577:1 class
imbalance via class weighting only (class_weight='balanced', is_unbalance,
or scale_pos_weight, depending on what each library exposes).

Evaluation only. Does not save any model file and does not touch
model.pkl or app.py.
"""

import os
import sys

import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train  # reuse DATA_PATH, engineer_features, FEATURE_COLS, RANDOM_STATE,
# f1_optimal_threshold, XGB_DEFAULT_PARAMS, train_xgboost


def build_models(scale_pos_weight):
    """Every model here is a single direct fit -- no CV / hyperparameter
    search happens in this script, so there's no nested-parallelism
    concern to manage; each n_jobs=-1 below is the only parallelism in
    play for that model. XGBoost is built separately in main() via
    train.train_xgboost() to reuse the exact shipped configuration."""
    return [
        (
            "Logistic Regression",
            Pipeline(
                [
                    # Only Logistic Regression needs feature scaling; the
                    # other three models here are tree-based and scale-invariant.
                    ("scaler", StandardScaler()),
                    (
                        "clf",
                        # n_jobs intentionally omitted: it only parallelizes One-vs-Rest
                        # fits across classes, a no-op for binary classification.
                        #
                        # Fitting this prints a transient RuntimeWarning from scipy's
                        # L-BFGS-B line search (a bad early trial step, given heavy-tailed
                        # Amount + class_weight='balanced' at ~577:1) before it backtracks
                        # and converges normally -- emitted below the Python layer, so it
                        # can't be caught with warnings.catch_warnings(). Verified benign:
                        # results are bit-for-bit deterministic across reruns and change
                        # only mildly and sensibly across C values (0.71-0.72 AUPRC for C
                        # in [0.01, 0.1, 1.0]), so this is not an actual divergence.
                        LogisticRegression(
                            class_weight="balanced",
                            max_iter=1000,
                            random_state=train.RANDOM_STATE,
                        ),
                    ),
                ]
            ),
        ),
        (
            "Random Forest",
            RandomForestClassifier(
                n_estimators=300,
                class_weight="balanced",
                random_state=train.RANDOM_STATE,
                n_jobs=-1,
            ),
        ),
        (
            "LightGBM",
            LGBMClassifier(
                n_estimators=300,
                max_depth=5,
                learning_rate=0.05,
                # scale_pos_weight (not is_unbalance) so this is directly comparable to
                # XGBoost's weighting knob. Full ratio (~577) combined with LightGBM's
                # leaf-wise growth let single heavily-upweighted positive examples
                # dominate a leaf and destabilize training (verified: AUPRC collapsed
                # to 0.009 and validation logloss climbed 2.3->5.5 over 300 rounds).
                # sqrt(ratio) is the standard damping heuristic for tree-based boosters
                # under extreme imbalance -- full-ratio reweighting overshoots far more
                # for trees than for linear models.
                scale_pos_weight=scale_pos_weight**0.5,
                # min_child_samples is a raw sample-count threshold, unaware of the
                # scale_pos_weight-inflated gradient weight -- raising it (default 20)
                # plus L2 leaf regularization (reg_lambda) stops leaves from forming
                # around one or two upweighted examples.
                min_child_samples=100,
                reg_lambda=20,
                random_state=train.RANDOM_STATE,
                n_jobs=-1,
                verbose=-1,
            ),
        ),
    ]


def evaluate_and_record(name, model, X_test, y_test, results):
    risk_test = model.predict_proba(X_test)[:, 1]
    auprc = average_precision_score(y_test, risk_test)
    result = train.f1_optimal_threshold(risk_test, y_test)
    result["auprc"] = auprc
    result["name"] = name
    results.append(result)
    print(
        f"  F1-optimal: threshold={result['threshold']:.4f} | precision={result['precision']:.4f} | "
        f"recall={result['recall']:.4f} | f1={result['f1']:.4f} | AUPRC={auprc:.4f}"
    )


def main():
    print(f"Loading dataset from {train.DATA_PATH} ...")
    df = pd.read_csv(train.DATA_PATH)
    df = train.engineer_features(df)
    print(f"  {len(df):,} rows, fraud rate = {df['Class'].mean():.5%}")
    print(f"  Features ({len(train.FEATURE_COLS)}): {train.FEATURE_COLS}")

    X = df[train.FEATURE_COLS]
    y = df["Class"]

    # Identical split to train.py: same random_state, test_size, stratify.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=train.RANDOM_STATE, stratify=y
    )
    print(
        f"Train: {len(X_train):,} rows ({y_train.sum()} fraud) | "
        f"Test: {len(X_test):,} rows ({y_test.sum()} fraud)"
    )

    neg, pos = int((y_train == 0).sum()), int((y_train == 1).sum())
    scale_pos_weight = neg / pos
    print(
        f"\nClass imbalance in training set: {neg:,} negative / {pos} positive "
        f"-> scale_pos_weight={scale_pos_weight:.2f} (class weighting only, no SMOTE / resampling)"
    )

    results = []

    for name, model in build_models(scale_pos_weight):
        print(f"\nTraining {name} ...")
        model.fit(X_train, y_train)
        evaluate_and_record(name, model, X_test, y_test, results)

    print(f"\nTraining XGBoost (shipped config: {train.XGB_DEFAULT_PARAMS}) ...")
    xgb_model = train.train_xgboost(X_train, y_train, dict(train.XGB_DEFAULT_PARAMS), scale_pos_weight)
    evaluate_and_record("XGBoost (shipped config)", xgb_model, X_test, y_test, results)

    results.sort(key=lambda r: r["auprc"], reverse=True)

    print("\n=== Side-by-side comparison (held-out test set, F1-optimal threshold, sorted by AUPRC) ===")
    header = f"{'Model':<24} | {'Threshold':>9} | {'Precision':>9} | {'Recall':>7} | {'F1':>6} | {'AUPRC':>6}"
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r['name']:<24} | {r['threshold']:>9.4f} | {r['precision']:>9.4f} | "
            f"{r['recall']:>7.4f} | {r['f1']:>6.4f} | {r['auprc']:>6.4f}"
        )


if __name__ == "__main__":
    main()
