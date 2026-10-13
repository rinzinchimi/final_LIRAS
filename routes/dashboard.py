from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import crud
from database import get_db
from schemas import EmployerOut

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    summary = crud.dashboard_summary(db)
    priority = crud.priority_list(db, limit=10)
    recent = crud.recent_inspections(db, limit=10)
    return {
        **summary,
        "top_high_risk_employers": [EmployerOut.model_validate(e).model_dump() for e in priority if e.risk_category == "High"][:10],
        "priority_inspection_list": [
            {
                "id": e.id, "name": e.name, "sector": e.sector,
                "risk_score": e.final_risk_score, "risk_category": e.risk_category,
            }
            for e in priority
        ],
        "recent_inspections": [
            {
                "employer_id": i.employer_id, "inspection_type": i.inspection_type,
                "inspection_date": i.inspection_date, "inspector": i.inspector, "source": i.source,
            }
            for i in recent
        ],
        "inspection_trend": crud.inspection_trend(db),
        "violation_trend": crud.violation_trend(db),
        "risk_distribution": {
            "high": summary["high_risk_count"],
            "medium": summary["medium_risk_count"],
            "low": summary["low_risk_count"],
        },
    }


@router.get("/risk-summary")
def risk_summary(db: Session = Depends(get_db)):
    summary = crud.dashboard_summary(db)
    return {
        "high_risk_count": summary["high_risk_count"],
        "medium_risk_count": summary["medium_risk_count"],
        "low_risk_count": summary["low_risk_count"],
        "average_risk_score": summary["average_risk_score"],
        "total_employers": summary["total_employers"],
    }


@router.get("/high-risk", response_model=list[EmployerOut])
def high_risk(db: Session = Depends(get_db)):
    return crud.get_employers(db, risk_category="High")


@router.get("/medium-risk", response_model=list[EmployerOut])
def medium_risk(db: Session = Depends(get_db)):
    return crud.get_employers(db, risk_category="Medium")


@router.get("/low-risk", response_model=list[EmployerOut])
def low_risk(db: Session = Depends(get_db)):
    return crud.get_employers(db, risk_category="Low")


@router.get("/inspections")
def list_inspections(search: str | None = None, sector: str | None = None, status: str | None = None,
                      skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    return crud.all_inspections(db, search=search, sector=sector, status=status, skip=skip, limit=limit)


@router.get("/inspection-priority")
def inspection_priority(limit: int = 50, db: Session = Depends(get_db)):
    rows = crud.priority_list(db, limit=limit)
    return [
        {
            "rank": i + 1,
            "id": e.id,
            "name": e.name,
            "sector": e.sector,
            "dzongkhag": e.dzongkhag,
            "risk_score": e.final_risk_score,
            "risk_category": e.risk_category,
            "recommendation": e.recommendation,
            "days_since_last_inspection": e.days_since_last_inspection,
        }
        for i, e in enumerate(rows)
    ]


@router.get("/analytics")
def analytics(db: Session = Depends(get_db)):
    summary = crud.dashboard_summary(db)
    return {
        "by_sector": crud.sector_breakdown(db),
        "by_dzongkhag": crud.dzongkhag_breakdown(db),
        "inspection_trend": crud.inspection_trend(db),
        "violation_trend": crud.violation_trend(db),
        "risk_distribution": {
            "high": summary["high_risk_count"],
            "medium": summary["medium_risk_count"],
            "low": summary["low_risk_count"],
        },
    }
