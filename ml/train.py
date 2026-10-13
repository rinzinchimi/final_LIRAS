"""
Trains Logistic Regression, Decision Tree, Random Forest, Gradient Boosting
and XGBoost classifiers to predict an employer's risk category (High /
Medium / Low) from its inspection/violation history, compares them on
accuracy / precision / recall / F1 / ROC AUC / cross-validation, picks the
best model, and persists it (Steps 4-5 of the spec).

The training label is the statistical risk_category produced by
`services.data_pipeline`. That score is built directly from historical
enforcement/inspection data (violation rate, penalty severity, OSH ratio,
recency, repeat-offender count) - see data_pipeline.WEIGHTS. Training a
classifier against it turns that fixed scoring rule into a generalizable
model: once deployed, ALIRAS can score an employer from partial data (e.g.
before a full violation history exists) and, as real inspection outcomes
accumulate over time, the label in ml/retrain can be swapped for observed
future-violation data without changing anything else in this pipeline.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.metrics import (
    accuracy_score, confusion_matrix, f1_score, precision_score,
    recall_score, roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier

try:
    from xgboost import XGBClassifier
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

from ml.features import build_feature_frame
from services.data_pipeline import run_pipeline

MODEL_DIR = Path(__file__).resolve().parent.parent / "trained_model"
MODEL_DIR.mkdir(exist_ok=True)


def _build_models(n_classes: int) -> dict:
    models = {
        "Logistic Regression": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=2000)),
        ]),
        "Decision Tree": DecisionTreeClassifier(max_depth=6, random_state=42),
        "Random Forest": RandomForestClassifier(
            n_estimators=300, max_depth=8, random_state=42, n_jobs=-1),
        "Gradient Boosting": GradientBoostingClassifier(random_state=42),
    }
    if HAS_XGB:
        models["XGBoost"] = XGBClassifier(
            n_estimators=300, max_depth=5, learning_rate=0.1,
            eval_metric="mlogloss", random_state=42, n_jobs=-1)
    return models


def _safe_roc_auc(y_true, proba, n_classes) -> float | None:
    try:
        if n_classes == 2:
            return round(float(roc_auc_score(y_true, proba[:, 1])), 4)
        return round(float(roc_auc_score(y_true, proba, multi_class="ovr", average="macro")), 4)
    except Exception:
        return None


def train_and_select_best(save: bool = True) -> dict:
    pipeline_result = run_pipeline()
    employers = pipeline_result["employers"]

    X = build_feature_frame(employers)
    y_raw = employers["risk_category"]

    encoder = LabelEncoder()
    y = encoder.fit_transform(y_raw)
    n_classes = len(encoder.classes_)

    stratify = y if min(np.bincount(y)) >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify)

    models = _build_models(n_classes)
    results = {}
    fitted = {}

    n_splits = min(3, int(min(np.bincount(y))))
    n_splits = max(n_splits, 2)
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    for name, model in models.items():
        t0 = time.time()
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test) if hasattr(model, "predict_proba") else None

        try:
            cv_scores = cross_val_score(model, X, y, cv=cv, scoring="f1_macro")
            cv_mean, cv_std = float(cv_scores.mean()), float(cv_scores.std())
        except Exception:
            cv_mean, cv_std = None, None

        results[name] = {
            "accuracy": round(float(accuracy_score(y_test, preds)), 4),
            "precision_macro": round(float(precision_score(y_test, preds, average="macro", zero_division=0)), 4),
            "recall_macro": round(float(recall_score(y_test, preds, average="macro", zero_division=0)), 4),
            "f1_macro": round(float(f1_score(y_test, preds, average="macro", zero_division=0)), 4),
            "roc_auc_macro": _safe_roc_auc(y_test, proba, n_classes) if proba is not None else None,
            "cv_f1_macro_mean": round(cv_mean, 4) if cv_mean is not None else None,
            "cv_f1_macro_std": round(cv_std, 4) if cv_std is not None else None,
            "confusion_matrix": confusion_matrix(y_test, preds).tolist(),
            "classes": encoder.classes_.tolist(),
            "train_seconds": round(time.time() - t0, 3),
        }
        fitted[name] = model

    def rank_key(name):
        r = results[name]
        return (r["roc_auc_macro"] if r["roc_auc_macro"] is not None else 0, r["f1_macro"])

    best_name = max(results, key=rank_key)
    best_model = fitted[best_name]

    # Feature importance (native for tree models; |coef| for logistic regression)
    feature_importance = {}
    try:
        if hasattr(best_model, "feature_importances_"):
            importances = best_model.feature_importances_
        elif hasattr(best_model, "named_steps"):
            importances = np.abs(best_model.named_steps["clf"].coef_).mean(axis=0)
        else:
            importances = None
        if importances is not None:
            feature_importance = dict(sorted(
                zip(X.columns.tolist(), [round(float(v), 4) for v in importances]),
                key=lambda kv: kv[1], reverse=True))
    except Exception:
        feature_importance = {}

    metadata = {
        "best_model": best_name,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_employers": len(employers),
        "n_features": X.shape[1],
        "feature_columns": X.columns.tolist(),
        "label_classes": encoder.classes_.tolist(),
        "results": results,
        "feature_importance": feature_importance,
        "pipeline_meta": pipeline_result["meta"],
    }

    if save:
        joblib.dump(best_model, MODEL_DIR / "best_model.joblib")
        joblib.dump(encoder, MODEL_DIR / "label_encoder.joblib")
        with open(MODEL_DIR / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2, default=str)
        employers.to_csv(MODEL_DIR / "employers_snapshot.csv", index=False)
        pipeline_result["notices"].drop(columns=["notice_dates"], errors="ignore").to_csv(
            MODEL_DIR / "notices_snapshot.csv", index=False)
        pipeline_result["inspections"].drop(columns=["insp_dates"], errors="ignore").to_csv(
            MODEL_DIR / "inspections_snapshot.csv", index=False)

    return {"metadata": metadata, "employers": employers, "model": best_model, "encoder": encoder}


if __name__ == "__main__":
    out = train_and_select_best()
    print(json.dumps(out["metadata"]["results"], indent=2))
    print("Best model:", out["metadata"]["best_model"])
