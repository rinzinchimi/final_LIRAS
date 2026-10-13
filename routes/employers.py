from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import EmployerOut, EmployerDetailOut, ViolationOut, InspectionOut
from services.risk_engine import explain

router = APIRouter(tags=["employers"])


@router.get("/employers", response_model=list[EmployerOut])
def list_employers(
    risk_category: str | None = None,
    sector: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    return crud.get_employers(db, risk_category=risk_category, sector=sector, search=search, skip=skip, limit=limit)


@router.get("/employer/{employer_id}", response_model=EmployerDetailOut)
def get_employer_detail(employer_id: str, db: Session = Depends(get_db)):
    employer = crud.get_employer(db, employer_id)
    if not employer:
        raise HTTPException(status_code=404, detail="Employer not found")

    violations = crud.get_employer_violations(db, employer_id)
    inspections = crud.get_employer_inspections(db, employer_id)

    row = {
        "penalty_memos": employer.penalty_memos,
        "improvement_notices": employer.improvement_notices,
        "osh_violation_count": employer.osh_violation_count,
        "total_penalty_amount": employer.total_penalty_amount,
        "violation_rate": employer.violation_rate,
        "days_since_last_inspection": employer.days_since_last_inspection,
        "sector": employer.sector,
    }

    payload = EmployerOut.model_validate(employer).model_dump()
    payload["violations"] = [ViolationOut.model_validate(v).model_dump() for v in violations]
    payload["inspections"] = [InspectionOut.model_validate(i).model_dump() for i in inspections]
    payload["ai_explanation"] = explain(row)
    return payload
