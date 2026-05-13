# MIRA — Low-Level Design (LLD)

**Companion to:** `01-architecture.md`, `02-hld.md`
**Purpose:** File-by-file implementation guide. Read this with an editor open.

---

## 1. Repo Structure

```
mira/
├── backend/                            # FastAPI (Python)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # FastAPI app + CORS
│   │   ├── config.py                   # Pydantic Settings (env vars)
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── analyze.py              # POST /analyze
│   │   │   └── health.py               # GET /health
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   ├── run_agent.py            # Facade for LLM calls
│   │   │   ├── resume_parser.py        # Agent 1
│   │   │   ├── jd_parser.py            # Agent 2
│   │   │   ├── gap_reasoner.py         # Agent 3
│   │   │   ├── study_planner.py        # Agent 4
│   │   │   ├── course_curator.py       # Agent 5
│   │   │   ├── orchestrator.py
│   │   │   └── prompts/
│   │   │       ├── __init__.py
│   │   │       ├── resume_parser.py
│   │   │       ├── jd_parser.py
│   │   │       ├── gap_reasoner.py
│   │   │       └── study_planner.py
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   ├── provider.py             # LLMProvider ABC (Adapter)
│   │   │   ├── openai_provider.py      # OpenAI impl
│   │   │   ├── mock_provider.py        # Mock impl for no-key demo
│   │   │   └── mock_responses.py       # Hand-crafted sample response
│   │   ├── courses/
│   │   │   ├── __init__.py
│   │   │   ├── source.py               # CourseSource ABC (Adapter)
│   │   │   ├── youtube_source.py
│   │   │   ├── static_source.py
│   │   │   ├── ranker.py
│   │   │   └── data/
│   │   │       └── static_courses.json
│   │   ├── taxonomy/
│   │   │   ├── __init__.py
│   │   │   ├── matcher.py              # Hybrid matcher: keyword + embedding
│   │   │   ├── index.py                # NEW: TaxonomyIndex (pre-computed embeddings)
│   │   │   └── data/
│   │   │       └── skills.json
│   │   ├── semantic/                   # NEW — Optimization layer
│   │   │   ├── __init__.py
│   │   │   ├── embedder.py             # OpenAI embeddings client (Adapter)
│   │   │   └── cosine.py               # Cosine similarity helper
│   │   ├── cache/                      # NEW — Three-tier caching
│   │   │   ├── __init__.py
│   │   │   ├── base.py                 # TTLCache primitive
│   │   │   ├── analysis_cache.py       # L1: hash → AnalysisCore (1h)
│   │   │   ├── semantic_cache.py       # L2: embedding → AnalysisCore (1h, cosine ≥ 0.95)
│   │   │   ├── course_cache.py         # L3: (query, skill) → Course[] (15min)
│   │   │   └── gate.py                 # CacheGate wraps orchestrator
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── llm_models.py           # Pydantic models for LLM I/O
│   │   │   ├── api_models.py           # Pydantic models for HTTP I/O
│   │   │   └── cache_models.py         # NEW: AnalysisCore (response sans courses)
│   │   ├── streaming/                  # NEW — SSE support
│   │   │   ├── __init__.py
│   │   │   └── events.py               # Event type definitions + emitter
│   │   ├── utils/
│   │   │   ├── __init__.py
│   │   │   ├── hash.py                 # cache keys
│   │   │   └── rate_limit.py
│   │   └── telemetry/
│   │       ├── __init__.py
│   │       └── logger.py
│   ├── tests/
│   │   ├── test_taxonomy.py
│   │   ├── test_snapshot_math.py
│   │   └── test_orchestrator_mock.py
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
│
├── frontend/                           # Next.js (TypeScript)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # SPA shell with view switching
│   │   └── globals.css
│   ├── components/
│   │   ├── screens/
│   │   │   ├── InputScreen.tsx
│   │   │   ├── ResultsScreen.tsx
│   │   │   └── StudyPlanScreen.tsx
│   │   ├── ui/
│   │   │   ├── GapCard.tsx
│   │   │   ├── CourseCard.tsx           # Primary course: thumbnail + status + Approach D nudge
│   │   │   ├── AlternateCourseCard.tsx  # Lighter alternates: title + channel + Watch only
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── MatchScoreRing.tsx
│   │   │   ├── SeverityBadge.tsx
│   │   │   ├── FallbackBanner.tsx
│   │   │   ├── NextUpCard.tsx
│   │   │   ├── ToastContainer.tsx       # Renders queued toasts (nudge + fallback messages)
│   │   │   └── DebugPanel.tsx           # ?debug=1
│   │   └── primitives/
│   │       ├── Button.tsx
│   │       ├── TextArea.tsx
│   │       └── Tooltip.tsx
│   ├── lib/
│   │   ├── services/
│   │   │   ├── analysis-service.ts     # AnalysisService interface + Http impl (SSE)
│   │   │   └── stub-analysis.ts        # For tests/Storybook
│   │   ├── progress/
│   │   │   ├── types.ts
│   │   │   ├── course-progress-store.ts # Interface + localStorage impl
│   │   │   └── snapshot.ts             # Pure function
│   │   ├── schemas/
│   │   │   └── api.ts                  # Zod schemas mirroring Pydantic
│   │   └── utils/
│   │       └── clsx-wrapper.ts
│   ├── state/
│   │   ├── AnalysisContext.tsx
│   │   ├── ProgressContext.tsx
│   │   └── ToastContext.tsx            # Toast queue (used by nudge, fallbacks)
│   ├── data/
│   │   └── sample-inputs.ts            # brief's sample
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.js
│   ├── .env.local.example
│   └── Dockerfile
│
├── docker-compose.yml
├── docker-compose.dev.yml              # hot-reload variant
├── README.md
└── .gitignore
```

---

## 2. The Heart: `run_agent` Helper (Python)

This is the single most important file. It's why we don't need LangChain.

```python
# backend/app/agents/run_agent.py
import asyncio
import time
from typing import Callable, Type, TypeVar
from pydantic import BaseModel
from app.llm.provider import LLMProvider
from app.telemetry.logger import logger

T = TypeVar("T", bound=BaseModel)


async def run_agent(
    *,
    name: str,
    llm: LLMProvider,
    model: str,
    schema: Type[T],
    system_prompt: str,
    user_prompt: str,
    fallback: Callable[[], T],
    temperature: float = 0.2,
    timeout_s: float = 12.0,
    max_retries: int = 1,
) -> tuple[T, bool, float]:
    """
    Run an agent with primary LLM call + deterministic fallback.

    Returns: (result, used_fallback, elapsed_ms)
    """
    start = time.time()

    for attempt in range(max_retries + 1):
        try:
            result = await asyncio.wait_for(
                llm.complete(
                    model=model,
                    schema=schema,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=temperature,
                ),
                timeout=timeout_s,
            )
            elapsed_ms = (time.time() - start) * 1000
            logger.agent(name, ms=elapsed_ms, ok=True)
            return result, False, elapsed_ms
        except Exception as e:
            if attempt < max_retries:
                await asyncio.sleep(0.8 * (attempt + 1))  # gentle backoff
                continue
            elapsed_ms = (time.time() - start) * 1000
            logger.agent(name, ms=elapsed_ms, ok=False, err=str(e))
            logger.fallback(name, reason=type(e).__name__)
            return fallback(), True, elapsed_ms
```

**Why this is the right abstraction:** every agent becomes a 20-line module. Orchestrator calls `run_agent()` five times. No DAG framework needed.

---

## 3. LLM Provider (Adapter + DIP)

```python
# backend/app/llm/provider.py
from abc import ABC, abstractmethod
from typing import Type, TypeVar
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMProvider(ABC):
    """Abstraction over LLM vendors. Agents depend on this, not on OpenAI directly."""

    @abstractmethod
    async def complete(
        self,
        *,
        model: str,
        schema: Type[T],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> T:
        """Return a Pydantic-validated structured response."""
        ...
```

```python
# backend/app/llm/openai_provider.py
from typing import Type, TypeVar
from openai import AsyncOpenAI
from pydantic import BaseModel
from app.llm.provider import LLMProvider

T = TypeVar("T", bound=BaseModel)


class OpenAIProvider(LLMProvider):
    """Wraps the OpenAI async SDK with structured-output parsing."""

    def __init__(self, client: AsyncOpenAI):
        self.client = client

    async def complete(
        self,
        *,
        model: str,
        schema: Type[T],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> T:
        # `beta.chat.completions.parse` enforces the Pydantic schema at the model level
        completion = await self.client.beta.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format=schema,
            temperature=temperature,
        )
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise ValueError("OpenAI returned no parsed content")
        return parsed
```

```python
# backend/app/llm/mock_provider.py
from typing import Type, TypeVar
from pydantic import BaseModel
from app.llm.provider import LLMProvider
from app.llm.mock_responses import MOCK_RESPONSES

T = TypeVar("T", bound=BaseModel)


class MockLLMProvider(LLMProvider):
    """Returns hand-crafted responses for demo without an API key."""

    async def complete(
        self,
        *,
        model: str,
        schema: Type[T],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> T:
        data = MOCK_RESPONSES.get(schema.__name__)
        if not data:
            raise ValueError(f"No mock response for {schema.__name__}")
        return schema.model_validate(data)
```

---

## 4. Pydantic Schemas (Single Source of Truth)

```python
# backend/app/schemas/llm_models.py
from typing import Literal
from pydantic import BaseModel, Field


# ─── Agent 1: Resume Parser ─────────────────────────────────
class ResumeSkill(BaseModel):
    name: str
    proficiency: Literal["mentioned", "used", "strong"]
    evidence: str = Field(max_length=200)


class ResumeStructured(BaseModel):
    years_experience: int | None
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
    duration_minutes: int | None
    url: str
    thumbnail: str | None
    quality_score: float = Field(ge=0.0, le=1.0)
```

```python
# backend/app/schemas/api_models.py
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
```

---

## 5. Agent Modules (Pattern)

Example for Agent 3 (the brain):

```python
# backend/app/agents/gap_reasoner.py
import json
from app.agents.run_agent import run_agent
from app.agents.prompts.gap_reasoner import SYSTEM_PROMPT
from app.llm.provider import LLMProvider
from app.schemas.llm_models import GapAnalysis, ResumeStructured, JdStructured, Gap


async def run_gap_reasoner(
    *,
    llm: LLMProvider,
    resume: ResumeStructured,
    jd: JdStructured,
    taxonomy_hints: dict,
) -> tuple[GapAnalysis, bool, float]:
    user_prompt = json.dumps({
        "resume_structured": resume.model_dump(),
        "jd_structured": jd.model_dump(),
        "taxonomy_hints": taxonomy_hints,
    })

    def fallback() -> GapAnalysis:
        return _fallback_reasoning(resume, jd)

    return await run_agent(
        name="gap_reasoner",
        llm=llm,
        model="gpt-4o-mini",
        schema=GapAnalysis,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.2,
        timeout_s=12.0,
        fallback=fallback,
    )


def _fallback_reasoning(
    resume: ResumeStructured,
    jd: JdStructured,
) -> GapAnalysis:
    resume_skill_set = {s.name.lower() for s in resume.skills}

    all_jd = (
        [(s, "required") for s in jd.required]
        + [(s, "nice_to_have") for s in jd.nice_to_have]
    )

    gaps = []
    for jd_skill, category in all_jd:
        if jd_skill.skill.lower() not in resume_skill_set:
            severity = 4 if category == "required" else 2
            gaps.append(Gap(
                skill=jd_skill.skill,
                category=category,
                severity=severity,
                status="missing",
                evidence=f"{jd_skill.skill} appears in JD but not in resume.",
                jd_quote=jd_skill.source_quote,
                search_query=f"{jd_skill.skill} tutorial for beginners",
            ))

    matched = [s for s, _ in all_jd if s.skill.lower() in resume_skill_set]
    total_weight = sum(s.weight for s, _ in all_jd)
    matched_weight = sum(s.weight for s in matched)
    match_score = round((matched_weight / total_weight) * 100) if total_weight else 0

    return GapAnalysis(
        overall_match_score=match_score,
        gaps=gaps,
        strengths_matching=[s.skill for s in matched],
    )
```

All other agents follow the same shape: prompt + schema + fallback function.

---

## 6. Prompts (Externalized)

```python
# backend/app/agents/prompts/gap_reasoner.py
SYSTEM_PROMPT = """
You are a senior technical recruiter and learning coach. Given a candidate's parsed resume and a parsed job description, identify skill gaps.

RULES:
1. A "gap" is a JD skill that is missing OR weakly represented in the resume.
2. status="missing" if absent; "weak" if mentioned but not used in a project.
3. Severity 1-5:
   - 5: required + missing + foundational
   - 4: required + missing OR required + weak
   - 3: required + weakly demonstrated
   - 2: nice-to-have + missing
   - 1: nice-to-have + weak
4. category MUST match the JD section ("required" or "nice_to_have").
5. evidence: 1-2 sentences explaining WHY this is a gap.
6. jd_quote: the JD phrase that established this requirement.
7. search_query: a YouTube-friendly tutorial query.
8. Compute overall_match_score: weighted percent of JD skills the resume covers.
9. strengths_matching: JD skills the resume clearly demonstrates.
10. Do NOT invent skills not in the inputs. Use taxonomy_hints for naming disambiguation.

Output JSON conforming to the provided schema. Be precise and concise.
""".strip()
```

Each agent has its own prompt file.

---

## 7. Orchestrator

```python
# backend/app/agents/orchestrator.py
import asyncio
import time
from app.llm.provider import LLMProvider
from app.courses.source import CourseSource
from app.taxonomy.matcher import match_skills
from app.agents.resume_parser import run_resume_parser
from app.agents.jd_parser import run_jd_parser
from app.agents.gap_reasoner import run_gap_reasoner
from app.agents.study_planner import run_study_planner
from app.schemas.api_models import AnalyzeResponse, AnalyzeMeta, EnrichedGap
from app.schemas.llm_models import Course
from app.utils.hash import hash_str
from app.utils.cache import TTLCache

_CACHE = TTLCache(max_size=50, ttl_seconds=3600)


class Orchestrator:
    def __init__(
        self,
        llm: LLMProvider,
        course_sources: list[CourseSource],
        mock_mode: bool = False,
    ):
        self.llm = llm
        self.course_sources = course_sources
        self.mock_mode = mock_mode

    async def run(self, resume: str, jd: str) -> AnalyzeResponse:
        cache_key = hash_str(resume + "|" + jd)
        cached = _CACHE.get(cache_key)
        if cached:
            return cached

        fallbacks_used: list[str] = []
        timings: dict[str, float] = {}

        # Deterministic pre-pass
        taxonomy_hints = {
            "resume_skills": [s.canonical for s in match_skills(resume)],
            "jd_skills": [s.canonical for s in match_skills(jd)],
        }

        # Stage 1: parallel parsing
        (resume_struct, r_fb, r_ms), (jd_struct, j_fb, j_ms) = await asyncio.gather(
            run_resume_parser(llm=self.llm, text=resume, hints=taxonomy_hints["resume_skills"]),
            run_jd_parser(llm=self.llm, text=jd, hints=taxonomy_hints["jd_skills"]),
        )
        if r_fb: fallbacks_used.append("resume_parser")
        if j_fb: fallbacks_used.append("jd_parser")
        timings["resume_parser"] = r_ms
        timings["jd_parser"] = j_ms

        # Stage 2: reasoning
        gap_analysis, g_fb, g_ms = await run_gap_reasoner(
            llm=self.llm,
            resume=resume_struct,
            jd=jd_struct,
            taxonomy_hints=taxonomy_hints,
        )
        if g_fb: fallbacks_used.append("gap_reasoner")
        timings["gap_reasoner"] = g_ms

        # Stage 3: planning
        study_plan, p_fb, p_ms = await run_study_planner(
            llm=self.llm,
            gaps=gap_analysis.gaps,
        )
        if p_fb: fallbacks_used.append("study_planner")
        timings["study_planner"] = p_ms

        # Stage 4: parallel course fetch
        plan_by_skill = {item.gap_skill: item for item in study_plan.items}
        course_start = time.time()
        course_lists = await asyncio.gather(*[
            self._fetch_courses(
                query=plan_by_skill.get(g.skill, None).search_queries[0]
                    if plan_by_skill.get(g.skill) else g.search_query,
                skill_id=g.skill,
            )
            for g in gap_analysis.gaps
        ])
        timings["course_curator"] = (time.time() - course_start) * 1000

        # Assemble
        enriched: list[EnrichedGap] = []
        for g, courses in zip(gap_analysis.gaps, course_lists):
            plan_item = plan_by_skill.get(g.skill)
            enriched.append(EnrichedGap(
                **g.model_dump(),
                courses=courses,
                estimated_hours=plan_item.estimated_hours if plan_item else 8,
            ))

        result = AnalyzeResponse(
            match_score=gap_analysis.overall_match_score,
            required_gaps=[g for g in enriched if g.category == "required"],
            nice_to_have_gaps=[g for g in enriched if g.category == "nice_to_have"],
            strengths=gap_analysis.strengths_matching,
            meta=AnalyzeMeta(
                fallbacks_used=fallbacks_used,
                agent_timings_ms=timings,
                mock_mode=self.mock_mode,
            ),
        )
        _CACHE.set(cache_key, result)
        return result

    async def _fetch_courses(self, query: str, skill_id: str) -> list[Course]:
        """Return top 3 ranked courses: 1 primary + 2 alternates.
        Frontend renders primary visibly, alternates collapsed."""
        for source in self.course_sources:
            try:
                courses = await source.fetch_courses(query=query, skill_id=skill_id)
                if courses:
                    return courses[:3]  # primary + 2 alternates
            except Exception:
                continue
        return []
```

---

## 8. FastAPI App

```python
# backend/app/main.py
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

from app.config import settings
from app.api.analyze import router as analyze_router
from app.api.health import router as health_router
from app.agents.orchestrator import Orchestrator
from app.llm.openai_provider import OpenAIProvider
from app.llm.mock_provider import MockLLMProvider
from app.courses.youtube_source import YouTubeSource
from app.courses.static_source import StaticCatalogSource


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Composition Root — all wiring happens here
    use_mock = settings.mock_mode or not settings.openai_api_key
    if use_mock:
        llm = MockLLMProvider()
    else:
        llm = OpenAIProvider(AsyncOpenAI(api_key=settings.openai_api_key))

    course_sources = []
    if settings.youtube_api_key:
        course_sources.append(YouTubeSource(api_key=settings.youtube_api_key))
    course_sources.append(StaticCatalogSource())  # always last — never fails

    app.state.orchestrator = Orchestrator(
        llm=llm,
        course_sources=course_sources,
        mock_mode=use_mock,
    )
    yield


app = FastAPI(title="MIRA", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(analyze_router)
```

```python
# backend/app/api/analyze.py
from fastapi import APIRouter, HTTPException, Request, Depends
from app.schemas.api_models import AnalyzeRequest, AnalyzeResponse
from app.utils.rate_limit import check_rate_limit

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, request: Request):
    client_ip = request.headers.get("x-forwarded-for", request.client.host)
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="rate_limited")

    orchestrator = request.app.state.orchestrator
    return await orchestrator.run(req.resume, req.jd)
```

```python
# backend/app/api/health.py
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}
```

```python
# backend/app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = ""
    youtube_api_key: str = ""
    mock_mode: bool = False
    frontend_origin: str = "http://localhost:3000"


settings = Settings()
```

---

## 9. Caching Layer (Three-Tier)

### 9.1 Base TTL Cache Primitive

```python
# backend/app/cache/base.py
import time
from collections import OrderedDict
from typing import Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


class TTLCache(Generic[K, V]):
    """FIFO-evicting in-memory cache with TTL per entry."""

    def __init__(self, max_size: int = 100, ttl_seconds: int = 3600):
        self._store: OrderedDict[K, tuple[V, float]] = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl_seconds

    def get(self, key: K) -> V | None:
        entry = self._store.get(key)
        if not entry:
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: K, value: V) -> None:
        if len(self._store) >= self._max_size:
            self._store.popitem(last=False)  # FIFO eviction
        self._store[key] = (value, time.time() + self._ttl)

    def clear(self) -> None:
        self._store.clear()
```

### 9.2 AnalysisCore Schema (Cache-Friendly)

```python
# backend/app/schemas/cache_models.py
from pydantic import BaseModel
from app.schemas.llm_models import Gap


class AnalysisCore(BaseModel):
    """Analysis result WITHOUT courses. Courses are attached separately via L3 cache."""
    match_score: int
    required_gaps: list[Gap]
    nice_to_have_gaps: list[Gap]
    strengths: list[str]
```

The full `AnalyzeResponse` is built by attaching courses to each gap at response time.

### 9.3 L1: AnalysisCache

```python
# backend/app/cache/analysis_cache.py
from app.cache.base import TTLCache
from app.schemas.cache_models import AnalysisCore


class AnalysisCache:
    """L1: exact-match cache by hash(resume+jd). 1h TTL."""

    def __init__(self):
        self._cache = TTLCache[str, AnalysisCore](max_size=200, ttl_seconds=3600)

    def get(self, key: str) -> AnalysisCore | None:
        return self._cache.get(key)

    def set(self, key: str, core: AnalysisCore) -> None:
        self._cache.set(key, core)
```

### 9.4 L2: SemanticCache

```python
# backend/app/cache/semantic_cache.py
import time
import numpy as np
from app.schemas.cache_models import AnalysisCore
from app.semantic.cosine import cosine_similarity


class SemanticCache:
    """L2: semantic-match cache via cosine similarity. 1h TTL, threshold 0.95."""

    def __init__(self, threshold: float = 0.95, max_size: int = 100, ttl_seconds: int = 3600):
        self.threshold = threshold
        self._max_size = max_size
        self._ttl = ttl_seconds
        self._entries: list[tuple[np.ndarray, AnalysisCore, float]] = []
        # (embedding, core, expires_at)

    def search(self, query_embedding: np.ndarray) -> AnalysisCore | None:
        now = time.time()
        # Evict expired
        self._entries = [e for e in self._entries if e[2] > now]

        if not self._entries:
            return None

        best_sim = 0.0
        best_core: AnalysisCore | None = None
        for embedding, core, _ in self._entries:
            sim = cosine_similarity(query_embedding, embedding)
            if sim > best_sim:
                best_sim = sim
                best_core = core

        return best_core if best_sim >= self.threshold else None

    def set(self, embedding: np.ndarray, core: AnalysisCore) -> None:
        if len(self._entries) >= self._max_size:
            self._entries.pop(0)  # FIFO
        self._entries.append((embedding, core, time.time() + self._ttl))
```

### 9.5 L3: CourseCache

```python
# backend/app/cache/course_cache.py
from app.cache.base import TTLCache
from app.schemas.llm_models import Course


class CourseCache:
    """L3: course list per (search_query, skill_id). 15min TTL — bounds stale-link risk."""

    def __init__(self):
        self._cache = TTLCache[str, list[Course]](max_size=500, ttl_seconds=900)

    def get(self, query: str, skill_id: str) -> list[Course] | None:
        return self._cache.get(self._key(query, skill_id))

    def set(self, query: str, skill_id: str, courses: list[Course]) -> None:
        self._cache.set(self._key(query, skill_id), courses)

    @staticmethod
    def _key(query: str, skill_id: str) -> str:
        return f"{skill_id}::{query}"
```

### 9.6 CacheGate (Decorator over Orchestrator)

```python
# backend/app/cache/gate.py
from typing import AsyncIterator
import asyncio
from app.cache.analysis_cache import AnalysisCache
from app.cache.semantic_cache import SemanticCache
from app.cache.course_cache import CourseCache
from app.semantic.embedder import Embedder
from app.schemas.api_models import AnalyzeResponse, EnrichedGap
from app.schemas.cache_models import AnalysisCore
from app.utils.hash import hash_str


class CacheGate:
    """Try L1 → L2 before invoking orchestrator. Reattach courses via L3."""

    def __init__(
        self,
        orchestrator,
        embedder: Embedder,
        l1: AnalysisCache,
        l2: SemanticCache,
        l3: CourseCache,
    ):
        self.orchestrator = orchestrator
        self.embedder = embedder
        self.l1 = l1
        self.l2 = l2
        self.l3 = l3

    async def run_stream(self, resume: str, jd: str) -> AsyncIterator[dict]:
        cache_key = hash_str(resume + "|" + jd)

        # L1 exact-match
        cached = self.l1.get(cache_key)
        if cached:
            yield {"phase": "cache_hit_exact"}
            response = await self._reattach_courses(cached)
            yield {"done": response.model_dump()}
            return

        # L2 semantic match (also gives us embedding for later cache write)
        embedding = await self.embedder.embed(resume + " " + jd)
        cached = self.l2.search(embedding)
        if cached:
            yield {"phase": "cache_hit_semantic"}
            response = await self._reattach_courses(cached)
            yield {"done": response.model_dump()}
            return

        yield {"phase": "cache_miss"}

        # Full pipeline; orchestrator streams its own events
        core, response = None, None
        async for event in self.orchestrator.run_stream(resume, jd, taxonomy_embedding=embedding):
            if "done" in event:
                response = AnalyzeResponse.model_validate(event["done"])
                core = AnalysisCore(
                    match_score=response.match_score,
                    required_gaps=[Gap(**g.model_dump(exclude={"courses", "estimated_hours"}))
                                   for g in response.required_gaps],
                    nice_to_have_gaps=[Gap(**g.model_dump(exclude={"courses", "estimated_hours"}))
                                       for g in response.nice_to_have_gaps],
                    strengths=response.strengths,
                )
                self.l1.set(cache_key, core)
                self.l2.set(embedding, core)
                # L3 already populated per-gap by the orchestrator's course curator
            yield event

    async def _reattach_courses(self, core: AnalysisCore) -> AnalyzeResponse:
        """Pull courses from L3 (or refetch on miss) and rebuild full response."""
        all_gaps = core.required_gaps + core.nice_to_have_gaps

        async def fetch_for_gap(gap):
            cached = self.l3.get(gap.search_query, gap.skill)
            if cached is not None:
                return cached
            # Cache miss → fetch fresh from orchestrator's curator
            courses = await self.orchestrator.fetch_courses(gap.search_query, gap.skill)
            self.l3.set(gap.search_query, gap.skill, courses)
            return courses

        course_lists = await asyncio.gather(*[fetch_for_gap(g) for g in all_gaps])

        # Rebuild EnrichedGap with courses
        gap_to_courses = dict(zip(all_gaps, course_lists))

        def enrich(g):
            return EnrichedGap(**g.model_dump(), courses=gap_to_courses[g], estimated_hours=8)

        return AnalyzeResponse(
            match_score=core.match_score,
            required_gaps=[enrich(g) for g in core.required_gaps],
            nice_to_have_gaps=[enrich(g) for g in core.nice_to_have_gaps],
            strengths=core.strengths,
            meta=...,  # populated from telemetry; cache-hit metadata
        )
```

---

## 10. Semantic Layer (Embedder + Cosine + TaxonomyIndex)

### 10.1 Embedder (Adapter)

```python
# backend/app/semantic/embedder.py
import numpy as np
from openai import AsyncOpenAI


class Embedder:
    """Wraps OpenAI embeddings. Returns numpy arrays for cosine math."""

    def __init__(self, client: AsyncOpenAI, model: str = "text-embedding-3-small"):
        self.client = client
        self.model = model

    async def embed(self, text: str) -> np.ndarray:
        response = await self.client.embeddings.create(
            model=self.model,
            input=text[:8000],  # safety truncate
        )
        return np.array(response.data[0].embedding, dtype=np.float32)

    async def embed_batch(self, texts: list[str]) -> list[np.ndarray]:
        response = await self.client.embeddings.create(
            model=self.model,
            input=[t[:8000] for t in texts],
        )
        return [np.array(d.embedding, dtype=np.float32) for d in response.data]
```

### 10.2 Cosine Similarity

```python
# backend/app/semantic/cosine.py
import numpy as np


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)
```

### 10.3 TaxonomyIndex (Pre-computed Skill Embeddings)

```python
# backend/app/taxonomy/index.py
import json
from pathlib import Path
import numpy as np
from app.semantic.embedder import Embedder

_DATA_PATH = Path(__file__).parent / "data" / "skills.json"


class TaxonomyIndex:
    """Pre-computes embeddings for all taxonomy skills. Built at app startup."""

    def __init__(self):
        self.skills: list[dict] = []
        self.embeddings: np.ndarray | None = None  # shape (N, dim)

    async def build(self, embedder: Embedder) -> None:
        with _DATA_PATH.open() as f:
            self.skills = json.load(f)

        # Embed canonical name + first few aliases per skill
        texts = [
            f"{s['canonical']} ({', '.join(s.get('aliases', [])[:3])})"
            for s in self.skills
        ]
        embeddings = await embedder.embed_batch(texts)
        self.embeddings = np.vstack(embeddings)

    def match(self, query_embedding: np.ndarray, threshold: float = 0.6, top_k: int = 5) -> list[dict]:
        """Return skills above similarity threshold, sorted desc."""
        if self.embeddings is None:
            return []
        # Cosine similarity vector
        norms = np.linalg.norm(self.embeddings, axis=1) * np.linalg.norm(query_embedding)
        sims = np.dot(self.embeddings, query_embedding) / np.where(norms == 0, 1, norms)
        ranked_idx = np.argsort(-sims)
        results = []
        for i in ranked_idx[:top_k]:
            if sims[i] >= threshold:
                results.append({**self.skills[i], "_similarity": float(sims[i])})
        return results
```

### 10.4 Hybrid Taxonomy Matcher

```python
# backend/app/taxonomy/matcher.py (REPLACES the v1 keyword-only matcher)
import re
import numpy as np
from dataclasses import dataclass
from app.taxonomy.index import TaxonomyIndex
from app.semantic.embedder import Embedder


@dataclass
class MatchedSkill:
    id: str
    canonical: str
    source: str  # "keyword" | "embedding"


class HybridTaxonomyMatcher:
    """Keyword first (high precision), then embedding (high recall for synonyms)."""

    def __init__(self, index: TaxonomyIndex, embedder: Embedder):
        self.index = index
        self.embedder = embedder

    async def match(self, text: str, text_embedding: np.ndarray | None = None) -> list[MatchedSkill]:
        # Stage 1: keyword (always runs)
        keyword_hits = self._keyword_match(text)
        keyword_ids = {h.id for h in keyword_hits}

        # Stage 2: embedding (catches synonyms keyword missed)
        if text_embedding is None:
            text_embedding = await self.embedder.embed(text)
        embedding_hits = self.index.match(text_embedding, threshold=0.65)

        # Merge: keyword wins; embeddings only add
        for hit in embedding_hits:
            if hit["id"] not in keyword_ids:
                keyword_hits.append(MatchedSkill(
                    id=hit["id"], canonical=hit["canonical"], source="embedding",
                ))

        return keyword_hits

    def _keyword_match(self, text: str) -> list[MatchedSkill]:
        matched: list[MatchedSkill] = []
        seen: set[str] = set()
        lower = text.lower()
        for skill in self.index.skills:
            if skill["id"] in seen:
                continue
            terms = [skill["canonical"]] + skill.get("aliases", [])
            for term in terms:
                if re.search(rf"\b{re.escape(term.lower())}\b", lower):
                    matched.append(MatchedSkill(
                        id=skill["id"], canonical=skill["canonical"], source="keyword",
                    ))
                    seen.add(skill["id"])
                    break
        return matched
```

---

## 11. SSE Streaming

### 11.1 Event Types

```python
# backend/app/streaming/events.py
from typing import Literal, Any
from pydantic import BaseModel


class SSEEvent(BaseModel):
    event_type: Literal["phase", "partial", "done", "error"]
    data: dict[str, Any]

    def format(self) -> str:
        """Format for SSE wire protocol."""
        import json
        return f"event: {self.event_type}\ndata: {json.dumps(self.data)}\n\n"
```

### 11.2 Streaming Endpoint

```python
# backend/app/api/analyze.py (UPDATED for SSE)
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas.api_models import AnalyzeRequest
from app.utils.rate_limit import check_rate_limit
from app.streaming.events import SSEEvent

router = APIRouter()


@router.post("/analyze")
async def analyze_stream(req: AnalyzeRequest, request: Request):
    client_ip = request.headers.get("x-forwarded-for", request.client.host)
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="rate_limited")

    cache_gate = request.app.state.cache_gate

    async def generator():
        async for event in cache_gate.run_stream(req.resume, req.jd):
            sse_type = "done" if "done" in event else (
                "partial" if "partial" in event else "phase"
            )
            yield SSEEvent(event_type=sse_type, data=event).format()

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

### 11.3 Frontend SSE Consumer

```typescript
// frontend/lib/services/analysis-service.ts (UPDATED)
export interface AnalysisService {
  analyzeStream(
    resume: string,
    jd: string,
    onPhase: (phase: string) => void,
    onPartial: (data: any) => void,
  ): Promise<AnalysisResult>;
}

export class HttpAnalysisService implements AnalysisService {
  constructor(private baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") {}

  async analyzeStream(resume, jd, onPhase, onPartial): Promise<AnalysisResult> {
    const res = await fetch(`${this.baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ resume, jd }),
    });
    if (!res.ok) throw new Error(`Analyze failed: ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const raw of events) {
        const lines = raw.split("\n");
        const type = lines.find(l => l.startsWith("event: "))?.slice(7);
        const data = JSON.parse(lines.find(l => l.startsWith("data: "))?.slice(6) || "{}");

        if (type === "phase") onPhase(data.phase);
        else if (type === "partial") onPartial(data);
        else if (type === "done") return data as AnalysisResult;
        else if (type === "error") throw new Error(data.detail);
      }
    }
    throw new Error("Stream ended without done event");
  }
}
```

---

## 12. Taxonomy

```json
// backend/app/taxonomy/data/skills.json (excerpt, ~80 entries total)
[
  {
    "id": "typescript",
    "canonical": "TypeScript",
    "aliases": ["ts", "type script", "typed javascript"],
    "category": "language"
  },
  {
    "id": "nextjs",
    "canonical": "Next.js",
    "aliases": ["next", "next.js", "nextjs", "next js"],
    "category": "framework"
  },
  {
    "id": "nodejs",
    "canonical": "Node.js",
    "aliases": ["node", "nodejs", "node js"],
    "category": "runtime"
  },
  {
    "id": "postgresql",
    "canonical": "PostgreSQL",
    "aliases": ["postgres", "pg", "psql"],
    "category": "database"
  },
  {
    "id": "graphql",
    "canonical": "GraphQL",
    "aliases": ["graph ql", "gql"],
    "category": "api"
  },
  {
    "id": "docker",
    "canonical": "Docker",
    "aliases": ["containerization", "containers"],
    "category": "devops"
  },
  {
    "id": "cicd",
    "canonical": "CI/CD",
    "aliases": ["ci cd", "continuous integration", "continuous deployment"],
    "category": "devops"
  },
  {
    "id": "system_design",
    "canonical": "System Design",
    "aliases": ["system design", "architecture", "designing systems"],
    "category": "concept"
  },
  {
    "id": "integration_tests",
    "canonical": "Integration Testing",
    "aliases": ["integration tests", "integration testing", "e2e tests"],
    "category": "testing"
  }
]
```

```python
# backend/app/taxonomy/matcher.py
import json
import re
from dataclasses import dataclass
from pathlib import Path

_DATA_PATH = Path(__file__).parent / "data" / "skills.json"
with _DATA_PATH.open() as f:
    _TAXONOMY = json.load(f)


@dataclass
class MatchedSkill:
    id: str
    canonical: str


def match_skills(text: str) -> list[MatchedSkill]:
    """Word-boundary keyword match against the taxonomy."""
    matched: list[MatchedSkill] = []
    seen: set[str] = set()
    lower = text.lower()

    for skill in _TAXONOMY:
        if skill["id"] in seen:
            continue
        terms = [skill["canonical"]] + skill["aliases"]
        for term in terms:
            pattern = rf"\b{re.escape(term.lower())}\b"
            if re.search(pattern, lower):
                matched.append(MatchedSkill(id=skill["id"], canonical=skill["canonical"]))
                seen.add(skill["id"])
                break
    return matched
```

---

## 10. Course Sources

```python
# backend/app/courses/source.py
from abc import ABC, abstractmethod
from app.schemas.llm_models import Course


class CourseSource(ABC):
    name: str

    @abstractmethod
    async def fetch_courses(self, *, query: str, skill_id: str) -> list[Course]:
        ...
```

```python
# backend/app/courses/youtube_source.py
import httpx
from app.courses.source import CourseSource
from app.courses.ranker import rank_course
from app.schemas.llm_models import Course

YT_URL = "https://www.googleapis.com/youtube/v3/search"


class YouTubeSource(CourseSource):
    name = "youtube"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def fetch_courses(self, *, query: str, skill_id: str) -> list[Course]:
        params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "videoDuration": "medium",
            "relevanceLanguage": "en",
            "maxResults": "10",
            "key": self.api_key,
        }
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(YT_URL, params=params)
        res.raise_for_status()
        data = res.json()
        items = data.get("items", [])
        if not items:
            return []

        courses = [
            Course(
                course_id=f"yt:{item['id']['videoId']}",
                title=item["snippet"]["title"],
                channel=item["snippet"]["channelTitle"],
                duration_minutes=None,
                url=f"https://www.youtube.com/watch?v={item['id']['videoId']}",
                thumbnail=item["snippet"]["thumbnails"].get("medium", {}).get("url"),
                quality_score=rank_course(item["snippet"]),
            )
            for item in items
        ]
        courses.sort(key=lambda c: c.quality_score, reverse=True)
        return courses
```

```python
# backend/app/courses/static_source.py
import json
from pathlib import Path
from app.courses.source import CourseSource
from app.schemas.llm_models import Course

_DATA_PATH = Path(__file__).parent / "data" / "static_courses.json"
with _DATA_PATH.open() as f:
    _CATALOG = json.load(f)


class StaticCatalogSource(CourseSource):
    name = "static"

    async def fetch_courses(self, *, query: str, skill_id: str) -> list[Course]:
        entries = _CATALOG.get(skill_id, [])
        return [
            Course(
                course_id=f"static:{skill_id}:{i}",
                title=e["title"],
                channel=e["channel"],
                duration_minutes=e.get("durationMinutes"),
                url=e["url"],
                thumbnail=e.get("thumbnail"),
                quality_score=0.7,
            )
            for i, e in enumerate(entries)
        ]
```

```python
# backend/app/courses/ranker.py
from datetime import datetime, timezone

_CHANNEL_QUALITY = {
    "freeCodeCamp.org": 1.0,
    "Fireship": 0.95,
    "Traversy Media": 0.9,
    "The Net Ninja": 0.9,
    "Web Dev Simplified": 0.9,
    "ByteByteGo": 0.95,
    "Hussein Nasser": 0.9,
    "Academind": 0.85,
    "Programming with Mosh": 0.8,
}


def rank_course(snippet: dict) -> float:
    channel = snippet.get("channelTitle", "")
    channel_score = _CHANNEL_QUALITY.get(channel, 0.4)

    published = snippet.get("publishedAt")
    if published:
        published_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
        months_old = (datetime.now(timezone.utc) - published_dt).days / 30
        recency_score = max(0.4, 1 - months_old / 60)
    else:
        recency_score = 0.5

    return channel_score * 0.7 + recency_score * 0.3
```

---

## 13. Frontend — Progress Subsystem

```typescript
// frontend/lib/progress/types.ts
export type CourseStatus = "not_started" | "in_progress" | "completed" | "skipped";

export interface CourseProgress {
  courseId: string;
  gapSkill: string;
  gapSeverity: 1 | 2 | 3 | 4 | 5;
  gapCategory: "required" | "nice_to_have";
  isAlternate: boolean;  // true if this is a secondary/alternate course the user opted into
  status: CourseStatus;
  startedAt: number | null;
  completedAt: number | null;
  lastTouchedAt: number;
  notes: string;
}

export interface ProgressState {
  schemaVersion: number;
  items: CourseProgress[];
}

export interface ProgressSnapshot {
  totalCourses: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overallPercent: number;
  weightedPercent: number;
  requiredGapsPercent: number;
  niceToHavePercent: number;
  staleItems: CourseProgress[];
  recentlyCompleted: CourseProgress[];
  currentStreak: number;
  recommendedNext: CourseProgress | null;
}
```

```typescript
// frontend/lib/progress/course-progress-store.ts
import type { CourseProgress, CourseStatus, ProgressState } from "./types";

const KEY = "mira:progress:v1";
const CURRENT_VERSION = 1;

export interface CourseProgressStore {
  getAll(): Promise<CourseProgress[]>;
  updateStatus(courseId: string, status: CourseStatus): Promise<void>;
  reset(): Promise<void>;
}

export class LocalStorageProgressStore implements CourseProgressStore {
  async getAll(): Promise<CourseProgress[]> {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    try {
      const parsed: ProgressState = JSON.parse(raw);
      if (parsed.schemaVersion !== CURRENT_VERSION) return [];
      return parsed.items;
    } catch {
      return [];
    }
  }

  async updateStatus(courseId: string, status: CourseStatus): Promise<void> {
    const items = await this.getAll();
    const now = Date.now();
    const existing = items.find(i => i.courseId === courseId);
    if (existing) {
      existing.status = status;
      existing.lastTouchedAt = now;
      if (status === "in_progress" && !existing.startedAt) existing.startedAt = now;
      if (status === "completed") existing.completedAt = now;
    }
    await this._save(items);
  }

  async reset(): Promise<void> {
    if (typeof window !== "undefined") localStorage.removeItem(KEY);
  }

  private async _save(items: CourseProgress[]) {
    if (typeof window === "undefined") return;
    const state: ProgressState = { schemaVersion: CURRENT_VERSION, items };
    localStorage.setItem(KEY, JSON.stringify(state));
  }
}
```

```typescript
// frontend/lib/progress/snapshot.ts
import type { CourseProgress, ProgressSnapshot } from "./types";

/**
 * Compute the user-facing progress snapshot.
 *
 * COUNTING RULE:
 *   - Every gap has exactly ONE primary course → counted in totalCourses
 *   - Alternates count ONLY if user touched them (have a CourseProgress + isAlternate)
 *   - This keeps the progress bar meaningful: "9 things to learn" vs "27 videos"
 *
 * @param items   All CourseProgress records the user has touched (primary or alternate).
 * @param primaryGaps  Map of gapSkill → primary course id (from the current analysis result).
 *                     Used to know how many primary courses EXIST, even those not yet touched.
 */
export function computeSnapshot(
  items: CourseProgress[],
  primaryGaps: Array<{
    gapSkill: string;
    primaryCourseId: string;
    gapSeverity: 1|2|3|4|5;
    gapCategory: "required" | "nice_to_have";
  }>,
): ProgressSnapshot {
  // Synthesize "not_started" records for primary courses the user hasn't touched yet.
  // This lets the snapshot reason about all primaries uniformly.
  const touchedIds = new Set(items.map(i => i.courseId));
  const synthesizedPrimaries: CourseProgress[] = primaryGaps
    .filter(g => !touchedIds.has(g.primaryCourseId))
    .map(g => ({
      courseId: g.primaryCourseId,
      gapSkill: g.gapSkill,
      gapSeverity: g.gapSeverity,
      gapCategory: g.gapCategory,
      isAlternate: false,
      status: "not_started" as const,
      startedAt: null,
      completedAt: null,
      lastTouchedAt: 0,
      notes: "",
    }));

  // Effective set for counting: all primaries (touched or not) + alternates the user touched
  const counted = [...items.filter(i => !i.isAlternate || true), ...synthesizedPrimaries];
  // (Touched alternates ARE counted; untouched alternates are NOT counted — they aren't in `items`)

  const total = counted.length;
  const completed = counted.filter(i => i.status === "completed");
  const inProgress = counted.filter(i => i.status === "in_progress");
  const notStarted = counted.filter(i => i.status === "not_started");

  const totalWeight = counted.reduce((s, i) => s + i.gapSeverity, 0);
  const completedWeight = completed.reduce((s, i) => s + i.gapSeverity, 0);
  const weightedPercent = totalWeight ? (completedWeight / totalWeight) * 100 : 0;

  const required = counted.filter(i => i.gapCategory === "required");
  const niceToHave = counted.filter(i => i.gapCategory === "nice_to_have");
  const requiredDone = required.filter(i => i.status === "completed").length;
  const niceDone = niceToHave.filter(i => i.status === "completed").length;

  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const staleItems = inProgress.filter(i => now - i.lastTouchedAt > SEVEN_DAYS);
  const recentlyCompleted = completed
    .filter(i => i.completedAt && now - i.completedAt < SEVEN_DAYS)
    .sort((a, b) => (b.completedAt! - a.completedAt!))
    .slice(0, 5);

  // recommendedNext: highest-severity primary not_started (alternates excluded — never recommend alternates)
  const recommendedNext = notStarted
    .filter(i => !i.isAlternate)
    .sort((a, b) => b.gapSeverity - a.gapSeverity)[0] ?? null;

  return {
    totalCourses: total,
    completed: completed.length,
    inProgress: inProgress.length,
    notStarted: notStarted.length,
    overallPercent: total ? Math.round((completed.length / total) * 100) : 0,
    weightedPercent: Math.round(weightedPercent),
    requiredGapsPercent: required.length ? Math.round((requiredDone / required.length) * 100) : 0,
    niceToHavePercent: niceToHave.length ? Math.round((niceDone / niceToHave.length) * 100) : 0,
    staleItems,
    recentlyCompleted,
    currentStreak: computeStreak(items),
    recommendedNext,
  };
}

function computeStreak(items: CourseProgress[]): number {
  const dates = new Set(
    items.filter(i => i.lastTouchedAt).map(i => new Date(i.lastTouchedAt).toISOString().slice(0, 10))
  );
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (!dates.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
    if (streak > 60) break;
  }
  return streak;
}
```

---

## 14. Frontend — Analysis Service

```typescript
// frontend/lib/services/analysis-service.ts
import type { AnalysisResult } from "@/lib/schemas/api";

export interface AnalysisService {
  analyze(resume: string, jd: string): Promise<AnalysisResult>;
}

export class HttpAnalysisService implements AnalysisService {
  constructor(private baseUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") {}

  async analyze(resume: string, jd: string): Promise<AnalysisResult> {
    const res = await fetch(`${this.baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume, jd }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Analyze failed: ${res.status} — ${detail}`);
    }
    return res.json();
  }
}

export class StubAnalysisService implements AnalysisService {
  constructor(private fixture: AnalysisResult) {}
  async analyze(): Promise<AnalysisResult> { return this.fixture; }
}
```

```typescript
// frontend/state/AnalysisContext.tsx
"use client";
import { createContext, useContext, useState, useCallback } from "react";
import type { AnalysisService } from "@/lib/services/analysis-service";
import { HttpAnalysisService } from "@/lib/services/analysis-service";
import type { AnalysisResult } from "@/lib/schemas/api";

type View = "input" | "results" | "plan";

interface Ctx {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  view: View;
  analyze: (resume: string, jd: string) => Promise<void>;
  setView: (v: View) => void;
}

const C = createContext<Ctx | null>(null);

export function AnalysisProvider({
  service = new HttpAnalysisService(),
  children,
}: { service?: AnalysisService; children: React.ReactNode }) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("input");

  const analyze = useCallback(async (resume: string, jd: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await service.analyze(resume, jd);
      setResult(data);
      setView("results");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [service]);

  return <C.Provider value={{ result, loading, error, view, analyze, setView }}>{children}</C.Provider>;
}

export const useAnalysis = () => {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useAnalysis outside provider");
  return ctx;
};
```

---

## 15. Frontend — Course Playback (Approach D)

### 15.1 Toast System

```typescript
// frontend/state/ToastContext.tsx
"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface Toast {
  id: string;
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number; // ms; default 30_000
}

interface ToastCtx {
  toasts: Toast[];
  show: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const C = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const show = useCallback((toast: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(t => [...t, { ...toast, id }]);
    const duration = toast.duration ?? 30_000;
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return <C.Provider value={{ toasts, show, dismiss }}>{children}</C.Provider>;
}

export const useToast = () => {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
};
```

```typescript
// frontend/components/ui/ToastContainer.tsx
"use client";
import { useToast } from "@/state/ToastContext";

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id}
             className="bg-slate-800 text-white rounded-lg p-3 pr-2 shadow-lg flex items-center gap-3 max-w-sm">
          <span className="flex-1 text-sm">{t.message}</span>
          {t.action && (
            <button
              onClick={() => { t.action!.onClick(); dismiss(t.id); }}
              className="px-2 py-1 bg-indigo-500 hover:bg-indigo-600 rounded text-xs font-medium"
            >
              {t.action.label}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} className="px-1 text-slate-400 hover:text-white">×</button>
        </div>
      ))}
    </div>
  );
}
```

### 15.2 CourseCard With Auto-Progress + Nudge

```typescript
// frontend/components/ui/CourseCard.tsx
"use client";
import type { Course } from "@/lib/schemas/api";
import type { CourseProgress, CourseStatus } from "@/lib/progress/types";
import { useToast } from "@/state/ToastContext";
import { useProgress } from "@/state/ProgressContext";

interface Props {
  course: Course;
  progress: CourseProgress | undefined; // may not exist yet
  gapSkill: string;
  gapSeverity: 1 | 2 | 3 | 4 | 5;
  gapCategory: "required" | "nice_to_have";
}

export function CourseCard({ course, progress, gapSkill, gapSeverity, gapCategory }: Props) {
  const { updateStatus } = useProgress();
  const toast = useToast();

  const currentStatus: CourseStatus = progress?.status ?? "not_started";

  const handleWatchClick = () => {
    // Auto-transition: not_started → in_progress
    if (currentStatus === "not_started") {
      updateStatus(course.course_id, "in_progress", {
        gapSkill, gapSeverity, gapCategory,
      });
    }

    // Open YouTube in a new tab
    window.open(course.url, "_blank", "noopener,noreferrer");

    // Show nudge toast with one-click "Mark complete" shortcut
    toast.show({
      message: `📺 Watching "${truncate(course.title, 40)}"?`,
      action: {
        label: "Mark complete",
        onClick: () => updateStatus(course.course_id, "completed", {
          gapSkill, gapSeverity, gapCategory,
        }),
      },
      duration: 30_000,
    });
  };

  return (
    <div className="course-card flex gap-3 p-3 border rounded-lg bg-white">
      {course.thumbnail && (
        <img src={course.thumbnail} alt="" className="w-32 h-20 object-cover rounded" />
      )}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm line-clamp-2">{course.title}</h4>
        <p className="text-xs text-slate-500 mt-1">
          {course.channel}
          {course.duration_minutes && ` · ${formatDuration(course.duration_minutes)}`}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleWatchClick}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs rounded"
          >
            ▶ Watch on YouTube
          </button>
          <StatusDropdown
            value={currentStatus}
            onChange={(s) => updateStatus(course.course_id, s, {
              gapSkill, gapSeverity, gapCategory,
            })}
          />
        </div>
      </div>
    </div>
  );
}

function StatusDropdown({ value, onChange }: { value: CourseStatus; onChange: (s: CourseStatus) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CourseStatus)}
      className="text-xs border rounded px-2 py-1 bg-white"
    >
      <option value="not_started">Not started</option>
      <option value="in_progress">In progress</option>
      <option value="completed">Completed</option>
      <option value="skipped">Skipped</option>
    </select>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
```

### 15.3 AlternateCourseCard (Lighter Variant)

Alternates render in a collapsed `<details>` block. Lighter UI — no thumbnail, no status dropdown by default. Status appears only after the user explicitly interacts (clicks Watch).

```typescript
// frontend/components/ui/AlternateCourseCard.tsx
"use client";
import type { Course } from "@/lib/schemas/api";
import type { CourseProgress, CourseStatus } from "@/lib/progress/types";
import { useToast } from "@/state/ToastContext";
import { useProgress } from "@/state/ProgressContext";

interface Props {
  course: Course;
  progress: CourseProgress | undefined;
  gapSkill: string;
  gapSeverity: 1 | 2 | 3 | 4 | 5;
  gapCategory: "required" | "nice_to_have";
}

export function AlternateCourseCard({ course, progress, gapSkill, gapSeverity, gapCategory }: Props) {
  const { updateStatus } = useProgress();
  const toast = useToast();
  const hasInteracted = !!progress; // user already touched this alternate

  const handleWatchClick = () => {
    // Touching an alternate "promotes" it into progress tracking
    if (!progress || progress.status === "not_started") {
      updateStatus(course.course_id, "in_progress", {
        gapSkill, gapSeverity, gapCategory,
        isAlternate: true,  // counted separately in snapshot
      });
    }
    window.open(course.url, "_blank", "noopener,noreferrer");
    toast.show({
      message: `📺 Watching "${truncate(course.title, 40)}" (alternate)?`,
      action: {
        label: "Mark complete",
        onClick: () => updateStatus(course.course_id, "completed", {
          gapSkill, gapSeverity, gapCategory, isAlternate: true,
        }),
      },
      duration: 30_000,
    });
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 border-l-2 border-slate-200 ml-4 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{course.title}</div>
        <div className="text-xs text-slate-500">
          {course.channel}
          {course.duration_minutes && ` · ${formatDuration(course.duration_minutes)}`}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        <button
          onClick={handleWatchClick}
          className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded"
        >
          ▶ Watch
        </button>
        {hasInteracted && (
          <StatusDropdown
            value={progress!.status}
            onChange={(s) => updateStatus(course.course_id, s, {
              gapSkill, gapSeverity, gapCategory, isAlternate: true,
            })}
          />
        )}
      </div>
    </div>
  );
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function formatDuration(mins: number) {
  const h = Math.floor(mins / 60); const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
```

### 15.4 GapCoursesSection (Composes Primary + Alternates)

```typescript
// frontend/components/ui/GapCoursesSection.tsx
"use client";
import type { Course } from "@/lib/schemas/api";
import { CourseCard } from "./CourseCard";
import { AlternateCourseCard } from "./AlternateCourseCard";
import { useProgress } from "@/state/ProgressContext";

interface Props {
  courses: Course[];  // backend returns up to 3
  gapSkill: string;
  gapSeverity: 1 | 2 | 3 | 4 | 5;
  gapCategory: "required" | "nice_to_have";
}

export function GapCoursesSection({ courses, gapSkill, gapSeverity, gapCategory }: Props) {
  const { getProgress } = useProgress();
  const [primary, ...alternates] = courses;

  if (!primary) {
    return <div className="text-sm text-slate-500 italic px-3 py-2">No courses available.</div>;
  }

  return (
    <div className="space-y-2">
      {/* Primary: full CourseCard treatment */}
      <CourseCard
        course={primary}
        progress={getProgress(primary.course_id)}
        gapSkill={gapSkill}
        gapSeverity={gapSeverity}
        gapCategory={gapCategory}
      />

      {/* Alternates: collapsed by default */}
      {alternates.length > 0 && (
        <details className="ml-1">
          <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900 py-1 select-none">
            Show {alternates.length} alternate {alternates.length === 1 ? "video" : "videos"}
          </summary>
          <div className="mt-1 space-y-1">
            {alternates.map(alt => (
              <AlternateCourseCard
                key={alt.course_id}
                course={alt}
                progress={getProgress(alt.course_id)}
                gapSkill={gapSkill}
                gapSeverity={gapSeverity}
                gapCategory={gapCategory}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

### 15.5 ProgressContext.updateStatus (Updated Signature)

The `updateStatus` call needs gap metadata when creating a new progress record (first user interaction with a course). The new `isAlternate` flag distinguishes primary courses from alternates for snapshot counting:

```typescript
// frontend/state/ProgressContext.tsx (key parts)
interface ProgressCtx {
  snapshot: ProgressSnapshot;
  getProgress: (courseId: string) => CourseProgress | undefined;
  updateStatus: (
    courseId: string,
    status: CourseStatus,
    meta: {
      gapSkill: string;
      gapSeverity: 1|2|3|4|5;
      gapCategory: "required" | "nice_to_have";
      isAlternate?: boolean;  // true for alternates the user explicitly touched
    }
  ) => void;
}

// inside ProgressProvider:
const updateStatus = useCallback(async (courseId: string, status: CourseStatus, meta) => {
  // Optimistic update
  setItems(prev => {
    const existing = prev.find(i => i.courseId === courseId);
    const now = Date.now();
    if (existing) {
      return prev.map(i => i.courseId !== courseId ? i : {
        ...i,
        status,
        lastTouchedAt: now,
        startedAt: i.startedAt ?? (status !== "not_started" ? now : null),
        completedAt: status === "completed" ? now : i.completedAt,
      });
    }
    // New record (first interaction)
    return [...prev, {
      courseId,
      gapSkill: meta.gapSkill,
      gapSeverity: meta.gapSeverity,
      gapCategory: meta.gapCategory,
      isAlternate: meta.isAlternate ?? false,
      status,
      startedAt: status !== "not_started" ? now : null,
      completedAt: status === "completed" ? now : null,
      lastTouchedAt: now,
      notes: "",
    }];
  });

  // Debounced persist
  await store.updateStatus(courseId, status, meta);
}, [store]);
```

**Counting rule in snapshot:**
- All **primary** courses count toward `totalCourses` (one per gap)
- **Alternates** count toward `totalCourses` **only if the user has touched them** (i.e., they have a `CourseProgress` record AND `isAlternate === true`)
- This keeps the default progress bar meaningful: "9 things to learn" not "27 videos to watch"
- A user who explores alternates opts into counting them

### 15.6 Why This Approach (For The README)

> *Courses open in a new YouTube tab (Approach D — external link). Clicking "Watch" auto-marks the course as "in progress" and triggers a nudge banner with a one-click "Mark complete" shortcut. This captures 80% of the embedded-player UX in 5% of the code.*
>
> *Embedded player (Approach C — YouTube IFrame Player API with auto-completion at 85% watched, anti-skip tracking) was considered. It adds ~3 hours of work and 10 edge cases (disabled-embed videos, age restrictions, autoplay policies, mobile gesture compliance). Documented as next step.*

---

## 16. Docker Compose (Local Dev)

```yaml
# docker-compose.yml
services:
  backend:
    build:
      context: ./backend
    ports:
      - "8000:8000"
    env_file:
      - backend/.env
    environment:
      - FRONTEND_ORIGIN=http://localhost:3000
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 10s
      timeout: 3s
      retries: 5

  frontend:
    build:
      context: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on:
      backend:
        condition: service_healthy
```

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

---

## 17. Environment Variables

```bash
# backend/.env.example
OPENAI_API_KEY=
YOUTUBE_API_KEY=
MOCK_MODE=false
FRONTEND_ORIGIN=http://localhost:3000
```

```bash
# frontend/.env.local.example
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 18. Implementation Order (Time-Boxed)

### Base Build (~5h — submittable on its own)

| Phase | Duration | Files |
|---|---|---|
| **P0 Scaffold** | 30m | Both apps' package.json/pyproject + Dockerfiles + docker-compose + hello-world endpoint |
| **P1 Taxonomy + deterministic** | 40m | `taxonomy/`, `utils/`, basic `/analyze` returning fallback-only result |
| **P2 Agents 1+2** | 45m | `llm/`, `run_agent.py`, `resume_parser.py`, `jd_parser.py`, prompts |
| **P3 Agent 3 (brain)** | 45m | `gap_reasoner.py` + prompt, integrate in orchestrator |
| **P4 Agents 4+5** | 45m | `study_planner.py`, `course_curator.py`, `youtube_source.py`, `static_source.py` |
| **P5 Progress + UI** | 45m | `progress/`, `ProgressContext`, `StudyPlanScreen`, `NextUpCard`, `CourseCard` (with Approach D auto-progress + nudge), `ToastContext` |
| **P6 Polish + mock mode** | 25m | `mock_responses.py`, `FallbackBanner`, `DebugPanel`, `ToastContainer` |

### Optimization Layer (+3h — each phase independently cuttable)

| Phase | Duration | Files |
|---|---|---|
| **P-OPT1 L1+L3 caches + timeouts** | 40m | `cache/base.py`, `cache/analysis_cache.py`, `cache/course_cache.py`, per-agent timeout config |
| **P-OPT2 L2 semantic cache** | 45m | `semantic/embedder.py`, `semantic/cosine.py`, `cache/semantic_cache.py`, `cache/gate.py`, `schemas/cache_models.py` |
| **P-OPT3 Hybrid taxonomy** | 40m | `taxonomy/index.py`, update `taxonomy/matcher.py` to hybrid, build index at startup |
| **P-OPT4 SSE streaming** | 45m | `streaming/events.py`, update `api/analyze.py` for StreamingResponse, frontend SSE consumer |

### Wrap-up (~1h)

| Phase | Duration | Files |
|---|---|---|
| **P7 README + cleanup** | 35m | README with all required sections + tradeoffs + optimization decisions |
| **P8 Loom (optional)** | 20m | ≤ 3 min walkthrough |

**Final total scope: ~9h** (base 5h + optimizations 3h + wrap 1h). Note: Approach D (external link + auto-progress + nudge) is in P5 — the simpler video flow. Approach C (embedded player + IFrame API + anti-skip tracking) is documented as a future-step in the README (~3h additional if implemented later).

Cut order if running short:
1. Drop P-OPT4 (streaming) — saves 45m, end-to-end still works
2. Drop P-OPT3 (hybrid taxonomy) — saves 40m, deterministic still catches ~85%
3. Drop P-OPT2 (semantic cache) — saves 45m, L1 exact cache still works
4. **Never drop P-OPT1** — caches + timeouts are the highest ROI

---

## 19. Testing (Minimal, High-Value)

```python
# backend/tests/test_taxonomy.py
from app.taxonomy.matcher import match_skills

SAMPLE_RESUME = """Aarav Mehta — Frontend Developer
Skills: HTML, CSS, JavaScript, React, Git, REST API"""


def test_match_skills_finds_react():
    skills = match_skills(SAMPLE_RESUME)
    ids = [s.id for s in skills]
    assert "react" in ids or "reactjs" in ids
```

```python
# backend/tests/test_orchestrator_mock.py
import pytest
from app.llm.mock_provider import MockLLMProvider
from app.courses.static_source import StaticCatalogSource
from app.agents.orchestrator import Orchestrator

SAMPLE_RESUME = "..."
SAMPLE_JD = "..."


@pytest.mark.asyncio
async def test_full_pipeline_mock_mode():
    orch = Orchestrator(
        llm=MockLLMProvider(),
        course_sources=[StaticCatalogSource()],
        mock_mode=True,
    )
    result = await orch.run(SAMPLE_RESUME, SAMPLE_JD)
    assert result.match_score >= 0
    assert len(result.required_gaps) >= 6
    assert result.meta.mock_mode is True
```

```typescript
// frontend/__tests__/snapshot.test.ts
import { computeSnapshot } from "@/lib/progress/snapshot";

test("weightedPercent counts severity-5 as 5x severity-1", () => {
  // ...
});
```

Three tests. They protect the math and the contract.

---

**LLD is complete. Open files, follow the structure, ship.**
