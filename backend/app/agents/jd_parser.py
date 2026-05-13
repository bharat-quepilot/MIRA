from app.agents.prompts.jd_parser import SYSTEM_PROMPT
from app.agents.run_agent import run_agent
from app.llm.provider import LLMProvider
from app.schemas.llm_models import JdSkill, JdStructured
from app.taxonomy.matcher import MatchedSkill


async def run_jd_parser(
    *,
    llm: LLMProvider,
    text: str,
    hints: list[MatchedSkill],
) -> tuple[JdStructured, bool, float]:
    user_prompt = _build_user_prompt(text=text, hints=hints)

    def fallback() -> JdStructured:
        return _deterministic_fallback(text=text, hints=hints)

    return await run_agent(
        name="jd_parser",
        llm=llm,
        model="gpt-4o-mini",
        schema=JdStructured,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.2,
        timeout_s=12.0,
        fallback=fallback,
    )


def _build_user_prompt(*, text: str, hints: list[MatchedSkill]) -> str:
    hint_str = ", ".join(h.canonical for h in hints) if hints else "(none)"
    return (
        f"JOB DESCRIPTION TEXT:\n```\n{text}\n```\n\n"
        f"TAXONOMY HINTS (canonical names detected by keyword scan): {hint_str}\n\n"
        f"Split into required vs nice_to_have per the schema."
    )


def _deterministic_fallback(*, text: str, hints: list[MatchedSkill]) -> JdStructured:
    lower = text.lower()
    nice_markers = ["nice to have", "nice-to-have", "bonus", "plus:", "preferred", "good to have"]
    cut: int | None = None
    for marker in nice_markers:
        idx = lower.find(marker)
        if idx != -1 and (cut is None or idx < cut):
            cut = idx
    nice_section = lower[cut:] if cut is not None else ""

    required: list[JdSkill] = []
    nice: list[JdSkill] = []
    for h in hints:
        is_nice = h.canonical.lower() in nice_section
        skill = JdSkill(
            skill=h.canonical,
            weight=2 if is_nice else (5 if h.category in {"language", "framework", "runtime", "database", "api"} else 4),
            source_quote=h.canonical,
        )
        (nice if is_nice else required).append(skill)

    return JdStructured(
        role="Software Engineer",
        seniority="unknown",
        required=required,
        nice_to_have=nice,
    )
