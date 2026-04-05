from fastapi import FastAPI, HTTPException, Query

from . import MODEL_VERSION
from .engine import build_quote_response
from .schemas import AnalyzeRequest, QuoteResponse

app = FastAPI(title="TradeWise ML Backend", version=MODEL_VERSION)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "tradewise-ml",
        "modelVersion": MODEL_VERSION,
    }


@app.get("/v1/quote", response_model=QuoteResponse)
def get_quote(
    ticker: str = Query(..., min_length=1, max_length=16),
    include_chart: bool = Query(False, alias="includeChart"),
) -> QuoteResponse:
    try:
        return build_quote_response(ticker, include_chart=include_chart)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/v1/analyze", response_model=QuoteResponse)
def analyze_quote(payload: AnalyzeRequest) -> QuoteResponse:
    try:
        return build_quote_response(payload.ticker, include_chart=payload.includeChart)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
