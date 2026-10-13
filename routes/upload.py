import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from ml.train import train_and_select_best
from schemas import UploadResult
from services.loader import reload_database, store_model_metrics
from services.risk_engine import risk_model

router = APIRouter(tags=["upload"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/upload-new-data", response_model=UploadResult)
async def upload_new_data(
    notices_file: UploadFile | None = File(None, description="New 'Inspection Report' (violations/notices) .xlsx"),
    inspections_file: UploadFile | None = File(None, description="New 'Inspection Conducted Report' .xlsx"),
    retrain: bool = True,
    db: Session = Depends(get_db),
):
    """Accepts one or both updated Excel exports, re-runs the full clean ->
    merge -> (optionally) retrain -> reload pipeline automatically, with no
    code changes required (Step 12)."""
    if not notices_file and not inspections_file:
        raise HTTPException(status_code=400, detail="Upload at least one of notices_file or inspections_file")

    notices_path = None
    inspections_path = None

    if notices_file:
        notices_path = str(UPLOAD_DIR / notices_file.filename)
        with open(notices_path, "wb") as f:
            shutil.copyfileobj(notices_file.file, f)

    if inspections_file:
        inspections_path = str(UPLOAD_DIR / inspections_file.filename)
        with open(inspections_path, "wb") as f:
            shutil.copyfileobj(inspections_file.file, f)

    # Fall back to the last-known-good file for whichever side wasn't re-uploaded
    from services import data_pipeline as dp
    notices_path = notices_path or dp.REPORT1_PATH_DEFAULT
    inspections_path = inspections_path or dp.REPORT2_PATH_DEFAULT

    best_model = None
    out = None
    if retrain:
        out = train_and_select_best(save=True)
        best_model = out["metadata"]["best_model"]
        risk_model.reload()

    load_result = reload_database(db, notices_path=notices_path, inspections_path=inspections_path)
    if retrain and out:
        store_model_metrics(db, out["metadata"])

    return UploadResult(
        status="success",
        employers_processed=load_result["employers_processed"],
        duplicates_removed=load_result["duplicates_removed"],
        model_retrained=retrain,
        best_model=best_model,
    )
