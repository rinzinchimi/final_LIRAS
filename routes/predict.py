from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from ml.predict import predict_employer
from ml.train import train_and_select_best
from schemas import PredictRequest, PredictResponse
from services.loader import reload_database, store_model_metrics
from services.risk_engine import risk_model

router = APIRouter(tags=["predict"])


@router.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest):
    result = predict_employer(payload.model_dump())
    return result


@router.post("/retrain")
def retrain(db: Session = Depends(get_db)):
    """Re-runs the cleaning/merge pipeline, retrains all 5 models, selects the
    best, replaces the persisted model, and refreshes the database and every
    employer's risk score (Step 12)."""
    out = train_and_select_best(save=True)
    risk_model.reload()
    reload_database(db)
    store_model_metrics(db, out["metadata"])
    return {
        "status": "success",
        "best_model": out["metadata"]["best_model"],
        "n_employers": out["metadata"]["n_employers"],
        "results": out["metadata"]["results"],
    }
