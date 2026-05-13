"""Orchestrator — coordinates the 5-agent pipeline.

P1: deterministic only.
P2: agents 1+2 added (resume + jd parsers run concurrently, with fallback).
P3-P4: gap reasoner, study planner, course curator slot in here.
"""
import asyncio
import time
from typing import Iterable

from app.agents.gap_reasoner import run_gap_reasoner
from app.agents.jd_parser import run_jd_parser
from app.agents.resume_parser import run_resume_parser
from app.agents.study_planner import run_study_planner
from app.courses.source import CourseSource
from app.llm.provider import LLMProvider
from app.schemas.api_models import AnalyzeMeta, AnalyzeResponse, EnrichedGap
from app.schemas.llm_models import Course, Gap, JdStructured, ResumeStructured
from app.taxonomy.matcher import MatchedSkill, all_skills, match_skills
from app.telemetry.logger import logger
from app.utils.cache import TTLCache
from app.utils.hash import hash_str

_CACHE = TTLCache(max_size=50, ttl_seconds=3600)

_CORE_REQUIRED_CATEGORIES = {"language", "framework", "runtime", "database", "api"}


class Orchestrator:
    def __init__(
        self,
        *,
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

        # ── Deterministic pre-pass (always runs) ─────────────────────
        t0 = time.time()
        resume_hints = match_skills(resume)
        jd_hints = match_skills(jd)
        timings["taxonomy"] = (time.time() - t0) * 1000

        # ── Stage 1: Agents 1 + 2 concurrent ────────────────────────
        (resume_struct, r_fb, r_ms), (jd_struct, j_fb, j_ms) = await asyncio.gather(
            run_resume_parser(llm=self.llm, text=resume, hints=resume_hints),
            run_jd_parser(llm=self.llm, text=jd, hints=jd_hints),
        )
        if r_fb:
            fallbacks_used.append("resume_parser")
        if j_fb:
            fallbacks_used.append("jd_parser")
        timings["resume_parser"] = r_ms
        timings["jd_parser"] = j_ms

        # ── Stage 2: Gap Reasoner (LLM, with deterministic fallback) ──
        taxonomy_hints = {
            "resume_skills": [s.canonical for s in resume_hints],
            "jd_skills": [s.canonical for s in jd_hints],
        }
        gap_analysis, g_fb, g_ms = await run_gap_reasoner(
            llm=self.llm,
            resume=resume_struct,
            jd=jd_struct,
            taxonomy_hints=taxonomy_hints,
        )
        if g_fb:
            fallbacks_used.append("gap_reasoner")
        timings["gap_reasoner"] = g_ms
        gaps = gap_analysis.gaps
        gaps.sort(key=lambda g: (g.category != "required", -g.severity))
        strengths = sorted(set(gap_analysis.strengths_matching))
        match_score = gap_analysis.overall_match_score

        # ── Stage 3: Study Planner (LLM, with deterministic fallback) ──
        study_plan, p_fb, p_ms = await run_study_planner(llm=self.llm, gaps=gaps)
        if p_fb:
            fallbacks_used.append("study_planner")
        timings["study_planner"] = p_ms
        plan_by_skill = {item.gap_skill: item for item in study_plan.items}

        # ── Stage 4: Course fetch (per-gap, concurrent across sources) ──
        t2 = time.time()
        course_lists = await asyncio.gather(
            *[
                self._fetch_courses(
                    query=(plan_by_skill[g.skill].search_queries[0]
                           if g.skill in plan_by_skill and plan_by_skill[g.skill].search_queries
                           else g.search_query),
                    skill_id=_slug(g.skill),
                )
                for g in gaps
            ]
        )
        timings["course_curator"] = (time.time() - t2) * 1000

        enriched: list[EnrichedGap] = []
        for g, courses in zip(gaps, course_lists):
            plan_item = plan_by_skill.get(g.skill)
            enriched.append(
                EnrichedGap(
                    **g.model_dump(),
                    courses=courses,
                    estimated_hours=(plan_item.estimated_hours if plan_item else _estimate_hours(g)),
                )
            )

        result = AnalyzeResponse(
            match_score=match_score,
            required_gaps=[g for g in enriched if g.category == "required"],
            nice_to_have_gaps=[g for g in enriched if g.category == "nice_to_have"],
            strengths=strengths,
            meta=AnalyzeMeta(
                fallbacks_used=sorted(set(fallbacks_used)),
                agent_timings_ms=timings,
                mock_mode=self.mock_mode,
            ),
        )

        _CACHE.set(cache_key, result)
        logger.info(
            "analysis_complete",
            gaps=len(gaps),
            strengths=len(strengths),
            match_score=match_score,
            fallbacks=len(set(fallbacks_used)),
        )
        return result

    async def _fetch_courses(self, *, query: str, skill_id: str) -> list[Course]:
        """Return top 3 ranked courses: 1 primary + 2 alternates.

        Frontend shows the primary by default and hides alternates behind a disclosure.
        See architecture §15 "One primary course per gap".
        """
        for source in self.course_sources:
            try:
                courses = await source.fetch_courses(query=query, skill_id=skill_id)
                if courses:
                    return courses[:3]
            except Exception as e:
                logger.error("course_source_failed", source=source.name, err=str(e))
                continue
        return []


def _estimate_hours(gap: Gap) -> int:
    return {1: 4, 2: 6, 3: 10, 4: 16, 5: 24}.get(gap.severity, 10)


def _slug(skill_canonical: str) -> str:
    for entry in all_skills():
        if entry["canonical"] == skill_canonical:
            return entry["id"]
    return skill_canonical.lower().replace(" ", "_").replace(".", "")
