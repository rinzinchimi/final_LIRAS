"""Scores a single, not-yet-in-database employer from a risk-assessment form
submission (POST /predict). Combines the same rule-based statistical
formula the batch pipeline uses (services.data_pipeline.WEIGHTS) with a live
prediction from the trained ML model, so a brand-new employer with only a
handful of known facts still gets a real, data-grounded 0-100 score."""
from __future__ import annotations

from ml.features import build_feature_row
from services.recommendation import build_recommendation_payload
from services.risk_engine import categorize, risk_model

INDUSTRY_TO_SECTOR = {
    "construction": "Construction",
    "manufacturing": "Manufacturing",
    "service": "Other Services",
    "agriculture": "Agriculture, forestry and fishing",
}


def _statistical_component(payload: dict) -> float:
    """Same weighting logic as the historical statistical score (Step 3),
    applied to the raw facts collected on the assessment form."""
    violations = payload.get("previous_violations", 0)
    complaints = payload.get("worker_complaints", 0)
    accidents = payload.get("workplace_accidents", 0)
    osh = payload.get("osh_violations", 0)
    employees = payload.get("employees", 0) or 0
    industry = payload.get("industry", "")

    score = violations * 10 + complaints * 8 + accidents * 15 + osh * 10
    if industry == "construction":
        score += 20
    if employees and employees > 200:
        score += 10
    return float(min(100, max(0, score)))


def predict_employer(payload: dict) -> dict:
    statistical_score = _statistical_component(payload)

    sector = INDUSTRY_TO_SECTOR.get(payload.get("industry", ""), "Other")
    feature_payload = {
        "industry_label": sector,
        "dzongkhag": payload.get("dzongkhag") or "Other",
        "total_inspections": max(1, payload.get("total_inspections", 1)),
        "improvement_notices": 0,
        "penalty_memos": payload.get("penalty_memos", payload.get("previous_violations", 0)),
        "total_penalty_amount": payload.get("total_penalty_amount", 0),
        "osh_violations": payload.get("osh_violations", 0),
        "osh_ratio": (
            payload.get("osh_violations", 0) /
            max(1, payload.get("previous_violations", 0) + payload.get("osh_violations", 0))
        ),
        "days_since_last_inspection": payload.get("days_since_last_inspection", 365),
        "inspection_frequency": 1.0,
        "violation_rate": payload.get("previous_violations", 0) / max(1, payload.get("total_inspections", 1)),
    }

    ml_probability = 0.0
    if risk_model.loaded:
        ref_cols = risk_model.metadata["feature_columns"]
        X = build_feature_row(feature_payload, ref_cols)
        ml_probability = float(risk_model.ml_probability_high(X)[0])

    final_score = round(0.5 * statistical_score + 0.5 * (ml_probability * 100), 2)
    risk_category = categorize(final_score)

    rec_payload = build_recommendation_payload(risk_category, {
        "osh_violation_count": payload.get("osh_violations", 0),
        "penalty_memos": payload.get("penalty_memos", payload.get("previous_violations", 0)),
        "improvement_notices": 0,
        "days_since_last_inspection": payload.get("days_since_last_inspection", 365),
        "violation_rate": feature_payload["violation_rate"],
        "total_penalty_amount": payload.get("total_penalty_amount", 0),
        "sector": sector,
    })

    return {
        "employer_name": payload.get("employer_name", "New Employer"),
        "risk_score": final_score,
        "risk_category": risk_category,
        "statistical_score": statistical_score,
        "ml_probability": round(ml_probability, 4),
        "recommendation": rec_payload["recommendation"],
        "explanation": rec_payload["explanation"],
    }
