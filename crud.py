from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

import models


def get_employers(db: Session, risk_category: str | None = None, sector: str | None = None,
                   search: str | None = None, skip: int = 0, limit: int = 500):
    q = db.query(models.Employer)
    if risk_category:
        q = q.filter(models.Employer.risk_category == risk_category)
    if sector:
        q = q.filter(models.Employer.sector == sector)
    if search:
        like = f"%{search}%"
        q = q.filter(models.Employer.name.ilike(like))
    return q.order_by(models.Employer.final_risk_score.desc()).offset(skip).limit(limit).all()


def get_employer(db: Session, employer_id: str):
    return db.query(models.Employer).filter(models.Employer.id == employer_id).first()


def get_employer_violations(db: Session, employer_id: str):
    return (
        db.query(models.Violation)
        .filter(models.Violation.employer_id == employer_id)
        .order_by(models.Violation.inspection_date.desc())
        .all()
    )


def get_employer_inspections(db: Session, employer_id: str):
    return (
        db.query(models.Inspection)
        .filter(models.Inspection.employer_id == employer_id)
        .order_by(models.Inspection.inspection_date.desc())
        .all()
    )


def dashboard_summary(db: Session) -> dict:
    total_employers = db.query(func.count(models.Employer.id)).scalar() or 0
    total_inspections = db.query(func.sum(models.Employer.total_inspections)).scalar() or 0
    avg_score = db.query(func.avg(models.Employer.final_risk_score)).scalar() or 0
    high = db.query(func.count(models.Employer.id)).filter(models.Employer.risk_category == "High").scalar() or 0
    medium = db.query(func.count(models.Employer.id)).filter(models.Employer.risk_category == "Medium").scalar() or 0
    low = db.query(func.count(models.Employer.id)).filter(models.Employer.risk_category == "Low").scalar() or 0
    total_notices = db.query(func.sum(models.Employer.notices_count)).scalar() or 0
    total_penalty = db.query(func.sum(models.Employer.total_penalty_amount)).scalar() or 0

    return {
        "total_employers": int(total_employers),
        "total_inspections": int(total_inspections),
        "average_risk_score": round(float(avg_score), 2),
        "high_risk_count": int(high),
        "medium_risk_count": int(medium),
        "low_risk_count": int(low),
        "total_violations": int(total_notices),
        "total_penalty_amount": float(total_penalty),
    }


def sector_breakdown(db: Session):
    rows = (
        db.query(models.Employer.sector, func.count(models.Employer.id), func.avg(models.Employer.final_risk_score))
        .group_by(models.Employer.sector)
        .order_by(func.count(models.Employer.id).desc())
        .all()
    )
    return [{"sector": r[0], "employer_count": r[1], "avg_risk_score": round(float(r[2] or 0), 2)} for r in rows]


def dzongkhag_breakdown(db: Session):
    rows = (
        db.query(models.Employer.dzongkhag, func.count(models.Employer.id), func.avg(models.Employer.final_risk_score))
        .group_by(models.Employer.dzongkhag)
        .order_by(func.count(models.Employer.id).desc())
        .all()
    )
    return [{"dzongkhag": r[0], "employer_count": r[1], "avg_risk_score": round(float(r[2] or 0), 2)} for r in rows]


def inspection_trend(db: Session):
    """Inspections per month, from the Inspection table's date field."""
    rows = (
        db.query(
            func.strftime("%Y-%m", models.Inspection.inspection_date),
            func.count(models.Inspection.id),
        )
        .filter(models.Inspection.inspection_date.isnot(None))
        .group_by(func.strftime("%Y-%m", models.Inspection.inspection_date))
        .order_by(func.strftime("%Y-%m", models.Inspection.inspection_date))
        .all()
    )
    return [{"month": r[0], "count": r[1]} for r in rows if r[0]]


def violation_trend(db: Session):
    rows = (
        db.query(
            func.strftime("%Y-%m", models.Violation.inspection_date),
            func.count(models.Violation.id),
        )
        .filter(models.Violation.inspection_date.isnot(None))
        .group_by(func.strftime("%Y-%m", models.Violation.inspection_date))
        .order_by(func.strftime("%Y-%m", models.Violation.inspection_date))
        .all()
    )
    return [{"month": r[0], "count": r[1]} for r in rows if r[0]]


def priority_list(db: Session, limit: int = 50):
    return (
        db.query(models.Employer)
        .order_by(models.Employer.final_risk_score.desc())
        .limit(limit)
        .all()
    )


def recent_inspections(db: Session, limit: int = 10):
    return (
        db.query(models.Inspection)
        .filter(models.Inspection.inspection_date.isnot(None))
        .order_by(models.Inspection.inspection_date.desc())
        .limit(limit)
        .all()
    )


def all_inspections(db: Session, search: str | None = None, sector: str | None = None,
                     status: str | None = None, skip: int = 0, limit: int = 500):
    q = db.query(models.Inspection, models.Employer).join(
        models.Employer, models.Inspection.employer_id == models.Employer.id
    )
    if sector:
        q = q.filter(models.Inspection.sector == sector)
    if status:
        q = q.filter(models.Inspection.status == status)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (models.Employer.name.ilike(like)) |
            (models.Inspection.inspector.ilike(like)) |
            (models.Inspection.inspection_type.ilike(like))
        )
    q = q.order_by(models.Inspection.inspection_date.desc()).offset(skip).limit(limit)
    rows = q.all()
    return [
        {
            "id": insp.id,
            "employer_id": emp.id,
            "employer_name": emp.name,
            "sector": emp.sector,
            "dzongkhag": emp.dzongkhag,
            "inspection_type": insp.inspection_type,
            "inspection_date": insp.inspection_date,
            "inspector": insp.inspector,
            "source": insp.source,
            "status": insp.status or "Pending",
            "risk_category": emp.risk_category,
            "recommendation": emp.recommendation,
        }
        for insp, emp in rows
    ]


def get_inspection(db: Session, inspection_id: int):
    return db.query(models.Inspection).filter(models.Inspection.id == inspection_id).first()


def update_inspection_status(db: Session, inspection_id: int, status: str):
    insp = get_inspection(db, inspection_id)
    if not insp:
        return None
    insp.status = status
    db.commit()
    db.refresh(insp)
    return insp


def create_scheduled_inspection(db: Session, employer_id: str, inspector: str,
                                 inspection_date, inspection_type: str = "Scheduled Inspection"):
    insp = models.Inspection(
        employer_id=employer_id,
        inspection_type=inspection_type,
        inspection_date=inspection_date,
        inspector=inspector,
        dzongkhag=None,
        sector=None,
        location=None,
        source="scheduled",
        status="Pending",
    )
    db.add(insp)
    db.commit()
    db.refresh(insp)
    return insp


def find_employer_by_name(db: Session, name: str):
    if not name:
        return None
    exact = db.query(models.Employer).filter(models.Employer.name.ilike(name)).first()
    if exact:
        return exact
    return db.query(models.Employer).filter(models.Employer.name.ilike(f"%{name}%")).first()


def inspection_summary(db: Session) -> dict:
    total = db.query(func.count(models.Inspection.id)).scalar() or 0
    pending = db.query(func.count(models.Inspection.id)).filter(models.Inspection.status == "Pending").scalar() or 0
    completed = db.query(func.count(models.Inspection.id)).filter(models.Inspection.status == "Completed").scalar() or 0
    high_risk_cases = (
        db.query(func.count(models.Employer.id))
        .filter(models.Employer.risk_category.in_(["High", "Critical"]))
        .scalar() or 0
    )
    return {
        "total_inspections": int(total),
        "pending": int(pending),
        "completed": int(completed),
        "high_risk_cases": int(high_risk_cases),
    }


# ---------------- Reports ----------------

def next_report_code(db: Session) -> str:
    count = db.query(func.count(models.Report.id)).scalar() or 0
    return f"REP{count + 1:03d}"


def create_report(db: Session, employer_id: str | None, inspection_id: int | None,
                   report_type: str, file_format: str, file_path: str, status: str = "Completed"):
    report = models.Report(
        report_code=next_report_code(db),
        employer_id=employer_id,
        inspection_id=inspection_id,
        report_type=report_type,
        status=status,
        file_format=file_format,
        file_path=file_path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def get_report(db: Session, report_id: int):
    return db.query(models.Report).filter(models.Report.id == report_id).first()


def list_reports(db: Session, status: str | None = None, this_month: bool = False,
                  skip: int = 0, limit: int = 500):
    q = db.query(models.Report, models.Employer).outerjoin(
        models.Employer, models.Report.employer_id == models.Employer.id
    )
    if status:
        q = q.filter(models.Report.status == status)
    if this_month:
        now = datetime.utcnow()
        q = q.filter(
            func.strftime("%Y-%m", models.Report.created_at) == f"{now.year:04d}-{now.month:02d}"
        )
    q = q.order_by(models.Report.created_at.desc()).offset(skip).limit(limit)
    rows = q.all()
    return [
        {
            "id": r.id,
            "report_code": r.report_code,
            "employer_id": emp.id if emp else None,
            "employer_name": emp.name if emp else "All Employers",
            "report_type": r.report_type,
            "status": r.status,
            "file_format": r.file_format,
            "created_at": r.created_at,
        }
        for r, emp in rows
    ]


def report_summary(db: Session) -> dict:
    total = db.query(func.count(models.Report.id)).scalar() or 0
    now = datetime.utcnow()
    this_month = (
        db.query(func.count(models.Report.id))
        .filter(func.strftime("%Y-%m", models.Report.created_at) == f"{now.year:04d}-{now.month:02d}")
        .scalar() or 0
    )
    pending = db.query(func.count(models.Report.id)).filter(models.Report.status == "Pending").scalar() or 0
    completed = db.query(func.count(models.Report.id)).filter(models.Report.status == "Completed").scalar() or 0
    return {
        "total_reports": int(total),
        "reports_this_month": int(this_month),
        "pending_reports": int(pending),
        "completed_reports": int(completed),
    }
