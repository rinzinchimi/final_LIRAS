"""Combines the statistical risk score with the trained ML model's predicted
probability into one final 0-100 risk score, and generates a human-readable
inspection recommendation from it (Steps 3 & 10 of the spec)."""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.features import build_feature_frame, build_feature_row

MODEL_DIR = Path(__file__).resolve().parent.parent / "trained_model"

RISK_HIGH_THRESHOLD = 70
RISK_MEDIUM_THRESHOLD = 40

STATISTICAL_WEIGHT = 0.5
ML_WEIGHT = 0.5


class RiskModel:
    """Loads the persisted model artifacts once and exposes scoring helpers."""

    def __init__(self):
        self.model = None
        self.encoder = None
        self.metadata = None
        self.loaded = False
        self.reload()

    def reload(self):
        try:
            self.model = joblib.load(MODEL_DIR / "best_model.joblib")
            self.encoder = joblib.load(MODEL_DIR / "label_encoder.joblib")
            with open(MODEL_DIR / "metadata.json") as f:
                self.metadata = json.load(f)
            self.loaded = True
        except FileNotFoundError:
            self.loaded = False

    def ml_probability_high(self, X: pd.DataFrame) -> np.ndarray:
        """Return, for each row, an ML-derived 0-1 risk intensity: the
        probability of 'High' plus half the probability of 'Medium'."""
        if not self.loaded:
            return np.zeros(len(X))
        proba = self.model.predict_proba(X)
        classes = list(self.encoder.classes_)
        out = np.zeros(len(X))
        if "High" in classes:
            out += proba[:, classes.index("High")]
        if "Medium" in classes:
            out += 0.5 * proba[:, classes.index("Medium")]
        return out

    def predict_category(self, X: pd.DataFrame) -> list[str]:
        if not self.loaded:
            return ["Unknown"] * len(X)
        preds = self.model.predict(X)
        return list(self.encoder.inverse_transform(preds))


risk_model = RiskModel()


def categorize(score: float) -> str:
    if score >= RISK_HIGH_THRESHOLD:
        return "High"
    if score >= RISK_MEDIUM_THRESHOLD:
        return "Medium"
    return "Low"


def blend_scores(employers: pd.DataFrame) -> pd.DataFrame:
    """Adds ml_probability, final_risk_score and final_risk_category columns."""
    df = employers.copy()
    X = build_feature_frame(df)

    # Align to the exact training-time columns (new sectors/dzongkhags -> 0 cols)
    if risk_model.loaded:
        ref_cols = risk_model.metadata["feature_columns"]
        for c in ref_cols:
            if c not in X.columns:
                X[c] = 0
        X = X[ref_cols]
        df["ml_probability"] = risk_model.ml_probability_high(X)
        df["ml_predicted_category"] = risk_model.predict_category(X)
    else:
        df["ml_probability"] = 0.0
        df["ml_predicted_category"] = "Unknown"

    df["final_risk_score"] = (
        STATISTICAL_WEIGHT * df["statistical_score"] +
        ML_WEIGHT * (df["ml_probability"] * 100)
    ).round(2)
    df["final_risk_category"] = df["final_risk_score"].apply(categorize)
    return df


def recommend(risk_category: str, row: dict) -> str:
    """Generates an inspection-priority recommendation from the model output
    and the employer's own history (Step 10)."""
    osh = row.get("osh_violation_count", 0) or 0
    penalties = row.get("penalty_memos", 0) or 0
    days_since = row.get("days_since_last_inspection", 0) or 0
    violation_rate = row.get("violation_rate", 0) or 0

    if risk_category == "High":
        if osh >= 2:
            return "Conduct inspection within 7 days due to repeated OSH violations."
        if penalties >= 2:
            return "Conduct inspection within 7 days due to repeated penalty notices."
        return "Conduct inspection within 7 days - high combined statistical and AI risk score."
    if risk_category == "Medium":
        if days_since > 180:
            return "Schedule inspection within one month - compliance has not been re-checked recently."
        if violation_rate > 0.5:
            return "Schedule inspection within one month due to an elevated violation rate."
        return "Schedule inspection within one month as a precautionary follow-up."
    return "Routine inspection is sufficient based on current compliance history."


def explain(row: dict) -> list[str]:
    """Short AI-explanation bullet points for the employer detail page."""
    reasons = []
    if (row.get("penalty_memos") or 0) > 0:
        reasons.append(f"{int(row['penalty_memos'])} penalty memo(s) on record.")
    if (row.get("improvement_notices") or 0) > 0:
        reasons.append(f"{int(row['improvement_notices'])} improvement notice(s) issued.")
    if (row.get("osh_violation_count") or 0) > 0:
        reasons.append(f"{int(row['osh_violation_count'])} occupational health & safety violation(s) detected.")
    if (row.get("total_penalty_amount") or 0) > 0:
        reasons.append(f"Cumulative penalty amount of Nu. {row['total_penalty_amount']:.0f}.")
    if (row.get("violation_rate") or 0) > 1:
        reasons.append("Multiple violations recorded per inspection visit.")
    if (row.get("days_since_last_inspection") or 0) > 365:
        reasons.append("Over a year since the last recorded inspection.")
    if row.get("sector") == "Construction":
        reasons.append("Construction sector carries elevated baseline workplace hazards.")
    if not reasons:
        reasons.append("No significant risk indicators found in inspection history.")
    return reasons
