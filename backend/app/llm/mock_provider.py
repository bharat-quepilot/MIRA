from typing import Type, TypeVar

from pydantic import BaseModel

from app.llm.mock_responses import MOCK_RESPONSES
from app.llm.provider import LLMProvider

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
