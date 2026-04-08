from typing import Literal

from pydantic import BaseModel, Field

SignalLabel = Literal["bullish", "bearish", "neutral"]
ModelProfile = Literal["safe", "neutral", "risky"]
ChartType = Literal["line", "candlestick"]
RefreshCadence = Literal["1m", "5m", "15m"]
LiveStreamFeed = Literal["iex", "delayed_sip", "sip"]
NewsSentiment = Literal["positive", "negative", "neutral"]


class TechnicalSnapshot(BaseModel):
    shortMovingAverage: float
    longMovingAverage: float
    volatility: float
    momentum: float
    discountFactor: float


class QuoteResponse(BaseModel):
    ticker: str
    companyName: str
    lastPrice: float
    changePercent: float
    signal: SignalLabel
    confidence: float = Field(ge=0, le=100)
    explanation: str
    modelVersion: str
    selectedModelProfile: ModelProfile | None = None
    selectedChartType: ChartType = "line"
    history: list[float]
    technicals: TechnicalSnapshot
    chartDataUri: str | None = None
    newsSummary: str | None = None
    newsSentiment: NewsSentiment | None = None
    newsTopics: list[str] = Field(default_factory=list)
    newsHeadlines: list[str] = Field(default_factory=list)


class PriceSnapshotResponse(BaseModel):
    ticker: str
    companyName: str
    lastPrice: float
    changePercent: float


class MarketNewsArticleResponse(BaseModel):
    title: str
    publisher: str | None = None
    link: str | None = None
    publishedAt: str | None = None


class MarketNewsResponse(BaseModel):
    summary: str | None = None
    sentiment: NewsSentiment = "neutral"
    topics: list[str] = Field(default_factory=list)
    refreshedAt: str
    fromCache: bool
    refreshSeconds: int = Field(ge=0)
    articleCount: int = Field(ge=0)
    articles: list[MarketNewsArticleResponse] = Field(default_factory=list)


class QuoteBatchError(BaseModel):
    ticker: str
    message: str


class QuoteBatchResponse(BaseModel):
    results: list[QuoteResponse] = Field(default_factory=list)
    errors: list[QuoteBatchError] = Field(default_factory=list)


class StockRecommendationResponse(BaseModel):
    ticker: str
    companyName: str
    sector: str


class StockRecommendationsResponse(BaseModel):
    sectors: list[str] = Field(default_factory=list)
    count: int = Field(ge=1)
    results: list[StockRecommendationResponse] = Field(default_factory=list)


class NewsReportResponse(BaseModel):
    ticker: str
    report: str
    studentReasoning: str | None = None
    reasoningSource: Literal["qwen", "template"] = "template"
    signal: SignalLabel
    confidence: float = Field(ge=0, le=100)
    modelVersion: str
    refreshedAt: str
    fromCache: bool
    refreshSeconds: int = Field(ge=0)
    articleCount: int = Field(ge=0)
    newsSummary: str | None = None
    newsSentiment: NewsSentiment | None = None
    newsTopics: list[str] = Field(default_factory=list)
    newsHeadlines: list[str] = Field(default_factory=list)


class InvestmentChatRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1200)
    modelProfile: ModelProfile = "neutral"
    sectors: list[str] = Field(default_factory=list)
    trackedTickers: list[str] = Field(default_factory=list)


class InvestmentChatResponse(BaseModel):
    reply: str
    source: Literal["qwen", "template"] = "template"


class AnalyzeRequest(BaseModel):
    ticker: str
    includeChart: bool = False
    modelProfile: ModelProfile | None = None
    chartType: ChartType = "line"


class MockTradingStep(BaseModel):
    slot: str
    sourceDate: str
    price: float
    changePercent: float
    signal: SignalLabel
    confidence: float = Field(ge=0, le=100)
    action: Literal["buy", "sell", "hold"]
    cash: float
    shares: int = Field(ge=0)
    equity: float


class MockTradingSummary(BaseModel):
    startingCash: float
    startingPrice: float
    endingCash: float
    endingPrice: float
    endingShares: int = Field(ge=0)
    endingEquity: float
    returnPercent: float
    buys: int = Field(ge=0)
    sells: int = Field(ge=0)
    holds: int = Field(ge=0)


class MockTradingDayResponse(BaseModel):
    ticker: str
    companyName: str
    modelProfile: ModelProfile
    modelVersion: str
    sessionLabel: str
    datasetSource: str
    steps: list[MockTradingStep]
    summary: MockTradingSummary


class AutoTradeRequest(BaseModel):
    ticker: str
    modelProfile: ModelProfile = "risky"
    cadence: RefreshCadence = "1m"
    userId: str | None = None


class AutoTradeBatchRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=25)
    modelProfile: ModelProfile = "risky"
    cadence: RefreshCadence = "1m"
    userId: str | None = None


class AutoTradeResponse(BaseModel):
    ticker: str
    modelProfile: ModelProfile
    cadence: RefreshCadence
    mode: Literal["paper"] = "paper"
    userId: str | None = None
    signal: SignalLabel
    confidence: float = Field(ge=0, le=100)
    action: Literal["buy", "sell", "hold"]
    submitted: bool
    quantity: int = Field(ge=0)
    positionBeforeShares: int = Field(ge=0)
    positionAfterShares: int = Field(ge=0)
    cashBefore: float | None = None
    cashAfter: float | None = None
    orderId: str | None = None
    statusMessage: str
    quote: QuoteResponse


class AutoTradeBatchResponse(BaseModel):
    results: list[AutoTradeResponse] = Field(default_factory=list)


class PaperAccountPosition(BaseModel):
    ticker: str
    shares: int = Field(ge=0)
    avgEntryPrice: float = Field(ge=0)


class PaperAccountResponse(BaseModel):
    userId: str
    startingCash: float = Field(ge=0)
    cash: float = Field(ge=0)
    positions: list[PaperAccountPosition]
    updatedAt: str


class PaperAccountPerformancePosition(BaseModel):
    ticker: str
    companyName: str
    shares: int = Field(ge=0)
    avgEntryPrice: float = Field(ge=0)
    currentPrice: float = Field(ge=0)
    marketValue: float = Field(ge=0)
    changePercent: float | None = None


class PaperAccountPerformancePoint(BaseModel):
    timestamp: str
    totalEquity: float = Field(ge=0)
    cash: float = Field(ge=0)
    positionsValue: float = Field(ge=0)


class PaperAccountPerformanceResponse(BaseModel):
    userId: str
    startingCash: float = Field(ge=0)
    cash: float = Field(ge=0)
    positionsValue: float = Field(ge=0)
    totalEquity: float = Field(ge=0)
    dayChange: float
    dayChangePercent: float
    baselineEquity: float = Field(ge=0)
    positions: list[PaperAccountPerformancePosition]
    points: list[PaperAccountPerformancePoint]
    updatedAt: str


class PaperPositionGrantRequest(BaseModel):
    userId: str | None = None
    ticker: str = Field(min_length=1, max_length=16)
    shares: int = Field(ge=0)
    avgEntryPrice: float = Field(gt=0)
    cash: float | None = Field(default=None, ge=0)


class LiveTradeTick(BaseModel):
    type: Literal["trade"] = "trade"
    symbol: str
    price: float
    size: int | None = None
    timestamp: str
    feed: LiveStreamFeed


class LiveStreamStatus(BaseModel):
    type: Literal["status"] = "status"
    symbol: str
    feed: LiveStreamFeed
    status: str


class LiveStreamError(BaseModel):
    type: Literal["error"] = "error"
    message: str
