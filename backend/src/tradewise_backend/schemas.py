from typing import Literal

from pydantic import BaseModel, Field

SignalLabel = Literal["bullish", "bearish", "neutral"]
ModelProfile = Literal["safe", "neutral", "risky"]
ChartType = Literal["line", "candlestick"]
RefreshCadence = Literal["1m", "5m", "15m"]
LiveStreamFeed = Literal["iex", "delayed_sip", "sip"]


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


class AutoTradeResponse(BaseModel):
    ticker: str
    modelProfile: ModelProfile
    cadence: RefreshCadence
    mode: Literal["paper"] = "paper"
    signal: SignalLabel
    confidence: float = Field(ge=0, le=100)
    action: Literal["buy", "sell", "hold"]
    submitted: bool
    quantity: int = Field(ge=0)
    positionBeforeShares: int = Field(ge=0)
    orderId: str | None = None
    statusMessage: str
    quote: QuoteResponse


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
