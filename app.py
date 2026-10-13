from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import SessionLocal, init_db
from routes import dashboard, employers, predict, upload, model_info, inspections, reports
from services.loader import reload_database, store_model_metrics
from services.risk_engine import risk_model

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TRAINED_MODEL_DIR = BASE_DIR / "trained_model"


def create_app() -> FastAPI:
    app = FastAPI(
        title="ALIRAS / LIRAS API",
        description="AI-Powered Labour Inspection Risk Assessment System - backend API",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(dashboard.router, prefix="/api")
    app.include_router(employers.router, prefix="/api")
    app.include_router(predict.router, prefix="/api")
    app.include_router(upload.router, prefix="/api")
    app.include_router(model_info.router, prefix="/api")
    app.include_router(inspections.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "model_loaded": risk_model.loaded}

    @app.on_event("startup")
    def on_startup():
        init_db()
        db = SessionLocal()
        try:
            # Train the model on first run (no persisted model yet), otherwise
            # just load the existing model and (re)populate the DB from it.
            from models import Employer
            db_is_empty = db.query(Employer).count() == 0

            if not (TRAINED_MODEL_DIR / "best_model.joblib").exists():
                from ml.train import train_and_select_best
                out = train_and_select_best(save=True)
                risk_model.reload()
                reload_database(db)
                store_model_metrics(db, out["metadata"])
            else:
                risk_model.reload()
                if db_is_empty:
                    reload_database(db)
                store_model_metrics(db, risk_model.metadata)
        finally:
            db.close()

    # Serve the (untouched) frontend as static files, so the whole app runs
    # from a single `uvicorn main:app` process - no separate frontend server.
    if STATIC_DIR.exists():
        app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

    return app


app = create_app()
