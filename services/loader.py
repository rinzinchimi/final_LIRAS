"""Runs the full data pipeline + risk engine and (re)populates the database.
Used at application startup and after /upload-new-data or /retrain."""
from __future__ import annotations

import pandas as pd
from sqlalchemy.orm import Session

import models
from services.data_pipeline import run_pipeline
from services.risk_engine import blend_scores, recommend, explain


def _row_to_employer_kwargs(row: pd.Series) -> dict:
    return dict(
        id=row["employer_id"],
        employer_key=row["employer_key"],
        name=row["name"],
        sector=row["sector"],
        dzongkhag=row["dzongkhag"],
        location=row.get("location"),
        employer_ext_id=str(row["employer_ext_id"]) if pd.notna(row.get("employer_ext_id")) else None,
        mobile=str(row["mobile"]) if pd.notna(row.get("mobile")) else None,
        email=row.get("email") if pd.notna(row.get("email")) else None,
        total_inspections=int(row["total_inspections"]),
        improvement_notices=int(row["improvement_notices"]),
        penalty_memos=int(row["penalty_memos"]),
        notices_count=int(row["notices_count"]),
        total_penalty_amount=float(row["total_penalty_amount"]),
        osh_violation_count=int(row["osh_violation_count"]),
        osh_ratio=float(row["osh_ratio"]),
        last_inspection_date=row.get("last_inspection_date"),
        first_inspection_date=row.get("first_inspection_date"),
        days_since_last_inspection=int(row["days_since_last_inspection"]),
        inspection_frequency=float(row["inspection_frequency"]),
        violation_rate=float(row["violation_rate"]),
        statistical_score=float(row["statistical_score"]),
        ml_probability=float(row["ml_probability"]),
        final_risk_score=float(row["final_risk_score"]),
        risk_category=row["final_risk_category"],
        ml_predicted_category=row.get("ml_predicted_category"),
        recommendation=row["recommendation"],
    )


def reload_database(db: Session, notices_path: str = None, inspections_path: str = None):
    kwargs = {}
    if notices_path:
        kwargs["notices_path"] = notices_path
    if inspections_path:
        kwargs["inspections_path"] = inspections_path

    result = run_pipeline(**kwargs)
    employers = blend_scores(result["employers"])
    employers["recommendation"] = employers.apply(lambda r: recommend(r["final_risk_category"], r), axis=1)

    notices = result["notices"]
    inspections = result["inspections"]

    # wipe existing data (simple full-refresh strategy - fine at this data scale)
    db.query(models.Violation).delete()
    db.query(models.Inspection).delete()
    db.query(models.Employer).delete()
    db.commit()

    key_to_id = dict(zip(employers["employer_key"], employers["employer_id"]))

    for _, row in employers.iterrows():
        db.add(models.Employer(**_row_to_employer_kwargs(row)))
    db.commit()

    for _, row in notices.iterrows():
        emp_id = key_to_id.get(row["employer_key"])
        if not emp_id:
            continue
        db.add(models.Violation(
            employer_id=emp_id,
            notice_type=row["notice_type"],
            inspection_date=row["inspection_date"],
            amount=float(row["amount"]),
            contravention=row.get("contravention"),
            section_act=row.get("section_act"),
            section_no=str(row.get("section_no")) if pd.notna(row.get("section_no")) else None,
            particulars=row.get("particulars"),
            remarks=row.get("remarks"),
            is_osh=bool(row["is_osh"]),
        ))
        db.add(models.Inspection(
            employer_id=emp_id,
            inspection_type=row["notice_type"],
            inspection_date=row["inspection_date"],
            inspector=None,
            dzongkhag=row.get("dzongkhag"),
            sector=row.get("sector"),
            location=row.get("location"),
            source="notice",
            status="Pending",
        ))

    for _, row in inspections.iterrows():
        emp_id = key_to_id.get(row["employer_key"])
        if not emp_id:
            continue
        db.add(models.Inspection(
            employer_id=emp_id,
            inspection_type=row["inspection_type"],
            inspection_date=row["inspection_date"],
            inspector=row.get("inspected_by"),
            dzongkhag=row.get("dzongkhag"),
            sector=row.get("sector"),
            location=row.get("location"),
            source="conducted",
            status="Completed",
        ))
    db.commit()

    return {
        "employers_processed": len(employers),
        "duplicates_removed": (
            result["meta"].get("notices_duplicates_removed", 0) +
            result["meta"].get("inspections_duplicates_removed", 0)
        ),
    }


def store_model_metrics(db: Session, metadata: dict):
    db.query(models.ModelMetric).delete()
    for name, r in metadata["results"].items():
        db.add(models.ModelMetric(
            model_name=name,
            accuracy=r.get("accuracy"),
            precision_macro=r.get("precision_macro"),
            recall_macro=r.get("recall_macro"),
            f1_macro=r.get("f1_macro"),
            roc_auc_macro=r.get("roc_auc_macro"),
            cv_f1_macro_mean=r.get("cv_f1_macro_mean"),
            cv_f1_macro_std=r.get("cv_f1_macro_std"),
            is_best=(name == metadata["best_model"]),
        ))
    db.commit()
