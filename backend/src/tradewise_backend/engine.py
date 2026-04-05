from __future__ import annotations

import base64
from dataclasses import asdict, dataclass
import io
import re

import numpy as np
import pandas as pd

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:  # pragma: no cover - exercised only when matplotlib is missing
    plt = None

from . import MODEL_VERSION
from .features import (
    DEFAULT_ANNUAL_RATE,
    HISTORY_LENGTH,
    build_latest_features,
    discount_factor,
)
from .market_data import get_close_history
from .model_runtime import load_model_bundle, predict_signal
from .schemas import QuoteResponse, SignalLabel, TechnicalSnapshot

TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,16}$")


@dataclass(frozen=True)
class QuoteProfile:
    company_name: str


KNOWN_QUOTES: dict[str, str] = {
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corp.",
    "GOOGL": "Alphabet Inc.",
    "NVDA": "NVIDIA Corp.",
    "VOO": "Vanguard S&P 500 ETF",
    "SPY": "S&P 500 ETF",
    "QQQ": "Nasdaq 100 ETF",
    "DIA": "Dow ETF",
}


def normalize_ticker(raw_ticker: str) -> str:
    return raw_ticker.strip().upper()


def validate_ticker(ticker: str) -> str:
    if not ticker:
        raise ValueError("Ticker is required.")
    if not TICKER_RE.fullmatch(ticker):
        raise ValueError("Invalid ticker. Use letters, numbers, dots, or hyphens up to 16 characters.")
    return ticker


def _price_profile(ticker: str) -> QuoteProfile:
    company_name = KNOWN_QUOTES.get(ticker, ticker)
    return QuoteProfile(company_name=company_name)


def _signal_score(short_ma: float, long_ma: float, momentum: float, volatility: float) -> float:
    trend_strength = (short_ma / long_ma) - 1.0 if long_ma else 0.0
    score = (
        0.55 * np.tanh(trend_strength * 10.0)
        + 0.30 * np.tanh(momentum * 7.0)
        - 0.15 * np.tanh(volatility * 45.0)
    )
    return float(score * discount_factor(30, DEFAULT_ANNUAL_RATE))


def _signal_from_score(score: float) -> SignalLabel:
    if score > 0.12:
        return "bullish"
    if score < -0.12:
        return "bearish"
    return "neutral"


def _build_chart_data_uri(history: pd.Series, ticker: str) -> str | None:
    if plt is None:
        return None

    x_values = np.arange(len(history), dtype=float)
    y_values = history.to_numpy(dtype=float)

    fig, ax = plt.subplots(figsize=(4.6, 1.8), dpi=160)
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")
    ax.plot(x_values, y_values, color="#0f766e", linewidth=2.2)
    ax.fill_between(x_values, y_values, float(y_values.min()), color="#0f766e", alpha=0.08)
    ax.set_title(f"{ticker} price path", fontsize=8, color="#475569")
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(left=False, bottom=False, labelleft=False, labelbottom=False)
    ax.margins(x=0)

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", bbox_inches="tight", pad_inches=0.08, transparent=True)
    plt.close(fig)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def build_quote_response(raw_ticker: str, include_chart: bool = False) -> QuoteResponse:
    ticker = validate_ticker(normalize_ticker(raw_ticker))
    profile = _price_profile(ticker)
    history = get_close_history(ticker, length=HISTORY_LENGTH)
    latest_features = build_latest_features(history, annual_rate=DEFAULT_ANNUAL_RATE)

    technicals = TechnicalSnapshot(**asdict(latest_features))
    bundle = load_model_bundle()
    model_prediction = predict_signal(bundle, latest_features)

    last_price = float(history.iloc[-1])
    previous_price = float(history.iloc[-2])
    short_ma = technicals.shortMovingAverage
    long_ma = technicals.longMovingAverage
    momentum = float(history.iloc[-1] / history.iloc[-8] - 1.0)
    volatility = float(history.pct_change().dropna().std())
    change_percent = round((last_price / previous_price - 1.0) * 100.0, 2)

    if model_prediction is not None:
        signal = model_prediction.signal
        confidence = model_prediction.confidence
        model_version = model_prediction.model_version
        explanation = (
            f"Trained model {model_version} predicts {signal}. "
            f"Short MA {short_ma:.2f} vs long MA {long_ma:.2f}, "
            f"7-day momentum {momentum * 100:.2f}%, volatility {volatility * 100:.2f}%."
        )
    else:
        score = _signal_score(short_ma, long_ma, momentum, volatility)
        signal = _signal_from_score(score)
        confidence = round(min(99.0, max(50.0, 55.0 + abs(score) * 45.0)), 1)
        model_version = MODEL_VERSION
        explanation = (
            f"{signal.title()} bias from trend and momentum. "
            f"Short MA {short_ma:.2f} vs long MA {long_ma:.2f}, "
            f"7-day momentum {momentum * 100:.2f}%, volatility {volatility * 100:.2f}%, "
            f"30-day discount factor {technicals.discountFactor:.4f}."
        )

    return QuoteResponse(
        ticker=ticker,
        companyName=profile.company_name,
        lastPrice=round(last_price, 2),
        changePercent=change_percent,
        signal=signal,
        confidence=confidence,
        explanation=explanation,
        modelVersion=model_version,
        history=[round(value, 2) for value in history.tolist()],
        technicals=technicals,
        chartDataUri=_build_chart_data_uri(history, ticker) if include_chart else None,
    )
