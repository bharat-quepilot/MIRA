import json
import re
from dataclasses import dataclass
from pathlib import Path

_DATA_PATH = Path(__file__).parent / "data" / "skills.json"
with _DATA_PATH.open(encoding="utf-8") as f:
    _TAXONOMY: list[dict] = json.load(f)

_BY_ID: dict[str, dict] = {entry["id"]: entry for entry in _TAXONOMY}


@dataclass(frozen=True)
class MatchedSkill:
    id: str
    canonical: str
    category: str


def all_skills() -> list[dict]:
    return _TAXONOMY


def get_by_id(skill_id: str) -> dict | None:
    return _BY_ID.get(skill_id)


def canonicalize(name: str) -> str:
    """Return the canonical form if name maps to a known skill; else the original."""
    matches = match_skills(name)
    return matches[0].canonical if matches else name


def match_skills(text: str) -> list[MatchedSkill]:
    """Word-boundary keyword match against the taxonomy. Returns matches in taxonomy order."""
    if not text:
        return []
    matched: list[MatchedSkill] = []
    seen: set[str] = set()
    lower = text.lower()

    for skill in _TAXONOMY:
        if skill["id"] in seen:
            continue
        terms = [skill["canonical"]] + skill["aliases"]
        for term in terms:
            pattern = rf"(?<![A-Za-z0-9]){re.escape(term.lower())}(?![A-Za-z0-9])"
            if re.search(pattern, lower):
                matched.append(
                    MatchedSkill(
                        id=skill["id"],
                        canonical=skill["canonical"],
                        category=skill["category"],
                    )
                )
                seen.add(skill["id"])
                break
    return matched
