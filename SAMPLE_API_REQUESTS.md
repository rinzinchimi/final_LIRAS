# Sample API Requests & Responses

Base URL when running locally: `http://localhost:8000/api`

All responses below were captured from a real run of this backend against
the supplied Excel data (457 employers after cleaning).

---

## GET /api/risk-summary

```bash
curl http://localhost:8000/api/risk-summary
```

```json
{
  "high_risk_count": 8,
  "medium_risk_count": 107,
  "low_risk_count": 342,
  "average_risk_score": 14.69,
  "total_employers": 457
}
```

---

## GET /api/employers?limit=2

```bash
curl "http://localhost:8000/api/employers?limit=2"
```

```json
[
  {
    "id": "EMP0002",
    "name": "Jaiprakash Associates Ltd",
    "sector": "Construction",
    "dzongkhag": "Wangdue Phodrang",
    "location": "Zawakha",
    "total_inspections": 2,
    "improvement_notices": 2,
    "penalty_memos": 2,
    "notices_count": 4,
    "total_penalty_amount": 22500.0,
    "osh_violation_count": 4,
    "osh_ratio": 1.0,
    "last_inspection_date": "2026-03-26",
    "days_since_last_inspection": 116,
    "inspection_frequency": 4.0,
    "violation_rate": 2.0,
    "statistical_score": 96.82,
    "ml_probability": 0.9566666666666667,
    "final_risk_score": 96.24,
    "risk_category": "High",
    "ml_predicted_category": "High",
    "recommendation": "Conduct inspection within 7 days due to repeated OSH violations."
  }
]
```
(second employer omitted for brevity - see `/api/employers` for the full list)

---

## GET /api/employer/{id}

```bash
curl http://localhost:8000/api/employer/EMP0002
```

Returns everything in `EmployerOut` above, plus `violations[]`,
`inspections[]`, and `ai_explanation[]` (a list of plain-language reasons
behind the score).

---

## POST /api/predict

```bash
curl -X POST http://localhost:8000/api/predict \
  -H "Content-Type: application/json" \
  -d '{
        "employer_name": "Sample Traders",
        "industry": "construction",
        "employees": 60,
        "previous_violations": 2,
        "worker_complaints": 1,
        "workplace_accidents": 1,
        "osh_violations": 2
      }'
```

```json
{
  "employer_name": "Sample Traders",
  "risk_score": 69.59,
  "risk_category": "Medium",
  "statistical_score": 83.0,
  "ml_probability": 0.5618,
  "recommendation": "Schedule inspection within one month - compliance has not been re-checked recently.",
  "explanation": [
    "2 occupational health & safety violation(s) detected.",
    "Multiple violations recorded per inspection visit.",
    "Construction sector carries elevated baseline workplace hazards."
  ]
}
```

---

## POST /api/retrain

```bash
curl -X POST http://localhost:8000/api/retrain
```

Re-runs the cleaning/merge pipeline, retrains all 5 models, and returns the
new comparison table plus the model chosen as best, e.g.:

```json
{
  "status": "success",
  "best_model": "Random Forest",
  "n_employers": 457,
  "results": { "...": "per-model accuracy / precision / recall / F1 / ROC AUC / CV scores" }
}
```

---

## POST /api/upload-new-data

```bash
curl -X POST http://localhost:8000/api/upload-new-data \
  -F "notices_file=@/path/to/New_Inspection_Report.xlsx" \
  -F "retrain=true"
```

```json
{
  "status": "success",
  "employers_processed": 461,
  "duplicates_removed": 3,
  "model_retrained": true,
  "best_model": "Random Forest"
}
```

---

## GET /api/feature-importance

```json
{
  "available": true,
  "best_model": "Random Forest",
  "feature_importance": {
    "osh_violation_count": 0.2703,
    "violation_rate": 0.2643,
    "osh_ratio": 0.1607,
    "penalty_memos": 0.0977
  }
}
```

## GET /api/model-performance

```json
{
  "models": [
    {
      "model_name": "Logistic Regression",
      "accuracy": 0.9891,
      "precision_macro": 0.8333,
      "recall_macro": 0.9848,
      "f1_macro": 0.8811,
      "roc_auc_macro": 1.0,
      "cv_f1_macro_mean": 0.8861,
      "cv_f1_macro_std": 0.05,
      "is_best": false
    }
  ],
  "best_model": "Random Forest",
  "trained_at": "2026-07-20T05:47:00",
  "n_employers_trained_on": 457
}
```
