from app.agents.prompts.resume_parser import SYSTEM_PROMPT
from app.agents.run_agent import run_agent
from app.llm.provider import LLMProvider
from app.schemas.llm_models import ResumeSkill, ResumeStructured
from app.taxonomy.matcher import MatchedSkill


async def run_resume_parser(
    *,
    llm: LLMProvider,
    text: str,
    hints: list[MatchedSkill],
) -> tuple[ResumeStructured, bool, float]:
    user_prompt = _build_user_prompt(text=text, hints=hints)

    def fallback() -> ResumeStructured:
        return _deterministic_fallback(text=text, hints=hints)

    return await run_agent(
        name="resume_parser",
        llm=llm,
        model="gpt-4o-mini",
        schema=ResumeStructured,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.2,
        timeout_s=12.0,
        fallback=fallback,
    )


def _build_user_prompt(*, text: str, hints: list[MatchedSkill]) -> str:
    hint_str = ", ".join(h.canonical for h in hints) if hints else "(none)"
    return (
        f"RESUME TEXT:\n```\n{text}\n```\n\n"
        f"TAXONOMY HINTS (canonical names detected by keyword scan): {hint_str}\n\n"
        f"Extract structured skill data per the schema."
    )


def _deterministic_fallback(*, text: str, hints: list[MatchedSkill]) -> ResumeStructured:
    skills = [
        ResumeSkill(
            name=h.canonical,
            proficiency="used",
            evidence=f"Mentioned in resume; matched taxonomy entry {h.id}.",
        )
        for h in hints
    ]
    return ResumeStructured(
        years_experience=None,
        role="Software Developer",
        skills=skills,
        domains=[],
    )
