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
            refusal = completion.choices[0].message.refusal
            raise ValueError(f"OpenAI returned no parsed content (refusal={refusal!r})")
        return parsed
