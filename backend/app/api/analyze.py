from fastapi import APIRouter, HTTPException, Request

from app.schemas.api_models import AnalyzeRequest, AnalyzeResponse
from app.utils.rate_limit import check_rate_limit

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, request: Request):
    client_ip = request.headers.get("x-forwarded-for") or (
        request.client.host if request.client else "unknown"
    )
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="rate_limited")

    orchestrator = request.app.state.orchestrator
    return await orchestrator.run(req.resume, req.jd)
