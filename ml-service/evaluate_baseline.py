"""
Standalone comparison: a supervised classifier (XGBoost, or
RandomForestClassifier as a fallback) vs. the shipped Isolation Forest
(iforest-v2), on the identical train/test split and feature set.

Evaluation only. Does not save a model file and does not touch
model.pkl or app.py.
"""

import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import average_precision_score
from sklearn.model_selection import train_test_split

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train  # reuse DATA_PATH, engineer_features, FEATURE_COLS, RANDOM_STATE, normalize

try:
    from xgboost import XGBClassifier

    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

MODEL_PKL_PATH = "model.pkl"
COST_RATIO = 10  # matches the cost-weighted comparison point requested


def compute_threshold_stats(risk, y_true):
    """Same rank-based cumulative-sum technique as train.py: gives the
    exact confusion matrix / precision / recall / F1 at every possible
    threshold in one pass, without rescanning the test set per candidate."""
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


def f1_optimal(risk, y_true):
    stats = compute_threshold_stats(risk, y_true)
    idx = int(np.argmax(stats[3]))  # f1_k
    return _pack(idx, *stats)


def cost_weighted(risk, y_true, ratio):
    scores_sorted, precision_k, recall_k, f1_k, tp_cum, fp_cum, fn_cum, tn_cum = compute_threshold_stats(risk, y_true)
    cost_k = ratio * fn_cum + 1 * fp_cum
    idx = int(np.argmin(cost_k))
    return _pack(idx, scores_sorted, precision_k, recall_k, f1_k, tp_cum, fp_cum, fn_cum, tn_cum)


def print_confusion(result):
    print("Confusion matrix:")
    print("                 predicted safe   predicted fraud")
    print(f"  actual safe    {result['tn']:>14,}   {result['fp']:>15,}")
    print(f"  actual fraud   {result['fn']:>14,}   {result['tp']:>15,}")


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
        f"-> scale_pos_weight={scale_pos_weight:.2f} (no SMOTE / resampling used)"
    )

    if HAS_XGBOOST:
        print("Training XGBoost classifier (supervised, scale_pos_weight set) ...")
        model = XGBClassifier(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.1,
            scale_pos_weight=scale_pos_weight,
            eval_metric="aucpr",
            random_state=train.RANDOM_STATE,
            n_jobs=-1,
        )
        model_name = "XGBoost"
    else:
        print("xgboost not installed -- falling back to RandomForestClassifier(class_weight='balanced') ...")
        model = RandomForestClassifier(
            n_estimators=300,
            class_weight="balanced",
            random_state=train.RANDOM_STATE,
            n_jobs=-1,
        )
        model_name = "RandomForest (balanced)"

    model.fit(X_train, y_train)

    risk_test = model.predict_proba(X_test)[:, 1]
    auprc = average_precision_score(y_test, risk_test)
    print(f"\n{model_name} held-out test AUPRC: {auprc:.4f}")

    sup_f1 = f1_optimal(risk_test, y_test)
    print(
        f"\n{model_name} F1-optimal: threshold={sup_f1['threshold']:.4f} | "
        f"precision={sup_f1['precision']:.4f} | recall={sup_f1['recall']:.4f} | f1={sup_f1['f1']:.4f}"
    )
    print_confusion(sup_f1)

    # --- Live comparison against the shipped iforest-v2 model.pkl --------
    iforest_f1 = iforest_cost = iforest_auprc = None
    try:
        bundle = joblib.load(MODEL_PKL_PATH)
        iforest_model = bundle["model"]
        raw_test = iforest_model.score_samples(X_test)
        iforest_risk_test = train.normalize(raw_test, bundle["score_min"], bundle["score_max"])
        iforest_auprc = average_precision_score(y_test, iforest_risk_test)
        iforest_f1 = f1_optimal(iforest_risk_test, y_test)
        iforest_cost = cost_weighted(iforest_risk_test, y_test, COST_RATIO)
    except FileNotFoundError:
        print(f"\n({MODEL_PKL_PATH} not found -- skipping live iforest-v2 comparison numbers)")

    print("\n=== Side-by-side comparison (held-out test set) ===")
    header = f"{'Model':<28} | {'Threshold':>9} | {'Precision':>9} | {'Recall':>7} | {'F1':>6} | {'AUPRC':>6}"
    print(header)
    print("-" * len(header))
    print(
        f"{model_name + ' (F1-optimal)':<28} | {sup_f1['threshold']:>9.4f} | {sup_f1['precision']:>9.4f} | "
        f"{sup_f1['recall']:>7.4f} | {sup_f1['f1']:>6.4f} | {auprc:>6.4f}"
    )
    if iforest_f1:
        print(
            f"{'iforest-v2 (F1-optimal)':<28} | {iforest_f1['threshold']:>9.4f} | {iforest_f1['precision']:>9.4f} | "
            f"{iforest_f1['recall']:>7.4f} | {iforest_f1['f1']:>6.4f} | {iforest_auprc:>6.4f}"
        )
    if iforest_cost:
        print(
            f"{'iforest-v2 (cost 10:1)':<28} | {iforest_cost['threshold']:>9.4f} | {iforest_cost['precision']:>9.4f} | "
            f"{iforest_cost['recall']:>7.4f} | {iforest_cost['f1']:>6.4f} | {iforest_auprc:>6.4f}"
        )

    # --- Feature importances ----------------------------------------------
    print(f"\n=== {model_name} feature importances ===")
    importances = model.feature_importances_
    ranked = sorted(zip(train.FEATURE_COLS, importances), key=lambda t: t[1], reverse=True)
    for name, imp in ranked:
        marker = "  <- engineered" if name in train.ENGINEERED_FEATURE_COLS else ""
        print(f"  {name:<12} {imp:.4f}{marker}")


if __name__ == "__main__":
    main()
