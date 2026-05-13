from pydantic import BaseModel, Field

from app.schemas.llm_models import Gap, Course


class AnalyzeRequest(BaseModel):
    resume: str = Field(min_length=1, max_length=8000)
    jd: str = Field(min_length=1, max_length=8000)


class EnrichedGap(Gap):
    courses: list[Course]
    estimated_hours: int


class AnalyzeMeta(BaseModel):
    fallbacks_used: list[str]
    agent_timings_ms: dict[str, float]
    mock_mode: bool


class AnalyzeResponse(BaseModel):
    match_score: int
    required_gaps: list[EnrichedGap]
    nice_to_have_gaps: list[EnrichedGap]
    strengths: list[str]
    meta: AnalyzeMeta
