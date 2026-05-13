import json

from app.agents.prompts.gap_reasoner import SYSTEM_PROMPT
from app.agents.run_agent import run_agent
from app.llm.provider import LLMProvider
from app.schemas.llm_models import Gap, GapAnalysis, JdStructured, ResumeStructured


async def run_gap_reasoner(
    *,
    llm: LLMProvider,
    resume: ResumeStructured,
    jd: JdStructured,
    taxonomy_hints: dict,
) -> tuple[GapAnalysis, bool, float]:
    user_prompt = _build_user_prompt(resume=resume, jd=jd, hints=taxonomy_hints)

    def fallback() -> GapAnalysis:
        return _deterministic_fallback(resume=resume, jd=jd)

    return await run_agent(
        name="gap_reasoner",
        llm=llm,
        model="gpt-4o-mini",
        schema=GapAnalysis,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.2,
        timeout_s=30.0,  # reasoning over 16+ skills with structured outputs is the slow stage
        max_retries=0,   # one shot — if it can't finish in 30s, the fallback is fine
        fallback=fallback,
    )


def _build_user_prompt(
    *, resume: ResumeStructured, jd: JdStructured, hints: dict
) -> str:
    payload = {
        "resume_structured": resume.model_dump(),
        "jd_structured": jd.model_dump(),
        "taxonomy_hints": hints,
    }
    return (
        "Analyze the candidate against the JD and produce a GapAnalysis.\n\n"
        f"INPUT:\n```json\n{json.dumps(payload, indent=2)}\n```"
    )


def _deterministic_fallback(
    *, resume: ResumeStructured, jd: JdStructured
) -> GapAnalysis:
    resume_skill_set = {s.name.lower() for s in resume.skills}

    all_jd = (
        [(s, "required") for s in jd.required]
        + [(s, "nice_to_have") for s in jd.nice_to_have]
    )

    gaps: list[Gap] = []
    seen: set[str] = set()
    for jd_skill, category in all_jd:
        key = jd_skill.skill.lower()
        if key in resume_skill_set or key in seen:
            continue
        seen.add(key)
        severity = jd_skill.weight if category == "required" else max(1, min(2, jd_skill.weight))
        gaps.append(
            Gap(
                skill=jd_skill.skill,
                category=category,  # type: ignore[arg-type]
                severity=severity,
                status="missing",
                evidence=f"{jd_skill.skill} appears in the JD but not in the resume.",
                jd_quote=jd_skill.source_quote,
                search_query=f"{jd_skill.skill} tutorial",
            )
        )

    strengths = sorted({s.skill for s, _ in all_jd if s.skill.lower() in resume_skill_set})
    total_w = sum(s.weight for s, _ in all_jd)
    matched_w = sum(s.weight for s, _ in all_jd if s.skill.lower() in resume_skill_set)
    score = round((matched_w / total_w) * 100) if total_w else 0
    return GapAnalysis(
        overall_match_score=score,
        gaps=gaps,
        strengths_matching=strengths,
    )
