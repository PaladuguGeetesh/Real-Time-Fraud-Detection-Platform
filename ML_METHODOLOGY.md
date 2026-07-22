# Fraud Detection ML Service — Methodology, Results & Rationale

> Companion document to `ARCHITECTURE.md`. This one is the deep dive: every model we tried, every number we measured, why we changed course, and what's left for the future. Written to be read start to finish, or used as interview prep material.

---

## 1. The Problem

**284,807 transactions. 492 are fraud. That's 0.17% — roughly 1 in 580.**

This single fact drives every decision in this document. Extreme class imbalance breaks the obvious approach (plain accuracy is meaningless — predicting "not fraud" for everything scores 99.83%) and shapes which models are even viable.

**Dataset:** Kaggle Credit Card Fraud Detection (mlg-ulb). Columns: `Time`, `V1`–`V28` (PCA-anonymized features), `Amount`, `Class` (0 = legit, 1 = fraud).

**Why accuracy is not one of the metrics:** with 99.83% of transactions legitimate, a model that predicts "not fraud" for everything scores 99.83% accuracy while catching zero fraud. Accuracy is meaningless under this imbalance. The metrics below are used instead.

---

## 1a. The Metrics — Definitions, Formulas, and How to Weigh Them

Everything is built from four possible outcomes each time the model judges a transaction:

| Outcome | Meaning | Real-world cost |
|---|---|---|
| **True Positive (TP)** | Fraud, correctly flagged as fraud | ✅ Caught — money saved |
| **False Negative (FN)** | Fraud, wrongly called safe | ❌ Missed fraud — money lost, unrecoverable |
| **False Positive (FP)** | Legit, wrongly flagged as fraud | ⚠️ False alarm — wastes analyst time / annoys customer |
| **True Negative (TN)** | Legit, correctly left alone | ✅ Correct, no action |

Reference confusion matrix (shipped XGBoost, held-out test): **TP=81, FP=3, FN=17, TN=56,861.**

### Precision — "when the model cries fraud, how often is it right?"

**Formula:** `Precision = TP / (TP + FP)`
**Shipped model:** 81 / (81 + 3) = **0.964**

Of everything flagged as fraud, 96% actually was. Measures *how much an alarm can be trusted*. Low precision = the model cries wolf; analysts waste time on false alarms and eventually stop trusting the system.

### Recall — "of all real fraud, how much did we catch?"

**Formula:** `Recall = TP / (TP + FN)`
**Shipped model:** 81 / (81 + 17) = **0.827**

Of all actual fraud that existed, 83% was caught; 17 frauds slipped through. Measures *how much fraud escapes*. **In this project, recall is the metric most directly tied to money** — every false negative is a fraud that went through undetected, and that loss is unrecoverable. Higher recall = catching more fraud = less money lost. This is exactly why the unsupervised Isolation Forest's ~68% recall ceiling was disqualifying: a third of fraud escaping is hard to defend when the fix (a supervised model) exists.

### The precision/recall tradeoff (the key tension)

Precision and recall **pull against each other**. Flag more aggressively → catch more fraud (↑recall) but raise more false alarms (↓precision). Flag only when highly certain → fewer false alarms (↑precision) but miss borderline fraud (↓recall). There is no free lunch — every model sits at *some* point on this tradeoff, and the threshold chooses where.

### Threshold — the dial that picks your point on the tradeoff

The model outputs a probability (`riskScore`, 0–1). The threshold is the cutoff that converts it to a decision: `riskScore >= threshold → "fraud"`. It is **not learned** — it's a business decision layered on top of the model. Lower threshold → higher recall, lower precision. Higher threshold → higher precision, lower recall. The shipped threshold (0.9653) was chosen by explicit precision/recall/cost analysis, not left at the default 0.5.

### F1 — one number balancing precision and recall

**Formula:** `F1 = 2 × (Precision × Recall) / (Precision + Recall)` (the *harmonic* mean)
**Shipped model:** **0.890**

The harmonic mean (not a plain average) *punishes imbalance* — it only stays high when *both* precision and recall are high. A model with 100% precision but 5% recall averages to 52% but has an F1 of ~9%, correctly exposing that it catches almost no fraud. Use F1 as a single at-a-glance quality score *at one chosen threshold*.

### AUPRC — how good the model is across ALL thresholds

**What it is:** Area Under the Precision-Recall Curve. Sweep the threshold from 0 to 1, record precision and recall at every point, plot the curve, measure the area under it. A single value 0–1.
**Shipped model:** **0.881**

Precision, recall, and F1 are all measured *at one threshold*. AUPRC removes threshold choice entirely — it measures the model's **fundamental ranking ability**: how well it pushes real fraud toward high scores and legit transactions toward low scores, regardless of any cutoff. This is *the* gold-standard metric for imbalanced problems, and the one to trust most when **comparing models**, because it judges the model itself, not a threshold pick. It's also why the Isolation Forest story mattered: its low AUPRC (0.28) meant the underlying *ranking* was weak — a limit no threshold could fix — whereas XGBoost's 0.88 meant the ranking was genuinely strong.

### How to weigh them in this project

1. **AUPRC first, to compare models** — threshold-independent, so it fairly ranks which model is fundamentally best at the task.
2. **Recall next, because this is fraud** — missed fraud (FN) is unrecoverable money, a false alarm (FP) is a minor annoyance; the asymmetry means we lean toward protecting recall when choosing the final threshold.
3. **Precision as the constraint** — recall must stay high without drowning analysts in false alarms, or they stop trusting the system.
4. **F1 as the convenient summary** at the chosen threshold.

**One-line mental model:** *AUPRC tells you which model is smartest; the threshold lets you choose how aggressive to be; precision and recall tell you what that choice costs in false alarms vs. missed fraud; F1 sums it up in one number.*

---

## 2. Approach 1: Isolation Forest (Unsupervised)

### 2.1 Why we started here

Isolation Forest is an **unsupervised anomaly detector**. It never sees the `Class` label during training — it learns what "normal" transactions look like and flags statistical outliers. It isolates points by random recursive splitting; anomalies take fewer splits to isolate than normal points, so short average path length = high anomaly score.

**Original rationale:**
- No label dependency — useful when confirmed fraud labels are scarce or delayed
- Better theoretical resistance to fraud pattern drift, since it isn't memorizing past fraud examples
- Doesn't require balanced/resampled training data

### 2.2 Baseline result (v1 — no feature engineering, default hyperparameters)

| Metric | Value |
|---|---|
| Contamination | 0.0017 (matched real fraud rate) |
| Precision | 0.311 |
| Recall | 0.337 |
| F1 | 0.324 |
| AUPRC | 0.218 |

Confusion matrix (98 fraud in test set): **TP=33, FP=73, FN=65**

**Reading it:** roughly 2 out of 3 actual frauds went undetected at this threshold.

### 2.3 Improvement pass (v2 — feature engineering + hyperparameter tuning)

**Feature engineering added:**
- `log_amount` = log1p(Amount) — fraud amounts cluster differently on a log scale
- `hour_sin`, `hour_cos` — cyclical encoding of hour-of-day, derived from `Time % 86400 / 3600`, since raw seconds-since-start carries no time-of-day signal on its own

**Hyperparameter grid search** (36 combinations of `n_estimators` × `max_samples` × `max_features`, scored by 5-fold CV AUPRC; `contamination` excluded from this grid since it only affects `.predict()`'s cutoff, not the underlying anomaly scores AUPRC evaluates):

| n_estimators | max_samples | max_features | AUPRC |
|---|---|---|---|
| 300 | 0.5 | 0.75 | 0.2661 |
| 200 | 0.5 | 0.75 | 0.2630 |
| 300 | 0.75 | 0.75 | 0.2627 |
| 300 | 0.25 | 0.75 | 0.2594 |
| 300 | 0.25 | 0.5 | 0.2569 |

**Key finding:** the default `max_samples='auto'` (≈256 rows/tree) was actively the *worst* performer across every configuration tested — too little data per tree to isolate rare patterns well. `max_samples=0.5` (using half the dataset per tree) won decisively.

**Result at F1-optimal threshold (0.3534):**

| Metric | v1 | v2 | Change |
|---|---|---|---|
| Precision | 0.311 | 0.326 | +5% |
| Recall | 0.337 | 0.469 | **+39%** |
| F1 | 0.324 | 0.385 | +19% |
| AUPRC | 0.218 | 0.282 | **+30%** |

Confusion matrix: **TP=46, FP=95, FN=52**

### 2.4 Threshold optimization — cost-weighted analysis

Reasoning: this system feeds a human-reviewed dashboard, not an autonomous blocker. A missed fraud (false negative) costs real, unrecoverable money; a false alarm costs an analyst a few seconds. That asymmetry justifies weighting false negatives more heavily than a plain F1 optimum would.

| FN:FP cost ratio | Threshold | Precision | Recall | F1 | TP | FP | FN | Total cost |
|---|---|---|---|---|---|---|---|---|
| F1-optimal (5:1 also lands here) | 0.3534 | 0.326 | 0.469 | 0.385 | 46 | 95 | 52 | 355 |
| **10:1** | **0.2606** | **0.209** | **0.653** | **0.317** | **64** | **242** | **34** | **582** |
| 15:1 | 0.2486 | 0.197 | 0.684 | 0.306 | 67 | 273 | 31 | 738 |
| 20:1 | 0.2486 | 0.197 | 0.684 | 0.306 | 67 | 273 | 31 | 893 |

**Critical finding — the recall plateau:** recall caps out at **~68% no matter how aggressively false negatives are weighted.** Past the 15:1 ratio, no threshold reduces cost further, even at 20:1 — the remaining uncaught frauds are too entangled with legitimate transactions in the raw anomaly score to be separable *at any threshold*. This is not a threshold-tuning problem; it is a **ranking-quality ceiling** intrinsic to the unsupervised approach on this feature space.

**10:1 was selected** as the best point on the tradeoff curve — the marginal trade from 10:1→15:1 (+3 TP for +31 FP) is unfavorable, confirming 10:1 sits at the last genuinely favorable point.

### 2.5 Why the unsupervised approach ultimately failed to be the right choice

The plateau in §2.4 answered the open question directly: is ~68% recall a limit of *this dataset*, or specifically a limit of *this method*? Section 3 answers that conclusively — it was the method.

**In plain terms:** Isolation Forest detects *unusual*, not *fraudulent* — and those aren't the same thing. A legitimate large purchase looks statistically unusual too, so the model confuses "different" with "bad." It hits a hard ceiling because it fundamentally cannot use the one signal that would resolve that confusion: the label itself.

---

## 3. Approach 2: XGBoost (Supervised)

### 3.1 Why we evaluated it

`Class` labels exist in this dataset and, in real fraud systems, in production too (chargebacks and disputes eventually confirm ground truth). The original "unsupervised is more realistic" framing understated this — real payment companies predominantly run supervised gradient-boosted trees as their primary fraud model, retrained on rolling labeled windows. Given labels are available, using them was worth testing directly rather than assumed away.

### 3.2 Method

- Same train/test split and same engineered features as Isolation Forest v2 (`Time`, `V1`–`V28`, `Amount`, `log_amount`, `hour_sin`, `hour_cos`), for an apples-to-apples comparison
- `scale_pos_weight` set to the actual class imbalance ratio (no SMOTE / synthetic resampling)
- `n_jobs=-1` for full multi-core training
- F1-optimal threshold selection, same methodology as the Isolation Forest evaluation

### 3.3 Classifier, not regressor — and what `riskScore` actually is

This is a common point of confusion, worth being precise about since `riskScore` (e.g. `0.9987`) *looks* like it could be a regression output — it's a continuous number between 0 and 1. It isn't. This matters enough to spell out clearly:

**The model used is `XGBClassifier`, doing binary classification** — not `XGBRegressor`. The question being answered is categorical: *"is this transaction fraud or not?"* — exactly two classes (`Class` = 0 or 1). Regression would instead predict some continuous real-world quantity directly (e.g. "predict the dollar amount likely lost") — a different problem, and not the one being solved here. The evidence in the code confirms it: `scale_pos_weight` (a classification imbalance parameter), a confusion matrix (TP/FP/TN/FN — meaningless for regression), and `predict_proba` (a classifier-only method) all only exist on the classification side.

**So where does the continuous 0–1 `riskScore` come from, if it's a classifier?**

XGBoost's binary classifier is trained with a **logistic (sigmoid) objective** — `binary:logistic` — which is specifically built to output a well-calibrated probability, not just a raw label. So the model doesn't just say "fraud" or "safe" — it says *how confident* it is, e.g. "99.87% sure this is fraud." That confidence value, exposed via `predict_proba`, **is** `riskScore`. It's still fundamentally a classification output — probability of class membership — not a regression prediction of some independent continuous target.

The **threshold (0.9653)** is what turns that probability back into the final binary decision the system actually acts on: `riskScore >= 0.9653` → `"fraud"`, otherwise `"safe"`. This is why the threshold exists at all — the model always outputs a probability; the threshold is a separate, deliberately-tuned decision boundary layered on top (see §3.4 for why the default 0.5 boundary wasn't used).

**One-sentence summary to have ready:** *"I used XGBoost's binary logistic objective and took the predicted probability as the risk score, then applied a tuned threshold (0.9653) to convert that probability into a final fraud/safe decision."*

### 3.4 Result

| Metric | Value |
|---|---|
| Threshold | 0.9653 |
| Precision | 0.9643 |
| Recall | 0.8265 |
| F1 | 0.8901 |
| AUPRC | 0.8807 |

Confusion matrix (same 98-fraud test set): **TP=81, FP=3, FN=17, TN=56,861**

**In plain terms:** catches 81 of 98 test-set frauds, with only 3 false alarms across 56,965 transactions.

### 3.5 Feature importance

| Feature | Importance | Note |
|---|---|---|
| V14 | 0.53 | Dominant — matches published analyses of this dataset |
| V4 | — | Secondary signal |
| V12 | — | Secondary signal |
| V10 | — | Secondary signal |
| hour_cos | 0.0095 | Mild signal |
| hour_sin | 0.0068 | Mild signal |
| log_amount | 0.0000 | **Fully redundant** — see §3.5 |

### 3.6 Hyperparameter tuning — verification pass

A `RandomizedSearchCV` pass (20 of 81 combinations, 5-fold stratified CV, scored by AUPRC) was run over `max_depth`, `learning_rate`, `n_estimators`, and `min_child_weight` to check whether the default configuration was leaving performance on the table.

| max_depth | learning_rate | n_estimators | min_child_weight | CV AUPRC |
|---|---|---|---|---|
| 5 | 0.20 | 200 | 3 | 0.8495 |
| 5 | 0.20 | 300 | 3 | 0.8492 |
| 5 | 0.20 | 200 | 5 | 0.8472 |
| 7 | 0.10 | 200 | 3 | 0.8443 |
| 7 | 0.20 | 200 | 1 | 0.8438 |

**Best tuned config:** CV AUPRC 0.8495. **Shipped default config:** CV AUPRC 0.8494 (scored under the identical CV protocol for a fair comparison). **Improvement: +0.01% relative** — statistically indistinguishable from the default, well under the 3% bar set for adopting a change. The defaults were kept, and this attempt is documented rather than silently skipped. Final held-out test metrics are unchanged from §3.3 (precision 0.9643, recall 0.8265, F1 0.8901, AUPRC 0.8807).

**Two implementation issues caught and fixed during this pass, worth remembering:**
- **Library incompatibility:** `xgboost==2.1.3` crashed inside `RandomizedSearchCV`/`cross_val_score` under `scikit-learn==1.6.0`, due to a `__sklearn_tags__` interface change introduced in sklearn 1.6. Fixed by upgrading to `xgboost==2.1.4`, verified in isolation before rerunning the full search.
- **Nested parallelism:** running `RandomizedSearchCV` with `n_jobs=-1` while the inner `XGBClassifier` also used `n_jobs=-1` would oversubscribe CPU cores (two competing layers of parallelism), actually *hurting* throughput. Fixed by setting the inner estimator to `n_jobs=1` during the search while keeping `n_jobs=-1` on the outer search and on the final production model.

### 3.7 An interesting, worth-remembering nuance

`log_amount` **helped** Isolation Forest (part of the +39% recall gain in v2) but was **completely unused** by XGBoost. Same engineered feature, opposite value, depending on the model. Explanation: XGBoost already has enough discriminating signal in V14/V4/V12/V10 (and raw `Amount`) that the engineered log-transform adds nothing new once label-informed splits are available. Isolation Forest, lacking access to labels, needed the extra structure to isolate on. This is a good example of why "feature importance" is always *model-relative*, not an absolute property of a feature.

### 3.8 Which supervised model? — comparison across four

Having established that supervised beats unsupervised, the next question was *which* supervised model. Four were benchmarked on the identical train/test split and feature set (`compare_supervised_models.py`), spanning the major algorithm families: linear (Logistic Regression), bagging ensemble (Random Forest), and boosting ensembles (XGBoost, LightGBM). All used class-weighting for imbalance, no SMOTE.

| Model | Threshold | Precision | Recall | F1 | AUPRC |
|---|---|---|---|---|---|
| **XGBoost (shipped)** | 0.9653 | 0.9643 | 0.8265 | **0.8901** | **0.8807** |
| LightGBM | 0.7093 | 0.9111 | 0.8367 | 0.8723 | 0.8798 |
| Random Forest | 0.2867 | 0.9318 | 0.8367 | 0.8817 | 0.8698 |
| Logistic Regression | 1.0000 | 0.8333 | 0.8163 | 0.8247 | 0.7208 |

**Reading it:** the three tree ensembles cluster tightly at 0.87–0.88 AUPRC — a genuine three-way near-tie, not a clear win. XGBoost edges the others by a margin (0.0009 over LightGBM) small enough to be noise; a different random seed could reshuffle the top three. Logistic Regression sits meaningfully behind at 0.72 AUPRC — the expected result for a *linear* model on a feature set where fraud depends on non-linear interactions. That gap actually validates the comparison: if the linear model had tied the ensembles, *that* would have been the suspicious result.

**Why XGBoost was kept despite the near-tie:** since the top three are statistically indistinguishable, the choice comes down to tiebreakers rather than raw score — XGBoost is the industry-standard gradient booster for imbalanced tabular problems, handles imbalance cleanly via `scale_pos_weight`, and is well-supported for production serving. Random Forest or LightGBM would have been equally defensible choices. The honest framing is "these three were tied; XGBoost was chosen on tiebreakers," not "XGBoost was measurably best."

---

## 4. Full Comparison — Every Method Tried

| Model | Threshold strategy | Precision | Recall | F1 | AUPRC |
|---|---|---|---|---|---|
| Isolation Forest v1 (baseline) | F1-optimal | 0.311 | 0.337 | 0.324 | 0.218 |
| Isolation Forest v2 (engineered + tuned) | F1-optimal | 0.326 | 0.469 | 0.385 | 0.282 |
| Isolation Forest v2 (engineered + tuned) | Cost-weighted 10:1 | 0.209 | 0.653 | 0.317 | 0.282 |
| **XGBoost (shipped)** | **F1-optimal** | **0.9643** | **0.8265** | **0.8901** | **0.8807** |

**The gap is decisive, not marginal.** XGBoost's AUPRC (0.881) is roughly **3.1x** Isolation Forest v2's best (0.282). This confirms the recall plateau observed in §2.4 was a ceiling of the *unsupervised method*, not of the underlying data — the separable signal was present all along; only a label-aware model could reach it.

---

## 5. Final Decision & Rationale

**Shipped: XGBoost as the sole production model** (`modelVersion: xgboost-v1`).

**Why, in one paragraph:** Labels are available in this dataset, exactly as they are in real production fraud systems (confirmed via chargebacks/disputes). Given that, the original justification for unsupervised-only ("more realistic," "drift-resistant") didn't hold up against the measured gap — a 96%-precision/83%-recall model versus a 21%-precision/65%-recall model isn't a close call once real money is on the line. The correct real-world engineering decision is to use the label when it exists.

**What was NOT thrown away:** the Isolation Forest pipeline (feature engineering, hyperparameter grid, cost-weighted thresholding) is preserved verbatim in its own standalone script, `train_isolation_forest_legacy.py`, saving to a separate `model_isolation_forest_legacy.pkl`. It shares core utilities (feature engineering, thresholding helpers) with `train.py` via import, so both stay in sync, but it never runs as part of `train.py`, never touches the production `model.pkl`, and is not used by `app.py`. `train.py` itself now contains only the XGBoost production path — no Isolation Forest code at all. The legacy script remains fully reproducible as:
1. The evaluation baseline that justified the XGBoost decision
2. Documented future work (see §6)

**Architecture impact:** `ARCHITECTURE.md` §4 and §5.3 were revised to reflect this evidence-based decision, replacing the original "unsupervised, no label leakage" framing. This is treated as a deliberate, documented course-correction — not a reversal to be hidden.

---

## 6. Future Development

Ideas worth pursuing if this project continues past the current scope, roughly ordered by value:

1. **Hybrid layered system** — XGBoost as primary scorer, Isolation Forest reintroduced as a secondary "novelty" signal specifically for transactions that don't resemble *any* labeled fraud example. This is the one thing XGBoost structurally cannot do (it only recognizes patterns it has seen labels for) and mirrors how mature production fraud systems are actually layered.
2. **Periodic retraining pipeline** — real fraud patterns drift; a scheduled retrain on a rolling labeled window (e.g. weekly) would keep XGBoost current rather than static.
3. **SHAP-based explainability** — XGBoost's main real weakness versus a single decision tree is interpretability. SHAP values would let individual flagged transactions be explained ("flagged because of V14, V4 contribution") — valuable for analyst trust and any regulatory explainability requirement.
4. **Light hyperparameter search on XGBoost** — `max_depth`, `learning_rate`, `n_estimators`, `min_child_weight` via RandomizedSearchCV. Expected to yield modest gains given the model is already strong (0.88 AUPRC) — worth doing for rigor, not because large gains are expected.
5. **Model calibration** — confirm `predict_proba` output is a well-calibrated probability (e.g. via a reliability diagram / Platt scaling check), since the dashboard surfaces `riskScore` directly to analysts as if it were a real probability.
6. **Alternative gradient boosting libraries** — LightGBM or CatBoost as a quick comparison; unlikely to meaningfully beat XGBoost here, but a cheap sanity check and a reasonable "did you consider alternatives" interview answer.
7. **Real-time drift monitoring** — track incoming feature distributions and prediction confidence over time in production to detect when a retrain is actually needed, rather than retraining on a fixed schedule blindly.

---

## 7. Key Concepts Glossary (interview-ready)

| Term | Plain explanation |
|---|---|
| **Class imbalance** | When one outcome (fraud) is far rarer than the other. Breaks accuracy as a metric; requires precision/recall/AUPRC instead. |
| **Unsupervised anomaly detection** | Learns what "normal" looks like, flags deviations. No labels needed. Isolation Forest. |
| **Supervised classification** | Learns directly from labeled examples what fraud looks like. XGBoost. |
| **Boosting** | Trees built sequentially, each correcting the previous trees' errors. (XGBoost) |
| **Bagging** | Trees built independently in parallel, then averaged. (Random Forest) |
| **`scale_pos_weight`** | XGBoost's lever for imbalance — roughly (negative count / positive count) — tells the model to weight the rare class more heavily. |
| **AUPRC** | Precision-Recall AUC — the standard, imbalance-robust benchmark metric (vs. ROC-AUC, which can look artificially good under heavy imbalance). |
| **F1-optimal threshold** | The probability cutoff that maximizes the harmonic mean of precision and recall. |
| **Cost-weighted threshold** | A cutoff chosen to minimize a weighted cost function (e.g. 10×FN + FP), reflecting that a missed fraud is more expensive than a false alarm. |
| **Feature importance** | How much a feature contributed to a specific model's predictions — always relative to that model, not an absolute property (see §3.5). |
| **Overfitting** | Model memorizes training data instead of learning generalizable patterns; performs well in training, poorly on new data. |
| **Recall plateau** | When no threshold adjustment can raise recall further — a sign the model's underlying ranking quality, not the threshold, is the limiting factor. |

---

## 8. One-Paragraph Summary (the elevator version)

We started with Isolation Forest, an unsupervised anomaly detector, on the theory that not needing fraud labels is more realistic and resistant to pattern drift. After feature engineering (log-amount, cyclical time encoding) and a full hyperparameter grid search, it improved substantially (AUPRC 0.218→0.282, recall 34%→65% at a cost-weighted threshold) but hit a hard recall ceiling around 68% regardless of tuning — a ranking-quality limit, not a threshold problem. We then benchmarked XGBoost, a supervised model that *does* use the fraud labels available in this dataset (as real production fraud systems also do), and it reached 96% precision / 83% recall / 0.88 AUPRC — roughly 3x the AUPRC of the tuned unsupervised model. Given that gap and the fact that labels genuinely are available in this domain, we shipped XGBoost as the production model, kept the Isolation Forest pipeline as a fully reproducible evaluation baseline, and documented a hybrid layered architecture (XGBoost primary + Isolation Forest as a novel-fraud safety net) as the natural next step.
