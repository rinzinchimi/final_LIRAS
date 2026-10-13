"""
Data pipeline: loads the two raw Excel exports, cleans them, reconciles
employer identity across the two sources, engineers features, and computes
the statistical risk score.

Source A - "Inspection Report" (enforcement notices / violations):
    columns: #, Application No, Name of the Enterprise, Sector, Dzongkhag,
    Location, Employer Id, Mobile No, Email Id, Notice Type, Inspection Date,
    Amount, Followup Date, Contravention, Section Act, Section No,
    Particulars, Reason, Remarks
    -> one row per enforcement notice (Improvement Notice / Penalty Memo).
    Always has "Employer Id"; often missing "Name of the Enterprise".

Source B - "Inspection Conducted Report" (routine inspections carried out):
    columns (after cleaning the two-row header): Sl No, Company Name,
    Application No, Inspection Type, Inspection Date, Inspection Team,
    Inspected By, Dzongkhag, Region, Sector, Location
    -> one row per inspection visit. Always has a company name, never an
    Employer Id (its "Application No" is a *different*, inspection-visit
    numbering scheme, not the same key as Source A).

There is no shared employer ID between the two files, so employer identity
is reconciled by normalized company name. Employers that only ever appear
in Source A (very common - the notices file is missing ~50% of names) are
kept as their own record keyed by "Employer Id" instead.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

import numpy as np
import pandas as pd

from utils.dates import parse_date
from utils.text import normalize_name, is_osh_related
from pathlib import Path

REPORT1_PATH_DEFAULT = str(Path(__file__).resolve().parent.parent / "source_data" / "Inspection__Report.xlsx")
REPORT2_PATH_DEFAULT = str(Path(__file__).resolve().parent.parent / "source_data" / "Inspection_Conducted_Report__1_.xlsx")
RISK_HIGH_THRESHOLD = 70
RISK_MEDIUM_THRESHOLD = 40

# Statistical scoring weights (must sum to 1.0) - see build_statistical_score()
WEIGHTS = {
    "violation_rate": 0.30,
    "penalty_severity": 0.20,
    "osh_ratio": 0.15,
    "violation_recency": 0.20,
    "repeat_offender": 0.15,
}


# --------------------------------------------------------------------------
# Loading + cleaning
# --------------------------------------------------------------------------

def load_notices(path: str = REPORT1_PATH_DEFAULT) -> pd.DataFrame:
    """Load & clean Source A (enforcement notices)."""
    df = pd.read_excel(path)
    df.columns = [c.strip() for c in df.columns]

    df = df.rename(columns={
        "Name of the Enterprise": "name",
        "Sector": "sector",
        "Dzongkhag": "dzongkhag",
        "Location": "location",
        "Employer Id": "employer_ext_id",
        "Mobile No": "mobile",
        "Email Id": "email",
        "Notice Type": "notice_type",
        "Inspection Date": "inspection_date",
        "Amount": "amount",
        "Followup Date": "followup_date",
        "Contravention": "contravention",
        "Section Act": "section_act",
        "Section No": "section_no",
        "Particulars": "particulars",
        "Remarks": "remarks",
    })

    # Missing-value handling
    df["name"] = df["name"].apply(lambda x: None if pd.isna(x) or not str(x).strip() else str(x).strip())
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["remarks"] = df["remarks"].fillna("")
    df["notice_type"] = df["notice_type"].fillna("Unspecified")
    df["sector"] = df["sector"].fillna("Unknown")
    df["dzongkhag"] = df["dzongkhag"].fillna("Unknown")
    df["employer_ext_id"] = pd.to_numeric(df["employer_ext_id"], errors="coerce")

    df["inspection_date"] = df["inspection_date"].apply(parse_date)
    df["is_osh"] = (df["contravention"].fillna("") + " " + df["section_act"].fillna("")).apply(is_osh_related)

    df["name_key"] = df["name"].apply(lambda x: normalize_name(x) if x else "")
    # Employers with no name are identified solely by their Employer Id
    df["employer_key"] = np.where(
        df["name_key"] != "",
        df["name_key"],
        "empid_" + df["employer_ext_id"].astype("Int64").astype(str),
    )

    # Duplicate removal: exact duplicate notice rows (same employer, date, notice type, section)
    before = len(df)
    df = df.drop_duplicates(subset=["employer_ext_id", "inspection_date", "notice_type", "section_no"])
    dropped = before - len(df)

    df.attrs["duplicates_removed"] = dropped
    df.attrs["rows_loaded"] = before
    return df


def load_inspections_conducted(path: str = REPORT2_PATH_DEFAULT) -> pd.DataFrame:
    """Load & clean Source B (routine inspections conducted)."""
    raw = pd.read_excel(path, header=None)
    # Row 0 is a title ("Inspection Conducted Report"), row 1 is the real header
    df = raw.iloc[2:].copy()
    df.columns = [
        "sl_no", "name", "application_no", "inspection_type", "inspection_date",
        "inspection_team", "inspected_by", "dzongkhag", "region", "sector", "location",
    ]
    df = df.dropna(subset=["name"])
    df["name"] = df["name"].astype(str).str.strip()
    df["sector"] = df["sector"].fillna("Unknown")
    df["dzongkhag"] = df["dzongkhag"].fillna("Unknown")
    df["region"] = df["region"].fillna("Unknown")
    df["location"] = df["location"].fillna("Unknown")
    df["inspection_type"] = df["inspection_type"].fillna("Routine Inspection")
    df["inspection_date"] = df["inspection_date"].apply(parse_date)

    before = len(df)
    df = df.drop_duplicates(subset=["name", "inspection_date", "inspection_type"])
    dropped = before - len(df)

    df["name_key"] = df["name"].apply(normalize_name)
    df["employer_key"] = df["name_key"]

    df.attrs["duplicates_removed"] = dropped
    df.attrs["rows_loaded"] = before
    return df


# --------------------------------------------------------------------------
# Merge into one employer-level dataset
# --------------------------------------------------------------------------

def build_employer_dataset(
    notices: pd.DataFrame,
    inspections: pd.DataFrame,
    reference_date: Optional[date] = None,
) -> pd.DataFrame:
    """Merge both sources into a single, employer-level, feature-engineered table."""
    reference_date = reference_date or date.today()

    # --- aggregate Source A (violations/notices) per employer_key ---
    notice_agg = notices.groupby("employer_key").agg(
        name_a=("name", lambda s: next((v for v in s if v), None)),
        sector_a=("sector", lambda s: s.mode().iat[0] if not s.mode().empty else "Unknown"),
        dzongkhag_a=("dzongkhag", lambda s: s.mode().iat[0] if not s.mode().empty else "Unknown"),
        location_a=("location", "first"),
        employer_ext_id=("employer_ext_id", "first"),
        mobile=("mobile", "first"),
        email=("email", "first"),
        improvement_notices=("notice_type", lambda s: int((s == "Improvement Notice").sum())),
        penalty_memos=("notice_type", lambda s: int((s == "Penalty Memo").sum())),
        total_penalty_amount=("amount", "sum"),
        osh_violation_count=("is_osh", "sum"),
        notice_dates=("inspection_date", lambda s: sorted([d for d in s if d])),
    ).reset_index()
    notice_agg["notices_count"] = notice_agg["improvement_notices"] + notice_agg["penalty_memos"]
    notice_agg["last_violation_date"] = notice_agg["notice_dates"].apply(lambda ds: max(ds) if ds else None)
    notice_agg["first_violation_date"] = notice_agg["notice_dates"].apply(lambda ds: min(ds) if ds else None)
    notice_agg["distinct_notice_dates"] = notice_agg["notice_dates"].apply(lambda ds: len(set(ds)))

    # --- aggregate Source B (inspections conducted) per employer_key ---
    insp_agg = inspections.groupby("employer_key").agg(
        name_b=("name", "first"),
        sector_b=("sector", lambda s: s.mode().iat[0] if not s.mode().empty else "Unknown"),
        dzongkhag_b=("dzongkhag", lambda s: s.mode().iat[0] if not s.mode().empty else "Unknown"),
        region_b=("region", lambda s: s.mode().iat[0] if not s.mode().empty else "Unknown"),
        location_b=("location", "first"),
        inspections_conducted=("inspection_date", "count"),
        inspectors=("inspected_by", lambda s: s.nunique()),
        insp_dates=("inspection_date", lambda s: sorted([d for d in s if d])),
    ).reset_index()
    insp_agg["last_inspection_date_b"] = insp_agg["insp_dates"].apply(lambda ds: max(ds) if ds else None)
    insp_agg["first_inspection_date_b"] = insp_agg["insp_dates"].apply(lambda ds: min(ds) if ds else None)

    # --- outer merge on the reconciled employer_key ---
    merged = pd.merge(notice_agg, insp_agg, on="employer_key", how="outer")

    merged["name"] = merged["name_a"].combine_first(merged["name_b"])
    merged["name"] = merged.apply(
        lambda r: r["name"] if isinstance(r["name"], str) and r["name"].strip()
        else f"Employer #{int(r['employer_ext_id'])}" if pd.notna(r.get("employer_ext_id"))
        else "Unknown Employer",
        axis=1,
    )
    merged["sector"] = merged["sector_b"].combine_first(merged["sector_a"]).fillna("Unknown")
    merged["dzongkhag"] = merged["dzongkhag_b"].combine_first(merged["dzongkhag_a"]).fillna("Unknown")
    merged["location"] = merged["location_b"].combine_first(merged["location_a"]).fillna("Unknown")

    for col in ["improvement_notices", "penalty_memos", "notices_count", "total_penalty_amount",
                "osh_violation_count", "inspections_conducted", "distinct_notice_dates", "inspectors"]:
        merged[col] = merged[col].fillna(0)

    # total_inspections: best-effort lower bound - inspections explicitly logged in Source B,
    # or (if not logged there) the distinct dates on which a notice was issued in Source A,
    # since a notice necessarily implies an inspection took place.
    merged["total_inspections"] = merged[["inspections_conducted", "distinct_notice_dates"]].max(axis=1)
    merged["total_inspections"] = merged["total_inspections"].replace(0, np.nan).fillna(1)  # every listed employer had >=1 contact

    # combined last/first inspection/violation dates
    def _max_date(row, cols):
        vals = [row[c] for c in cols if pd.notna(row.get(c))]
        return max(vals) if vals else None

    def _min_date(row, cols):
        vals = [row[c] for c in cols if pd.notna(row.get(c))]
        return min(vals) if vals else None

    merged["last_inspection_date"] = merged.apply(
        lambda r: _max_date(r, ["last_inspection_date_b", "last_violation_date"]), axis=1)
    merged["first_inspection_date"] = merged.apply(
        lambda r: _min_date(r, ["first_inspection_date_b", "first_violation_date"]), axis=1)

    merged["days_since_last_inspection"] = merged["last_inspection_date"].apply(
        lambda d: (reference_date - d).days if isinstance(d, date) else 9999)
    merged["days_since_last_violation"] = merged["last_violation_date"].apply(
        lambda d: (reference_date - d).days if isinstance(d, date) else None)

    span_days = merged.apply(
        lambda r: (r["last_inspection_date"] - r["first_inspection_date"]).days
        if r["last_inspection_date"] and r["first_inspection_date"] else 0, axis=1)
    years_span = (span_days / 365.0).clip(lower=0.5)
    merged["inspection_frequency"] = (merged["total_inspections"] / years_span).round(2)

    merged["violation_rate"] = (merged["notices_count"] / merged["total_inspections"]).round(3)
    merged["osh_ratio"] = merged.apply(
        lambda r: r["osh_violation_count"] / r["notices_count"] if r["notices_count"] > 0 else 0, axis=1)

    # employer identifier for the app (deterministic, human-readable)
    merged = merged.sort_values(["notices_count", "total_inspections"], ascending=False).reset_index(drop=True)
    merged["employer_id"] = ["EMP" + str(i + 1).zfill(4) for i in range(len(merged))]

    keep_cols = [
        "employer_id", "employer_key", "name", "sector", "dzongkhag", "location",
        "employer_ext_id", "mobile", "email",
        "total_inspections", "improvement_notices", "penalty_memos", "notices_count",
        "total_penalty_amount", "osh_violation_count", "osh_ratio",
        "last_inspection_date", "first_inspection_date",
        "days_since_last_inspection", "days_since_last_violation",
        "inspection_frequency", "violation_rate",
    ]
    return merged[keep_cols]


# --------------------------------------------------------------------------
# Statistical risk score
# --------------------------------------------------------------------------

def _minmax(series: pd.Series) -> pd.Series:
    lo, hi = series.min(), series.max()
    if hi - lo < 1e-9:
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - lo) / (hi - lo)


def build_statistical_score(df: pd.DataFrame) -> pd.DataFrame:
    """Statistical (rule + historical-distribution based) 0-100 risk score.

    Every component is min-max normalized *across the current employer
    population* so the score reflects each employer's standing relative to
    real historical inspection/violation data, not an arbitrary constant.
    """
    df = df.copy()

    norm_violation_rate = _minmax(df["violation_rate"])
    norm_penalty = _minmax(df["total_penalty_amount"])
    norm_osh = _minmax(df["osh_ratio"])
    # Recency: a violation in the last ~180 days scores highest, decaying to 0 by ~2 years.
    # Employers with no violation history at all get 0 for this component.
    recency_raw = df["days_since_last_violation"].apply(
        lambda d: np.nan if pd.isna(d) else max(0.0, 1 - (d / 730.0)))
    norm_recency = recency_raw.fillna(0.0)
    norm_repeat = _minmax(df["notices_count"].clip(upper=df["notices_count"].quantile(0.95) or 1))

    df["statistical_score"] = (100 * (
        WEIGHTS["violation_rate"] * norm_violation_rate +
        WEIGHTS["penalty_severity"] * norm_penalty +
        WEIGHTS["osh_ratio"] * norm_osh +
        WEIGHTS["violation_recency"] * norm_recency +
        WEIGHTS["repeat_offender"] * norm_repeat
    )).round(2).clip(0, 100)

    df["risk_category"] = df["statistical_score"].apply(
        lambda s: "High" if s >= RISK_HIGH_THRESHOLD else ("Medium" if s >= RISK_MEDIUM_THRESHOLD else "Low"))

    return df


def run_pipeline(
    notices_path: str = REPORT1_PATH_DEFAULT,
    inspections_path: str = REPORT2_PATH_DEFAULT,
    reference_date: Optional[date] = None,
) -> dict:
    """Run the full Step 1-3 pipeline and return all cleaned artifacts."""
    notices = load_notices(notices_path)
    inspections = load_inspections_conducted(inspections_path)
    employers = build_employer_dataset(notices, inspections, reference_date=reference_date)
    employers = build_statistical_score(employers)

    return {
        "notices": notices,
        "inspections": inspections,
        "employers": employers,
        "meta": {
            "notices_rows_loaded": notices.attrs.get("rows_loaded"),
            "notices_duplicates_removed": notices.attrs.get("duplicates_removed"),
            "inspections_rows_loaded": inspections.attrs.get("rows_loaded"),
            "inspections_duplicates_removed": inspections.attrs.get("duplicates_removed"),
            "employers_count": len(employers),
        },
    }


if __name__ == "__main__":
    result = run_pipeline()
    print(result["meta"])
    print(result["employers"].head(10).to_string())
