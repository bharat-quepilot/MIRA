import json

from app.agents.prompts.study_planner import SYSTEM_PROMPT
from app.agents.run_agent import run_agent
from app.llm.provider import LLMProvider
from app.schemas.llm_models import Gap, StudyPlan, StudyPlanItem


async def run_study_planner(
    *,
    llm: LLMProvider,
    gaps: list[Gap],
) -> tuple[StudyPlan, bool, float]:
    user_prompt = _build_user_prompt(gaps=gaps)

    def fallback() -> StudyPlan:
        return _deterministic_fallback(gaps=gaps)

    return await run_agent(
        name="study_planner",
        llm=llm,
        model="gpt-4o-mini",
        schema=StudyPlan,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.2,
        timeout_s=20.0,
        max_retries=0,
        fallback=fallback,
    )


def _build_user_prompt(*, gaps: list[Gap]) -> str:
    payload = [
        {
            "skill": g.skill,
            "category": g.category,
            "severity": g.severity,
            "status": g.status,
        }
        for g in gaps
    ]
    return (
        f"GAPS TO PLAN AROUND ({len(gaps)}):\n```json\n{json.dumps(payload, indent=2)}\n```\n\n"
        "Produce a StudyPlan with exactly one StudyPlanItem per gap."
    )


# ──────────────────────────────────────────────────────────────────────
# Deterministic fallback — static templates from the gap itself.
# ──────────────────────────────────────────────────────────────────────

_HOURS_BY_SEVERITY: dict[int, int] = {1: 4, 2: 6, 3: 10, 4: 16, 5: 24}


def _deterministic_fallback(*, gaps: list[Gap]) -> StudyPlan:
    # Required (severity desc) first, then nice-to-have (severity desc)
    ordered = sorted(gaps, key=lambda g: (g.category != "required", -g.severity))
    items: list[StudyPlanItem] = [
        StudyPlanItem(
            gap_skill=g.skill,
            search_queries=[g.search_query, f"{g.skill} crash course"],
            prerequisites=[],
            estimated_hours=_HOURS_BY_SEVERITY.get(g.severity, 10),
            learning_order_rank=i + 1,
        )
        for i, g in enumerate(ordered)
    ]
    return StudyPlan(items=items)
