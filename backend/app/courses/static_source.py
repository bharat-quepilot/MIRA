import json
from pathlib import Path

from app.courses.source import CourseSource
from app.schemas.llm_models import Course

_DATA_PATH = Path(__file__).parent / "data" / "static_courses.json"
with _DATA_PATH.open(encoding="utf-8") as f:
    _CATALOG: dict[str, list[dict]] = json.load(f)


class StaticCatalogSource(CourseSource):
    name = "static"

    async def fetch_courses(self, *, query: str, skill_id: str) -> list[Course]:
        entries = _CATALOG.get(skill_id) or _CATALOG.get("_default", [])
        return [
            Course(
                course_id=f"static:{skill_id}:{i}",
                title=entry["title"],
                channel=entry["channel"],
                duration_minutes=entry.get("durationMinutes"),
                url=entry["url"],
                thumbnail=entry.get("thumbnail"),
                quality_score=0.7,
            )
            for i, entry in enumerate(entries)
        ]
