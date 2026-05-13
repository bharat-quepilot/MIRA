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
