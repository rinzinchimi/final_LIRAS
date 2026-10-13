from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class EmployerOut(BaseModel):
    id: str
    name: str
    sector: str
    dzongkhag: str
    location: Optional[str] = None
    total_inspections: int
    improvement_notices: int
    penalty_memos: int
    notices_count: int
    total_penalty_amount: float
    osh_violation_count: int
    osh_ratio: float
    last_inspection_date: Optional[date] = None
    days_since_last_inspection: int
    inspection_frequency: float
    violation_rate: float
    statistical_score: float
    ml_probability: float
    final_risk_score: float
    risk_category: str
    ml_predicted_category: Optional[str] = None
    recommendation: Optional[str] = None

    class Config:
        from_attributes = True


class ViolationOut(BaseModel):
    notice_type: str
    inspection_date: Optional[date] = None
    amount: float
    contravention: Optional[str] = None
    section_act: Optional[str] = None
    section_no: Optional[str] = None
    particulars: Optional[str] = None
    remarks: Optional[str] = None
    is_osh: bool

    class Config:
        from_attributes = True


class InspectionOut(BaseModel):
    inspection_type: str
    inspection_date: Optional[date] = None
    inspector: Optional[str] = None
    source: str

    class Config:
        from_attributes = True


class EmployerDetailOut(EmployerOut):
    violations: list[ViolationOut] = []
    inspections: list[InspectionOut] = []
    ai_explanation: list[str] = []


class PredictRequest(BaseModel):
    employer_name: str = Field(..., description="Employer / company name")
    industry: str = Field(..., description="construction | manufacturing | service | agriculture | ...")
    employees: Optional[int] = 0
    previous_violations: int = 0
    worker_complaints: int = 0
    workplace_accidents: int = 0
    osh_violations: int = 0
    penalty_memos: int = 0
    total_inspections: int = 1
    total_penalty_amount: float = 0.0
    days_since_last_inspection: int = 365
    dzongkhag: Optional[str] = "Other"


class PredictResponse(BaseModel):
    employer_name: str
    risk_score: float
    risk_category: str
    statistical_score: float
    ml_probability: float
    recommendation: str
    explanation: list[str]


class InspectionStatusUpdate(BaseModel):
    status: str = Field(..., description="Pending | Completed")


class InspectionScheduleRequest(BaseModel):
    employer_name: str
    inspector: str
    inspection_date: Optional[date] = None


class ReportGenerateRequest(BaseModel):
    employer_id: str
    report_type: Optional[str] = "Inspection Report"
    file_format: Optional[str] = Field("pdf", description="pdf | docx")


class ReportOut(BaseModel):
    id: int
    report_code: str
    employer_id: Optional[str] = None
    employer_name: Optional[str] = None
    report_type: str
    status: str
    file_format: str
    created_at: str

    class Config:
        from_attributes = True


class UploadResult(BaseModel):
    status: str
    employers_processed: int
    duplicates_removed: int
    model_retrained: bool
    best_model: Optional[str] = None
