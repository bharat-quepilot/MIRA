from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

from app.agents.orchestrator import Orchestrator
from app.api.analyze import router as analyze_router
from app.api.health import router as health_router
from app.config import settings
from app.courses.source import CourseSource
from app.courses.static_source import StaticCatalogSource
from app.courses.youtube_source import YouTubeSource
from app.llm.mock_provider import MockLLMProvider
from app.llm.openai_provider import OpenAIProvider
from app.llm.provider import LLMProvider
from app.telemetry.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Composition Root — all wiring happens here.
    use_mock = settings.mock_mode or not settings.openai_api_key
    llm: LLMProvider
    if use_mock:
        llm = MockLLMProvider()
        logger.info("llm_init", provider="mock", reason="missing_key" if not settings.openai_api_key else "mock_mode")
    else:
        llm = OpenAIProvider(AsyncOpenAI(api_key=settings.openai_api_key))
        logger.info("llm_init", provider="openai")

    course_sources: list[CourseSource] = []
    if settings.youtube_api_key:
        course_sources.append(YouTubeSource(api_key=settings.youtube_api_key))
        logger.info("course_source_init", source="youtube")
    course_sources.append(StaticCatalogSource())  # always last — never fails
    logger.info("course_source_init", source="static")

    app.state.orchestrator = Orchestrator(
        llm=llm,
        course_sources=course_sources,
        mock_mode=use_mock,
    )
    yield


app = FastAPI(
    title="MIRA",
    description="Multi-agent Intelligence for Resume Analysis",
    version="1.0.0",
    lifespan=lifespan,
)

_dev_origins = [settings.frontend_origin]
if settings.frontend_origin == "http://localhost:3000":
    _dev_origins.append("http://localhost:3001")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_dev_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(analyze_router)
