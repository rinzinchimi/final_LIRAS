from datetime import datetime

from sqlalchemy import (
    Column, Date, DateTime, Float, ForeignKey, Integer, String, Boolean, Text
)
from sqlalchemy.orm import relationship

from database import Base


class Employer(Base):
    __tablename__ = "employers"

    id = Column(String, primary_key=True)  # e.g. "EMP0001"
    employer_key = Column(String, index=True)
    name = Column(String, index=True, nullable=False)
    sector = Column(String, index=True)
    dzongkhag = Column(String, index=True)
    location = Column(String)
    employer_ext_id = Column(String, nullable=True)
    mobile = Column(String, nullable=True)
    email = Column(String, nullable=True)

    total_inspections = Column(Integer, default=0)
    improvement_notices = Column(Integer, default=0)
    penalty_memos = Column(Integer, default=0)
    notices_count = Column(Integer, default=0)
    total_penalty_amount = Column(Float, default=0.0)
    osh_violation_count = Column(Integer, default=0)
    osh_ratio = Column(Float, default=0.0)

    last_inspection_date = Column(Date, nullable=True)
    first_inspection_date = Column(Date, nullable=True)
    days_since_last_inspection = Column(Integer, default=0)
    inspection_frequency = Column(Float, default=0.0)
    violation_rate = Column(Float, default=0.0)

    statistical_score = Column(Float, default=0.0)
    ml_probability = Column(Float, default=0.0)
    final_risk_score = Column(Float, default=0.0)
    risk_category = Column(String, default="Low", index=True)
    ml_predicted_category = Column(String, nullable=True)
    recommendation = Column(Text, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow)

    inspections = relationship("Inspection", back_populates="employer", cascade="all, delete-orphan")
    violations = relationship("Violation", back_populates="employer", cascade="all, delete-orphan")


class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employer_id = Column(String, ForeignKey("employers.id"), index=True)
    inspection_type = Column(String)
    inspection_date = Column(Date, nullable=True)
    inspector = Column(String, nullable=True)
    dzongkhag = Column(String, nullable=True)
    sector = Column(String, nullable=True)
    location = Column(String, nullable=True)
    source = Column(String)  # "conducted" | "notice" | "scheduled"
    status = Column(String, default="Pending", index=True)  # "Pending" | "Completed"

    employer = relationship("Employer", back_populates="inspections")


class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employer_id = Column(String, ForeignKey("employers.id"), index=True)
    notice_type = Column(String)
    inspection_date = Column(Date, nullable=True)
    amount = Column(Float, default=0.0)
    contravention = Column(Text, nullable=True)
    section_act = Column(Text, nullable=True)
    section_no = Column(String, nullable=True)
    particulars = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    is_osh = Column(Boolean, default=False)

    employer = relationship("Employer", back_populates="violations")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_code = Column(String, unique=True, index=True)
    employer_id = Column(String, ForeignKey("employers.id"), nullable=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=True)
    report_type = Column(String, default="Inspection Report")
    status = Column(String, default="Completed", index=True)  # "Pending" | "Completed"
    file_format = Column(String, default="pdf")
    file_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    employer = relationship("Employer")
    inspection = relationship("Inspection")


class ModelMetric(Base):
    __tablename__ = "model_metrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_name = Column(String)
    accuracy = Column(Float, nullable=True)
    precision_macro = Column(Float, nullable=True)
    recall_macro = Column(Float, nullable=True)
    f1_macro = Column(Float, nullable=True)
    roc_auc_macro = Column(Float, nullable=True)
    cv_f1_macro_mean = Column(Float, nullable=True)
    cv_f1_macro_std = Column(Float, nullable=True)
    is_best = Column(Boolean, default=False)
    trained_at = Column(DateTime, default=datetime.utcnow)
