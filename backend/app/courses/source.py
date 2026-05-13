from abc import ABC, abstractmethod

from app.schemas.llm_models import Course


class CourseSource(ABC):
    name: str

    @abstractmethod
    async def fetch_courses(self, *, query: str, skill_id: str) -> list[Course]:
        ...
