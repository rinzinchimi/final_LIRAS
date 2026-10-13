"""
Date parsing helpers.

The source Excel files store dates as free-text strings like:
    "26th June , 2026"
    "4th November , 2025"
This module normalizes those strings into real datetime.date objects.
"""
import re
from datetime import date, datetime
from typing import Optional

_ORDINAL_RE = re.compile(r"(\d+)(st|nd|rd|th)", flags=re.IGNORECASE)
_SPACE_BEFORE_COMMA_RE = re.compile(r"\s+,")


def clean_date_string(raw: str) -> Optional[str]:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or text.lower() in ("nan", "none", "-", "n/a"):
        return None
    text = _ORDINAL_RE.sub(r"\1", text)          # "26th" -> "26"
    text = _SPACE_BEFORE_COMMA_RE.sub(",", text)  # "June , 2026" -> "June, 2026"
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_date(raw) -> Optional[date]:
    """Best-effort parse of the messy date strings used in the source reports."""
    if raw is None:
        return None
    # Excel may already give us a real datetime/Timestamp
    if isinstance(raw, (datetime, date)):
        return raw.date() if isinstance(raw, datetime) else raw

    cleaned = clean_date_string(raw)
    if not cleaned:
        return None

    formats = [
        "%d %B, %Y",
        "%d %B %Y",
        "%d %b, %Y",
        "%d %b %Y",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue

    # Last resort: pandas' flexible parser
    try:
        import pandas as pd
        parsed = pd.to_datetime(cleaned, errors="coerce")
        if parsed is not None and not pd_isnull(parsed):
            return parsed.date()
    except Exception:
        pass
    return None


def pd_isnull(value) -> bool:
    try:
        import pandas as pd
        return bool(pd.isnull(value))
    except Exception:
        return value is None
