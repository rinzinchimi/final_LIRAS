# LIRAS - Labour Inspection Risk Assessment System

An AI-powered decision-support tool for the Labour Protection Division,
Ministry of Industry, Commerce and Employment (Bhutan), that scores
employers on labour-law-violation risk so Labour Officers can prioritize
inspections.

This delivers the backend, ML pipeline, and database requested for the
existing frontend (`backend/static/`, an untouched copy of the supplied
website with the minimum JS/id additions needed to load real data).

## Quick start

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Then open **http://localhost:8000** in a browser (redirects to the login
page; demo credentials are `admin@liras.gov.bt` / `admin123`, unchanged
from the original frontend). The FastAPI backend serves both the API
(`/api/...`) and the static frontend from the same process.

On first run, startup will automatically:
1. clean and merge the two Excel reports in `/mnt/user-data/uploads/` (or
   wherever you configure - see below),
2. train and compare 5 ML models, pick the best, and save it to
   `backend/trained_model/`,
3. populate `backend/data/liras.db` (SQLite),
4. and only then start serving requests.

This takes about 15-30 seconds the first time. Subsequent restarts reuse
the saved model unless you call `POST /api/retrain`.

Interactive API docs (Swagger UI) are available at **/docs** once running.

## Where your source Excel files live

By default the pipeline reads from the exact paths the two uploaded files
were provided at:
- `/mnt/user-data/uploads/Inspection__Report.xlsx` (enforcement notices)
- `/mnt/user-data/uploads/Inspection_Conducted_Report__1_.xlsx` (routine inspections)

To point at different files permanently, edit `REPORT1_PATH_DEFAULT` /
`REPORT2_PATH_DEFAULT` in `backend/services/data_pipeline.py`, or upload new
files at runtime through `POST /api/upload-new-data` (see below) - no code
changes needed for that path.

## Project layout

```
project/
├── frontend/            copy of the original static site, unmodified
├── backend/
│   ├── app.py            FastAPI app factory, CORS, routers, static mount, startup hook
│   ├── main.py            `uvicorn main:app` entry point
│   ├── database.py        SQLAlchemy engine/session (SQLite by default)
│   ├── models.py          ORM tables: Employer, Inspection, Violation, ModelMetric
│   ├── schemas.py          Pydantic request/response models
│   ├── crud.py             DB query helpers used by the routes
│   ├── routes/             dashboard.py, employers.py, predict.py, upload.py, model_info.py
│   ├── services/
│   │   ├── data_pipeline.py   Step 1-3: load, clean, merge, engineer features, statistical score
│   │   ├── risk_engine.py     Step 3: blend statistical + ML scores; recommendations
│   │   ├── recommendation.py  Step 10 facade over risk_engine
│   │   └── loader.py          populates the DB from the pipeline output
│   ├── ml/
│   │   ├── features.py     shared feature-matrix builder (training + live prediction)
│   │   ├── train.py         Step 4-5: trains/evaluates/selects/saves the best model
│   │   └── predict.py       Step: scores a single new employer from a form submission
│   ├── utils/               date parsing, name normalization
│   ├── static/               the frontend, served directly by FastAPI
│   ├── uploads/               new Excel files land here via /upload-new-data
│   ├── trained_model/         best_model.joblib, label_encoder.joblib, metadata.json
│   ├── data/                  liras.db (SQLite) + CSV snapshots
│   ├── requirements.txt
│   ├── .env.example
│   ├── run.sh
│   └── SAMPLE_API_REQUESTS.md
└── README.md (this file)
```

## The data: what's really in the two Excel files

- **Inspection Report.xlsx** (145 rows): one row per *enforcement notice*
  (Improvement Notice / Penalty Memo) issued to a Construction-sector
  employer. Always has an `Employer Id`; ~50% of rows are missing the
  enterprise name.
- **Inspection Conducted Report.xlsx** (530 rows): one row per *routine
  inspection visit*, across many sectors. Always has a company name, never
  an Employer Id, and its own "Application No" column is a *different*
  numbering scheme from the notices file - the two files do **not** share a
  key.

Because there's no common ID, employer identity across the two files is
reconciled by **normalized company name** (lowercased, punctuation and
legal suffixes like "Pvt Ltd" stripped). Employers that only ever appear in
the notices file with no name at all are kept as their own record, keyed
by their numeric Employer Id (`services/data_pipeline.py`,
`build_employer_dataset`). This merge produced **457 unique employers**
from the 145 + 530 raw rows, with **0 exact-duplicate rows removed** (some
near-duplicates may remain where the same employer was reached under two
slightly different name spellings; a stricter fuzzy-match pass is a
reasonable follow-up if that turns out to matter in practice).

## The risk score: how it's actually computed (Steps 2-3)

**Engineered features**, all derived from the historical data (no
placeholders): total inspections, improvement notices, penalty memos,
total penalty amount, OSH-violation count and ratio, days since last
inspection, inspection frequency (visits/year), and violation rate
(violations per inspection).

**Statistical score (0-100)**: a weighted, min-max-normalized combination
of violation rate (30%), penalty severity (20%), OSH ratio (15%), violation
recency (20%, decaying over ~2 years), and repeat-offender count (15%) -
see `WEIGHTS` in `data_pipeline.py`. Every component is normalized against
the *current employer population*, so the score reflects each employer's
standing relative to real historical data, not an arbitrary constant.

**ML score**: 5 classifiers (Logistic Regression, Decision Tree, Random
Forest, Gradient Boosting, XGBoost) are trained to predict the risk
category from the same engineered features plus sector/dzongkhag. All 5
are compared on accuracy, precision, recall, F1, ROC AUC, confusion
matrix, and cross-validation; the best by ROC AUC (tie-broken by F1) is
kept and saved via `joblib`.

**Final score** = 50% statistical + 50% ML-predicted probability of
"High"/"Medium", clipped to 0-100 (`risk_engine.blend_scores`).

**An honest caveat, stated plainly:** there is no ground-truth label in
the source data for "this employer *will* violate the law in the future" -
only a record of *past* enforcement actions. The ML models are trained
against the statistical score itself as a bootstrap label. That means they
currently validate and reproduce the statistical rule rather than
discovering an independent signal (hence the very high reported
accuracy/ROC-AUC in `model-performance` - it's learning a mostly
deterministic function of its own inputs). This is still useful: it lets
ALIRAS score a **new** employer from partial information (see
`POST /predict`) using a model instead of only the fixed formula, and it's
architected so that once real outcome data accumulates (e.g., "was a
violation found at the next inspection?"), you swap the label source in
`ml/train.py` and every downstream endpoint keeps working unchanged.
This tradeoff, and the rationale, is also documented directly in the
`ml/train.py` module docstring.

## API endpoints

All under `/api`, all JSON. Full request/response examples in
`backend/SAMPLE_API_REQUESTS.md`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard` | full dashboard payload: totals, trends, priority list, recent inspections |
| GET | `/risk-summary` | high/medium/low counts + average score |
| GET | `/high-risk`, `/medium-risk`, `/low-risk` | employer lists by tier |
| GET | `/employers` | list, filterable by `risk_category`, `sector`, `search` |
| GET | `/employer/{id}` | full employer detail incl. violations, inspections, AI explanation |
| POST | `/predict` | score a new employer from form inputs |
| POST | `/retrain` | re-run pipeline, retrain all 5 models, replace the saved model |
| POST | `/upload-new-data` | upload updated Excel file(s), auto clean/merge/(re)train |
| GET | `/analytics` | sector/dzongkhag breakdowns, inspection & violation trends |
| GET | `/feature-importance` | best model's feature importances |
| GET | `/model-performance` | all 5 models' metrics + which was chosen |
| GET | `/inspection-priority` | every employer ranked highest-risk first |
| GET | `/health` | liveness + whether the model is loaded |

## Frontend changes made (kept to the minimum required to load real data)

Per your instructions, no layout, CSS, colors, or animations were touched.
The only additions:
- `id` attributes on previously-unlabelled stat numbers, table bodies, and
  the AI recommendation box, so JS can target them.
- A new shared `api.js` (fetch helper) and page-specific `dashboard.js` /
  `employers.js` / `risk-assessment.js` / `inspection.js` / `reports.js`
  that replace the old hardcoded arrays with real `fetch()` calls to the
  backend above. `risk-assessment.js` still degrades gracefully to the
  original local formula if the API is ever unreachable.
- A tiny `index.html` that redirects `/` to `login.html` (the original
  site had no root page).
- **Bug fix**: the original `login.js` declared and used `form` twice with
  a `const`/TDZ ordering issue that would throw a `ReferenceError` on load
  and break the login button entirely; this has been cleaned up to a
  single, working handler (same demo credentials, same behavior).
- All frontend files were normalized from CRLF to LF line endings (no
  visual/content change, just avoids editor/diff noise).

## Retraining / new data

`POST /upload-new-data` accepts one or both updated `.xlsx` files
(`notices_file`, `inspections_file`), saves them to `backend/uploads/`,
re-runs the full clean → merge → feature-engineer → (optionally) retrain →
reload pipeline, and refreshes every employer's score in the database -
with no code changes. `POST /retrain` does the same retraining step against
whatever Excel files are already configured, without requiring a new
upload.

## Known limitations / good next steps

- The bootstrap-label ML approach above (swap in real outcome data once
  available).
- Employer name matching is exact-normalized, not fuzzy; e.g. minor typos
  across the two source files could create duplicate employer records.
- No authentication on the API itself (the frontend's login gate is
  client-side only, as it was originally) - add a real auth layer
  (e.g. OAuth2/JWT with FastAPI's built-in support) before any real
  deployment.
- The "8 High risk" employers in the current data is a very small positive
  class; treat the model's precision/recall on that class as indicative,
  not final, until more labelled examples accumulate.
