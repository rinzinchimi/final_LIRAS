from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import InspectionScheduleRequest, InspectionStatusUpdate
from services.recommendation import build_full_recommendation

router = APIRouter(tags=["inspections"])


@router.get("/inspections/summary")
def inspections_summary(db: Session = Depends(get_db)):
    return crud.inspection_summary(db)


@router.get("/inspections/{inspection_id}")
def inspection_detail(inspection_id: int, db: Session = Depends(get_db)):
    insp = crud.get_inspection(db, inspection_id)
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")

    employer = crud.get_employer(db, insp.employer_id)
    if not employer:
        raise HTTPException(status_code=404, detail="Employer not found for this inspection")

    violations = crud.get_employer_violations(db, employer.id)
    inspections = crud.get_employer_inspections(db, employer.id)
    previous_inspections = [i for i in inspections if i.id != insp.id]

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
            "inspection_date": str(v.inspection_date) if v.inspection_date else None,
            "amount": v.amount,
            "contravention": v.contravention,
            "section_act": v.section_act,
            "section_no": v.section_no,
            "particulars": v.particulars,
            "remarks": v.remarks,
            "is_osh": v.is_osh,
        }
        for v in violations
    ]
    ai_recommendation = build_full_recommendation(employer.risk_category, employer_row, violation_dicts)

    return {
        "id": insp.id,
        "employer_id": employer.id,
        "employer_name": employer.name,
        "company_name": employer.name,
        "sector": employer.sector,
        "dzongkhag": employer.dzongkhag,
        "location": employer.location,
        "inspection_type": insp.inspection_type,
        "inspection_date": insp.inspection_date,
        "inspector": insp.inspector,
        "status": insp.status or "Pending",
        "source": insp.source,
        "risk_category": employer.risk_category,
        "final_risk_score": employer.final_risk_score,
        "violations": violation_dicts,
        "improvement_notices": employer.improvement_notices,
        "penalty_memos": employer.penalty_memos,
        "total_penalty_amount": employer.total_penalty_amount,
        "osh_findings": [v for v in violation_dicts if v["is_osh"]],
        "previous_inspection_history": [
            {
                "inspection_date": i.inspection_date,
                "inspection_type": i.inspection_type,
                "inspector": i.inspector,
                "status": i.status,
                "source": i.source,
            }
            for i in previous_inspections
        ],
        "ai_recommendation": ai_recommendation,
    }


@router.patch("/inspections/{inspection_id}")
def update_inspection(inspection_id: int, payload: InspectionStatusUpdate, db: Session = Depends(get_db)):
    if payload.status not in ("Pending", "Completed"):
        raise HTTPException(status_code=400, detail="status must be 'Pending' or 'Completed'")
    insp = crud.update_inspection_status(db, inspection_id, payload.status)
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return {
        "id": insp.id,
        "status": insp.status,
        "employer_id": insp.employer_id,
    }


@router.post("/inspections")
def schedule_inspection(payload: InspectionScheduleRequest, db: Session = Depends(get_db)):
    employer = crud.find_employer_by_name(db, payload.employer_name)
    if not employer:
        raise HTTPException(
            status_code=404,
            detail=f"No employer matching '{payload.employer_name}' found. Add the employer first.",
        )
    insp = crud.create_scheduled_inspection(
        db, employer_id=employer.id, inspector=payload.inspector, inspection_date=payload.inspection_date,
    )
    return {
        "id": insp.id,
        "employer_id": employer.id,
        "employer_name": employer.name,
        "sector": employer.sector,
        "inspector": insp.inspector,
        "inspection_date": insp.inspection_date,
        "status": insp.status,
        "risk_category": employer.risk_category,
    }
