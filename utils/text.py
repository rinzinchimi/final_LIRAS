"""Text normalization helpers used to match employers across the two source datasets."""
import re

_SUFFIXES = [
    "private limited", "pvt ltd", "pvt. ltd.", "pvt ltd.", "ltd", "limited",
    "llc", "corp", "corporation", "inc", "co", "company",
]

_NON_ALNUM_RE = re.compile(r"[^a-z0-9 ]+")
_MULTI_SPACE_RE = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation/common suffixes, collapse whitespace.

    Used as a join key to reconcile employer identities between the
    enforcement-notice report and the inspection-conducted report, since
    the two source files do not share a common employer ID.
    """
    if not name or str(name).strip().lower() in ("nan", "none", ""):
        return ""
    text = str(name).lower().strip()
    text = _NON_ALNUM_RE.sub(" ", text)
    text = _MULTI_SPACE_RE.sub(" ", text).strip()
    for suffix in _SUFFIXES:
        if text.endswith(" " + suffix):
            text = text[: -(len(suffix) + 1)].strip()
    return text


def is_osh_related(text: str) -> bool:
    if not text:
        return False
    t = str(text).lower()
    return any(k in t for k in [
        "occupational health", "osh", "personal protective", "ppe",
        "safety sign", "fenced", "barricad", "hazard",
    ])
