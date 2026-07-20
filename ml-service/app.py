"""FastAPI ML Service: scores a single transaction for fraud risk.

Contract: ARCHITECTURE.md sections 5.2 (request) and 5.3 (response).
Production model: XGBoost (supervised) -- see train.py and
ARCHITECTURE.md section 4 for why this replaced the unsupervised
Isolation Forest.
"""

import numpy as np
import joblib
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel

MODEL_PATH = "model.pkl"

app = FastAPI(title="Fraud Detection ML Service")

# Loaded once at process startup, reused across every request.
bundle = joblib.load(MODEL_PATH)
model = bundle["model"]
feature_cols = bundle["feature_cols"]
risk_threshold = bundle["risk_threshold"]
model_version = bundle["model_version"]


class PredictRequest(BaseModel):
    Time: float
    V1: float
    V2: float
    V3: float
    V4: float
    V5: float
    V6: float
    V7: float
    V8: float
    V9: float
    V10: float
    V11: float
    V12: float
    V13: float
    V14: float
    V15: float
    V16: float
    V17: float
    V18: float
    V19: float
    V20: float
    V21: float
    V22: float
    V23: float
    V24: float
    V25: float
    V26: float
    V27: float
    V28: float
    Amount: float


class PredictResponse(BaseModel):
    prediction: str
    riskScore: float
    modelVersion: str


def engineer_features(request: PredictRequest) -> dict:
    """Derive the same engineered features used at training time from the
    raw request fields. The /predict contract itself stays {Time, V1..V28,
    Amount} -- engineering happens inside the service."""
    log_amount = np.log1p(request.Amount)
    hour = (request.Time % 86400) / 3600
    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)
    return {"log_amount": log_amount, "hour_sin": hour_sin, "hour_cos": hour_cos}


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    values = {**request.model_dump(), **engineer_features(request)}
    row = pd.DataFrame([[values[col] for col in feature_cols]], columns=feature_cols)

    risk_score = float(model.predict_proba(row)[0, 1])

    prediction = "fraud" if risk_score >= risk_threshold else "safe"

    return PredictResponse(
        prediction=prediction,
        riskScore=round(risk_score, 4),
        modelVersion=model_version,
    )
