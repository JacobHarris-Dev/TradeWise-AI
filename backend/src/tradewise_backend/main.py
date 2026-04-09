from fastapi import FastAPI, HTTPException, Query, WebSocket
from starlette.websockets import WebSocketState

from . import MODEL_VERSION
from .engine import build_quote_response, build_quote_responses
from .live_stream import relay_live_trade_stream
from .mock_trading import DEFAULT_MOCK_STEPS, MAX_MOCK_STEPS, MIN_MOCK_STEPS, build_mock_trading_day_response
from .news import (
    build_market_news_snapshot,
    build_news_context_snapshot,
    build_news_context_snapshot_for_as_of,
)
from .news_reasoning import build_investment_chat_reply, build_student_news_reasoning
from .news import build_market_news_snapshot, build_news_context_snapshot
from .news_reasoning import (
    build_investment_chat_reply,
    build_market_news_brief,
    build_portfolio_coach_reply,
    build_student_news_reasoning,
)
from .paper_account import get_paper_account, grant_paper_position
from .paper_portfolio import build_paper_account_performance
from .paper_trading import execute_auto_trade, execute_auto_trade_batch
from .watch_sessions import get_watch_session, snapshot_watch_session, start_watch_session, stop_watch_session
from .schemas import (
    AnalyzeRequest,
    AutoTradeBatchRequest,
    AutoTradeBatchResponse,
    AutoTradeRequest,
    AutoTradeResponse,
    InvestmentChatRequest,
    InvestmentChatResponse,
    MarketNewsArticleResponse,
    MarketNewsResponse,
    MockTradingDayResponse,
    NewsReportResponse,
    PaperPositionGrantRequest,
    PaperAccountResponse,
    PaperAccountPerformanceResponse,
    PortfolioCoachRequest,
    PortfolioCoachResponse,
    QuoteBatchResponse,
    QuoteResponse,
    StockRecommendationResponse,
    StockRecommendationsResponse,
    StockUniverseResolveMatchResponse,
    StockUniverseResolveResponse,
    WatchSessionResponse,
    WatchSessionStartRequest,
)
from .stock_universe import recommend_stocks_for_sectors, resolve_stock_universe_matches

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
    as_of: str | None = Query(None, alias="asOf", max_length=128),
) -> QuoteResponse:
    try:
        return build_quote_response(
            ticker,
            include_chart=include_chart,
            model_profile=model_profile,
            chart_type=chart_type,
            as_of=as_of,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/v1/quotes", response_model=QuoteBatchResponse)
def get_quotes(
    tickers: str = Query(..., min_length=1, max_length=512),
    include_chart: bool = Query(False, alias="includeChart"),
    model_profile: str | None = Query(None, alias="modelProfile"),
    chart_type: str | None = Query(None, alias="chartType"),
    provider: str | None = Query(None, alias="provider"),
    as_of: str | None = Query(None, alias="asOf", max_length=128),
) -> QuoteBatchResponse:
    try:
        return build_quote_responses(
            [ticker.strip() for ticker in tickers.split(",") if ticker.strip()],
            include_chart=include_chart,
            model_profile=model_profile,
            chart_type=chart_type,
            provider=provider,
            as_of=as_of,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/v1/stock-universe/recommendations", response_model=StockRecommendationsResponse)
def get_stock_recommendations(
    sectors: str = Query(..., min_length=1, max_length=256),
    count: int = Query(3, ge=1, le=5),
) -> StockRecommendationsResponse:
    raw_sectors = [value.strip() for value in sectors.split(",") if value.strip()]
    try:
        recommendations = recommend_stocks_for_sectors(raw_sectors, count=count)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    normalized_sectors = sorted({item.strip().lower() for item in raw_sectors if item.strip()})

    return StockRecommendationsResponse(
        sectors=normalized_sectors,
        count=count,
        results=[
            StockRecommendationResponse(
                ticker=item.ticker,
                companyName=item.company_name,
                sector=item.sector,
            )
            for item in recommendations
        ],
    )


@app.get("/v1/stock-universe/resolve", response_model=StockUniverseResolveResponse)
def resolve_stock_universe(
    query: str = Query(..., min_length=1, max_length=256),
    count: int = Query(3, ge=1, le=10),
) -> StockUniverseResolveResponse:
    results = resolve_stock_universe_matches(query, count=count)
    return StockUniverseResolveResponse(
        query=query,
        count=count,
        results=[
            StockUniverseResolveMatchResponse(
                ticker=match.row.ticker,
                companyName=match.row.company_name,
                sector=match.row.sector,
                industry=match.row.industry,
                matchType=match.match_type,
                matchedTerm=match.matched_term,
                score=match.score,
            )
            for match in results
        ],
    )


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


@app.post("/v1/investment-chat", response_model=InvestmentChatResponse)
def investment_chat(payload: InvestmentChatRequest) -> InvestmentChatResponse:
    try:
        result = build_investment_chat_reply(
            prompt=payload.prompt,
            model_profile=payload.modelProfile,
            sectors=payload.sectors,
            tracked_tickers=payload.trackedTickers,
        )
        return InvestmentChatResponse(reply=result.text, source=result.source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/portfolio-coach", response_model=PortfolioCoachResponse)
def portfolio_coach(payload: PortfolioCoachRequest) -> PortfolioCoachResponse:
    coach = build_portfolio_coach_reply(
        cash=payload.cash,
        total_equity=payload.totalEquity,
        day_change_percent=payload.portfolioChangePercent,
        positions=[
            {
                "ticker": position.ticker,
                "shares": position.shares,
                "marketValue": position.marketValue,
                "changePercent": position.changePercent,
            }
            for position in payload.positions
        ],
        force_refresh=payload.forceRefresh,
    )
    return PortfolioCoachResponse(
        coachSummary=coach.text,
        coachSource=coach.source,
    )


@app.get("/v1/market-news", response_model=MarketNewsResponse)
def get_market_news(
    limit: int = Query(8, ge=1, le=20),
    refresh_seconds: int | None = Query(None, alias="refreshSeconds", ge=0, le=3600),
    force_refresh: bool = Query(False, alias="forceRefresh"),
) -> MarketNewsResponse:
    snapshot = build_market_news_snapshot(
        limit=limit,
        refresh_seconds=refresh_seconds,
        force_refresh=force_refresh,
    )
    context = snapshot.context
    llm_brief = build_market_news_brief(
        summary=context.summary if context is not None else None,
        sentiment=context.sentiment if context is not None else "neutral",
        topics=list(context.topics) if context is not None else [],
        headlines=[article.title for article in snapshot.articles],
        force_refresh=force_refresh,
    )

    return MarketNewsResponse(
        summary=context.summary if context is not None else None,
        llmBrief=llm_brief.text,
        briefSource=llm_brief.source,
        sentiment=context.sentiment if context is not None else "neutral",
        topics=list(context.topics) if context is not None else [],
        refreshedAt=snapshot.fetched_at.isoformat(),
        fromCache=snapshot.from_cache,
        refreshSeconds=snapshot.refresh_seconds,
        articleCount=len(snapshot.articles),
        articles=[
            MarketNewsArticleResponse(
                title=article.title,
                publisher=article.publisher,
                link=article.link,
                publishedAt=(
                    article.published_at.isoformat()
                    if article.published_at is not None
                    else None
                ),
            )
            for article in snapshot.articles
        ],
    )


@app.get("/v1/news-report", response_model=NewsReportResponse)
def get_news_report(
    ticker: str = Query(..., min_length=1, max_length=16),
    model_profile: str | None = Query(None, alias="modelProfile"),
    refresh_seconds: int | None = Query(None, alias="refreshSeconds", ge=0, le=3600),
    force_refresh: bool = Query(False, alias="forceRefresh"),
    as_of: str | None = Query(None, alias="asOf", max_length=128),
) -> NewsReportResponse:
    try:
        if as_of:
            snapshot = build_news_context_snapshot_for_as_of(
                ticker,
                as_of,
                force_refresh=force_refresh,
            )
            quote = build_quote_response(
                ticker,
                include_chart=False,
                model_profile=model_profile,
                chart_type="line",
                news_context_override=snapshot.context,
                as_of=as_of,
            )
        else:
            snapshot = build_news_context_snapshot(
                ticker,
                refresh_seconds=refresh_seconds,
                force_refresh=force_refresh,
            )
            quote = build_quote_response(
                ticker,
                include_chart=False,
                model_profile=model_profile,
                chart_type="line",
                news_context_override=snapshot.context,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    reasoning = build_student_news_reasoning(
        ticker=quote.ticker,
        signal=quote.signal,
        confidence=quote.confidence,
        sentiment=quote.newsSentiment,
        topics=quote.newsTopics,
        headlines=quote.newsHeadlines,
        force_refresh=force_refresh,
    )

    return NewsReportResponse(
        ticker=quote.ticker,
        report=reasoning.text,
        studentReasoning=reasoning.text,
        reasoningSource=reasoning.source,
        signal=quote.signal,
        confidence=quote.confidence,
        modelVersion=quote.modelVersion,
        refreshedAt=snapshot.fetched_at.isoformat(),
        fromCache=snapshot.from_cache,
        refreshSeconds=snapshot.refresh_seconds,
        articleCount=0 if snapshot.context is None else snapshot.context.article_count,
        newsSummary=quote.newsSummary,
        newsSentiment=quote.newsSentiment,
        newsTopics=quote.newsTopics,
        newsHeadlines=quote.newsHeadlines,
    )


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
            user_id=payload.userId,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/v1/auto-trade/batch", response_model=AutoTradeBatchResponse)
def auto_trade_batch(payload: AutoTradeBatchRequest) -> AutoTradeBatchResponse:
    try:
        return AutoTradeBatchResponse(
            results=execute_auto_trade_batch(
                payload.tickers,
                model_profile=payload.modelProfile,
                cadence=payload.cadence,
                user_id=payload.userId,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/v1/watch/start", response_model=WatchSessionResponse)
async def start_watch(payload: WatchSessionStartRequest) -> WatchSessionResponse:
    session = start_watch_session(
        user_id=payload.userId,
        tickers=payload.tickers,
        model_profile=payload.modelProfile,
        cadence=payload.cadence,
        auto_trade_enabled=payload.autoTradeEnabled,
    )
    return WatchSessionResponse(**snapshot_watch_session(session))


@app.get("/v1/watch", response_model=WatchSessionResponse)
def read_watch(user_id: str = Query("guest", alias="userId")) -> WatchSessionResponse:
    session = get_watch_session(user_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No active watch session.")
    return WatchSessionResponse(**snapshot_watch_session(session))


@app.delete("/v1/watch", response_model=dict[str, str])
async def delete_watch(user_id: str = Query("guest", alias="userId")) -> dict[str, str]:
    stop_watch_session(user_id)
    return {"status": "stopped"}


@app.get("/v1/paper-account", response_model=PaperAccountResponse)
def paper_account(
    user_id: str | None = Query(None, alias="userId"),
) -> PaperAccountResponse:
    return get_paper_account(user_id)


@app.get("/v1/paper-account/performance", response_model=PaperAccountPerformanceResponse)
def paper_account_performance(
    user_id: str | None = Query(None, alias="userId"),
    include_coach: bool = Query(False, alias="includeCoach"),
    force_coach_refresh: bool = Query(False, alias="forceCoachRefresh"),
) -> PaperAccountPerformanceResponse:
    performance = build_paper_account_performance(user_id)
    if not include_coach:
        return performance

    coach = build_portfolio_coach_reply(
        cash=performance.cash,
        total_equity=performance.totalEquity,
        day_change_percent=performance.dayChangePercent,
        positions=[
            {
                "ticker": position.ticker,
                "shares": position.shares,
                "marketValue": position.marketValue,
                "changePercent": position.changePercent,
            }
            for position in performance.positions
        ],
        force_refresh=force_coach_refresh,
    )
    return performance.model_copy(
        update={
            "coachSummary": coach.text,
            "coachSource": coach.source,
        }
    )


@app.post("/v1/paper-account/grant", response_model=PaperAccountResponse)
def paper_account_grant(payload: PaperPositionGrantRequest) -> PaperAccountResponse:
    try:
        return grant_paper_position(
            user_id=payload.userId,
            ticker=payload.ticker,
            shares=payload.shares,
            avg_entry_price=payload.avgEntryPrice,
            cash=payload.cash,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.websocket("/v1/ws/trades")
async def stream_trades(websocket: WebSocket) -> None:
    ticker = websocket.query_params.get("ticker")
    symbols = websocket.query_params.get("symbols")
    feed = websocket.query_params.get("feed")
    try:
        await relay_live_trade_stream(websocket, symbols or ticker or "", feed)
    except Exception as exc:
        if websocket.application_state == WebSocketState.CONNECTING:
            await websocket.accept()
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json({"type": "error", "message": str(exc)})
            await websocket.close(code=1008)
