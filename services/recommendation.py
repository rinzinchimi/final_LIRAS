"""AI Recommendation Engine (Step 10).

Generates the inspection-priority recommendation and explanation bullets for
an employer, from its trained-model risk category and its own inspection
history. The scoring/blending logic itself lives in risk_engine - this
module is the presentation layer the API routes call directly.
"""
from datetime import date, timedelta

from services.risk_engine import recommend, explain  # noqa: F401 (re-exported)


def build_recommendation_payload(risk_category: str, employer_row: dict) -> dict:
    return {
        "recommendation": recommend(risk_category, employer_row),
        "explanation": explain(employer_row),
    }


_FOLLOW_UP_DAYS = {"Critical": 3, "High": 7, "Medium": 30, "Low": 180}


def _corrective_actions(employer_row: dict, violations: list[dict]) -> list[str]:
    actions = []
    if (employer_row.get("osh_violation_count") or 0) > 0:
        actions.append("Rectify all outstanding occupational health & safety (OSH) hazards and provide required PPE.")
    if (employer_row.get("improvement_notices") or 0) > 0:
        actions.append("Close out all open improvement notices and submit compliance evidence.")
    if (employer_row.get("penalty_memos") or 0) > 0:
        actions.append("Settle outstanding penalty memos and confirm payment with the Labour Office.")
    if (employer_row.get("violation_rate") or 0) > 0.5:
        actions.append("Review internal compliance procedures - violation rate is above the sector average.")
    if any((v.get("is_osh")) for v in violations):
        actions.append("Retrain workers on workplace safety procedures relevant to cited OSH contraventions.")
    if not actions:
        actions.append("No corrective action required - continue routine compliance monitoring.")
    # de-duplicate while preserving order
    seen = set()
    out = []
    for a in actions:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out


def _enforcement_actions(risk_category: str, employer_row: dict) -> list[str]:
    penalties = employer_row.get("penalty_memos") or 0
    osh = employer_row.get("osh_violation_count") or 0
    if risk_category in ("High", "Critical"):
        actions = ["Issue a formal enforcement notice with a fixed compliance deadline."]
        if penalties >= 2 or osh >= 2:
            actions.append("Escalate to the Labour Inspectorate for further enforcement action if unresolved.")
        return actions
    if risk_category == "Medium":
        return ["Issue a written compliance reminder and schedule a follow-up inspection."]
    return ["No enforcement action required at this time."]


def _compliance_recommendations(employer_row: dict) -> list[str]:
    recs = []
    if employer_row.get("sector") == "Construction":
        recs.append("Adopt a documented site safety plan covering PPE, scaffolding, and hazard signage.")
    if (employer_row.get("days_since_last_inspection") or 0) > 365:
        recs.append("Establish a recurring self-inspection schedule between official visits.")
    if (employer_row.get("osh_ratio") or 0) > 0.3:
        recs.append("Appoint a designated OSH focal person to track corrective actions.")
    recs.append("Maintain inspection and training records for future audits.")
    return recs


def build_full_recommendation(risk_category: str, employer_row: dict, violations: list[dict],
                               reference_date: date | None = None) -> dict:
    """Builds the full, per-employer AI recommendation shown on the
    Inspection detail view and embedded in generated reports. Every field is
    derived from that employer's own data - nothing here is static text."""
    reference_date = reference_date or date.today()
    days_ahead = _FOLLOW_UP_DAYS.get(risk_category, 90)
    return {
        "summary": recommend(risk_category, employer_row),
        "inspection_priority": risk_category,
        "recommended_follow_up_date": (reference_date + timedelta(days=days_ahead)).isoformat(),
        "risk_explanation": explain(employer_row),
        "required_corrective_actions": _corrective_actions(employer_row, violations),
        "suggested_enforcement_actions": _enforcement_actions(risk_category, employer_row),
        "compliance_improvement_recommendations": _compliance_recommendations(employer_row),
    }
