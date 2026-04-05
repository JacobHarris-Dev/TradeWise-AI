from fastapi import FastAPI, HTTPException, Query, WebSocket
from starlette.websockets import WebSocketState

from . import MODEL_VERSION
from .engine import build_quote_response
from .live_stream import relay_live_trade_stream
from .mock_trading import DEFAULT_MOCK_STEPS, MAX_MOCK_STEPS, MIN_MOCK_STEPS, build_mock_trading_day_response
from .paper_trading import execute_auto_trade
from .schemas import AnalyzeRequest, AutoTradeRequest, AutoTradeResponse, MockTradingDayResponse, QuoteResponse

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
    model_profile: str | None = Query(None, alias="modelProfile"),
    chart_type: str | None = Query(None, alias="chartType"),
) -> QuoteResponse:
    try:
        return build_quote_response(
            ticker,
            include_chart=include_chart,
            model_profile=model_profile,
            chart_type=chart_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/v1/analyze", response_model=QuoteResponse)
def analyze_quote(payload: AnalyzeRequest) -> QuoteResponse:
    try:
        return build_quote_response(
            payload.ticker,
            include_chart=payload.includeChart,
            model_profile=payload.modelProfile,
            chart_type=payload.chartType,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/v1/mock-day", response_model=MockTradingDayResponse)
def get_mock_trading_day(
    ticker: str = Query(..., min_length=1, max_length=16),
    model_profile: str | None = Query("risky", alias="modelProfile"),
    steps: int = Query(
        DEFAULT_MOCK_STEPS,
        ge=MIN_MOCK_STEPS,
        le=MAX_MOCK_STEPS,
    ),
) -> MockTradingDayResponse:
    try:
        return build_mock_trading_day_response(
            ticker,
            model_profile=model_profile,
            steps=steps,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/v1/auto-trade", response_model=AutoTradeResponse)
def auto_trade(payload: AutoTradeRequest) -> AutoTradeResponse:
    try:
        return execute_auto_trade(
            payload.ticker,
            model_profile=payload.modelProfile,
            cadence=payload.cadence,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.websocket("/v1/ws/trades")
async def stream_trades(websocket: WebSocket) -> None:
    ticker = websocket.query_params.get("ticker")
    feed = websocket.query_params.get("feed")
    try:
        await relay_live_trade_stream(websocket, ticker or "", feed)
    except Exception as exc:
        if websocket.application_state == WebSocketState.CONNECTING:
            await websocket.accept()
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json({"type": "error", "message": str(exc)})
            await websocket.close(code=1008)
