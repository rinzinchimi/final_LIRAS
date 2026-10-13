from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import ReportGenerateRequest
from services.recommendation import build_full_recommendation
from services.report_builder import generate_docx, generate_pdf

router = APIRouter(tags=["reports"])


@router.get("/reports/summary")
def reports_summary(db: Session = Depends(get_db)):
    return crud.report_summary(db)


@router.get("/reports")
def get_reports(status: str | None = None, this_month: bool = False,
                 skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    return crud.list_reports(db, status=status, this_month=this_month, skip=skip, limit=limit)


@router.post("/reports/generate")
def generate_report(payload: ReportGenerateRequest, db: Session = Depends(get_db)):
    employer = crud.get_employer(db, payload.employer_id)
    if not employer:
        raise HTTPException(status_code=404, detail="Employer not found")

    violations = crud.get_employer_violations(db, employer.id)
    inspections = crud.get_employer_inspections(db, employer.id)

    employer_row = {
        "penalty_memos": employer.penalty_memos,
        "improvement_notices": employer.improvement_notices,
        "osh_violation_count": employer.osh_violation_count,
        "total_penalty_amount": employer.total_penalty_amount,
        "violation_rate": employer.violation_rate,
        "days_since_last_inspection": employer.days_since_last_inspection,
        "sector": employer.sector,
        "osh_ratio": employer.osh_ratio,
    }
    violation_dicts = [
        {
            "notice_type": v.notice_type,
            "amount": v.amount,
            "is_osh": v.is_osh,
        }
        for v in violations
    ]
    recommendation = build_full_recommendation(employer.risk_category, employer_row, violation_dicts)

    # reserve the report row first so we get a stable report_code for the filename
    report = crud.create_report(
        db, employer_id=employer.id, inspection_id=None,
        report_type=payload.report_type or "Inspection Report",
        file_format=payload.file_format or "pdf", file_path="",
    )

    fmt = (payload.file_format or "pdf").lower()
    if fmt == "docx":
        path = generate_docx(report.report_code, employer, violations, inspections, recommendation)
    else:
        fmt = "pdf"
        path = generate_pdf(report.report_code, employer, violations, inspections, recommendation)

    report.file_path = path
    report.file_format = fmt
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "report_code": report.report_code,
        "employer_id": employer.id,
        "employer_name": employer.name,
        "report_type": report.report_type,
        "status": report.status,
        "file_format": report.file_format,
        "created_at": report.created_at,
        "download_url": f"/api/reports/{report.id}/download",
    }


@router.get("/reports/{report_id}")
def get_report_detail(report_id: int, db: Session = Depends(get_db)):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    employer = crud.get_employer(db, report.employer_id) if report.employer_id else None
    return {
        "id": report.id,
        "report_code": report.report_code,
        "employer_id": report.employer_id,
        "employer_name": employer.name if employer else "All Employers",
        "report_type": report.report_type,
        "status": report.status,
        "file_format": report.file_format,
        "created_at": report.created_at,
        "download_url": f"/api/reports/{report.id}/download" if report.file_path else None,
    }


@router.get("/reports/{report_id}/download")
def download_report(report_id: int, db: Session = Depends(get_db)):
    report = crud.get_report(db, report_id)
    if not report or not report.file_path or not Path(report.file_path).exists():
        raise HTTPException(status_code=404, detail="Report file not found")
    media_type = "application/pdf" if report.file_format == "pdf" else (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    filename = f"{report.report_code}.{report.file_format}"
    return FileResponse(report.file_path, media_type=media_type, filename=filename)
