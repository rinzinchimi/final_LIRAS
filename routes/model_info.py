from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from database import get_db
from services.risk_engine import risk_model

router = APIRouter(tags=["model"])


@router.get("/feature-importance")
def feature_importance():
    if not risk_model.loaded:
        return {"available": False, "feature_importance": {}}
    return {
        "available": True,
        "best_model": risk_model.metadata["best_model"],
        "feature_importance": risk_model.metadata.get("feature_importance", {}),
    }


@router.get("/model-performance")
def model_performance(db: Session = Depends(get_db)):
    rows = db.query(models.ModelMetric).all()
    if rows:
        performance = [
            {
                "model_name": r.model_name,
                "accuracy": r.accuracy,
                "precision_macro": r.precision_macro,
                "recall_macro": r.recall_macro,
                "f1_macro": r.f1_macro,
                "roc_auc_macro": r.roc_auc_macro,
                "cv_f1_macro_mean": r.cv_f1_macro_mean,
                "cv_f1_macro_std": r.cv_f1_macro_std,
                "is_best": r.is_best,
            }
            for r in rows
        ]
    elif risk_model.loaded:
        performance = [
            {"model_name": name, "is_best": name == risk_model.metadata["best_model"], **r}
            for name, r in risk_model.metadata["results"].items()
        ]
    else:
        performance = []

    return {
        "models": performance,
        "best_model": risk_model.metadata["best_model"] if risk_model.loaded else None,
        "trained_at": risk_model.metadata.get("trained_at") if risk_model.loaded else None,
        "n_employers_trained_on": risk_model.metadata.get("n_employers") if risk_model.loaded else None,
    }
