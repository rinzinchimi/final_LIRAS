"""Builds the numeric feature matrix used by the ML models, for both
training (from the cleaned employer dataset) and inference (from a single
new employer/prediction request).
"""
from __future__ import annotations

import pandas as pd

NUMERIC_FEATURES = [
    "total_inspections",
    "improvement_notices",
    "penalty_memos",
    "total_penalty_amount",
    "osh_violation_count",
    "osh_ratio",
    "days_since_last_inspection",
    "inspection_frequency",
    "violation_rate",
]

CATEGORICAL_FEATURES = ["sector", "dzongkhag"]

ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

TOP_SECTORS = [
    "Construction", "Manufacturing", "Accommodation and Food service activities",
    "Other Services", "Professional, scientific and technical services",
    "Wholesale and retail trade",
]


def _bucket_sector(sector: str) -> str:
    return sector if sector in TOP_SECTORS else "Other"


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    """From the employer-level dataframe, build the X matrix (numeric + one-hot)."""
    work = df.copy()
    work["sector_bucketed"] = work["sector"].apply(_bucket_sector)

    X_numeric = work[NUMERIC_FEATURES].fillna(0)
    X_sector = pd.get_dummies(work["sector_bucketed"], prefix="sector")
    X_dzongkhag_top = work["dzongkhag"].where(
        work["dzongkhag"].isin(work["dzongkhag"].value_counts().head(8).index), "Other")
    X_dzongkhag = pd.get_dummies(X_dzongkhag_top, prefix="dzongkhag")

    X = pd.concat([X_numeric, X_sector, X_dzongkhag], axis=1)
    return X


def build_feature_row(payload: dict, reference_columns: list[str]) -> pd.DataFrame:
    """Build a single-row feature frame for a live prediction request, aligned
    to the exact column set the model was trained on."""
    sector = _bucket_sector(payload.get("industry_label", "Other"))
    dzongkhag = payload.get("dzongkhag", "Other")

    row = {c: 0 for c in reference_columns}
    numeric_map = {
        "total_inspections": payload.get("total_inspections", 1),
        "improvement_notices": payload.get("improvement_notices", 0),
        "penalty_memos": payload.get("penalty_memos", 0),
        "total_penalty_amount": payload.get("total_penalty_amount", 0),
        "osh_violation_count": payload.get("osh_violations", 0),
        "osh_ratio": payload.get("osh_ratio", 0),
        "days_since_last_inspection": payload.get("days_since_last_inspection", 365),
        "inspection_frequency": payload.get("inspection_frequency", 1.0),
        "violation_rate": payload.get("violation_rate", 0.0),
    }
    for k, v in numeric_map.items():
        if k in row:
            row[k] = v

    sector_col = f"sector_{sector}"
    if sector_col in row:
        row[sector_col] = 1
    elif "sector_Other" in row:
        row["sector_Other"] = 1

    dz_col = f"dzongkhag_{dzongkhag}"
    if dz_col in row:
        row[dz_col] = 1
    elif "dzongkhag_Other" in row:
        row["dzongkhag_Other"] = 1

    return pd.DataFrame([row], columns=reference_columns)
