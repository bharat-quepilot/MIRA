"""LLM-call facade: timeout + retry + deterministic fallback in one place.

Every agent calls into this helper. It's the reason we don't need LangChain.
"""
import asyncio
import time
from typing import Awaitable, Callable, Type, TypeVar

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
    fallback: Callable[[], T] | Callable[[], Awaitable[T]],
    temperature: float = 0.2,
    timeout_s: float = 8.0,
    max_retries: int = 1,
) -> tuple[T, bool, float]:
    """Run an agent with primary LLM call + deterministic fallback.

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
                await asyncio.sleep(0.8 * (attempt + 1))
                continue
            elapsed_ms = (time.time() - start) * 1000
            logger.agent(name, ms=elapsed_ms, ok=False, err=type(e).__name__)
            logger.fallback(name, reason=type(e).__name__)
            fb = fallback()
            if asyncio.iscoroutine(fb):
                fb = await fb
            return fb, True, elapsed_ms

    # unreachable
    raise RuntimeError("run_agent fell through")
