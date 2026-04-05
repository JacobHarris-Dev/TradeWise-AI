from typing import Literal

from pydantic import BaseModel, Field

SignalLabel = Literal["bullish", "bearish", "neutral"]


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
    history: list[float]
    technicals: TechnicalSnapshot
    chartDataUri: str | None = None


class AnalyzeRequest(BaseModel):
    ticker: str
    includeChart: bool = False
