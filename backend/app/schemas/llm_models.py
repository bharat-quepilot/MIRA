from typing import Literal
from pydantic import BaseModel, Field


# ─── Agent 1: Resume Parser ─────────────────────────────────
class ResumeSkill(BaseModel):
    name: str
    proficiency: Literal["mentioned", "used", "strong"]
    evidence: str = Field(max_length=200)


class ResumeStructured(BaseModel):
    years_experience: int | None = None
    role: str
    skills: list[ResumeSkill]
    domains: list[str]


# ─── Agent 2: JD Parser ─────────────────────────────────────
class JdSkill(BaseModel):
    skill: str
    weight: int = Field(ge=1, le=5)
    source_quote: str = Field(max_length=200)


class JdStructured(BaseModel):
    role: str
    seniority: Literal["junior", "mid", "senior", "lead", "unknown"]
    required: list[JdSkill]
    nice_to_have: list[JdSkill]


# ─── Agent 3: Gap Reasoner ──────────────────────────────────
class Gap(BaseModel):
    skill: str
    category: Literal["required", "nice_to_have"]
    severity: int = Field(ge=1, le=5)
    status: Literal["missing", "weak"]
    evidence: str = Field(max_length=300)
    jd_quote: str = Field(max_length=200)
    search_query: str = Field(max_length=100)


class GapAnalysis(BaseModel):
    overall_match_score: int = Field(ge=0, le=100)
    gaps: list[Gap]
    strengths_matching: list[str]


# ─── Agent 4: Study Planner ─────────────────────────────────
class StudyPlanItem(BaseModel):
    gap_skill: str
    search_queries: list[str] = Field(min_length=1, max_length=3)
    prerequisites: list[str]
    estimated_hours: int = Field(ge=1, le=200)
    learning_order_rank: int = Field(ge=1)


class StudyPlan(BaseModel):
    items: list[StudyPlanItem]


# ─── Agent 5: Course Curator ────────────────────────────────
class Course(BaseModel):
    course_id: str
    title: str
    channel: str
    duration_minutes: int | None = None
    url: str
    thumbnail: str | None = None
    quality_score: float = Field(ge=0.0, le=1.0)
