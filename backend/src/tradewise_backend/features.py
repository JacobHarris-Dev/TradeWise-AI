from __future__ import annotations

import math
import os
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from .schemas import SignalLabel

try:
    import QuantLib as ql
except ImportError:  # pragma: no cover - exercised only when QuantLib is missing
    ql = None

DEFAULT_ANNUAL_RATE = float(os.getenv("ML_DEFAULT_ANNUAL_RATE", "0.045"))
HISTORY_LENGTH = 60
SHORT_WINDOW = 5
LONG_WINDOW = 20
MOMENTUM_WINDOW = 7
DISCOUNT_DAYS = 30

FEATURE_COLUMNS = (
    "shortMovingAverage",
    "longMovingAverage",
    "volatility",
    "momentum",
    "discountFactor",
)

LABEL_MAP: dict[int, SignalLabel] = {
    -1: "bearish",
    0: "neutral",
    1: "bullish",
}


@dataclass(frozen=True)
class FeatureSnapshot:
    shortMovingAverage: float
    longMovingAverage: float
    volatility: float
    momentum: float
    discountFactor: float


def discount_factor(days: int, annual_rate: float = DEFAULT_ANNUAL_RATE) -> float:
    if ql is None:
        return math.exp(-annual_rate * days / 365.0)

    today = ql.Date.todaysDate()
    future = today + days
    day_count = ql.Actual365Fixed()
    year_fraction = day_count.yearFraction(today, future)
    return math.exp(-annual_rate * year_fraction)


def build_feature_frame(
    close_prices: pd.Series,
    annual_rate: float = DEFAULT_ANNUAL_RATE,
) -> pd.DataFrame:
    closes = pd.Series(close_prices, dtype="float64").reset_index(drop=True)
    frame = pd.DataFrame(index=closes.index)
    frame["shortMovingAverage"] = closes.rolling(SHORT_WINDOW).mean()
    frame["longMovingAverage"] = closes.rolling(LONG_WINDOW).mean()
    frame["volatility"] = closes.pct_change().rolling(LONG_WINDOW).std()
    frame["momentum"] = closes / closes.shift(MOMENTUM_WINDOW) - 1.0
    frame["discountFactor"] = discount_factor(DISCOUNT_DAYS, annual_rate)
    return frame


def build_latest_features(
    close_prices: pd.Series,
    annual_rate: float = DEFAULT_ANNUAL_RATE,
) -> FeatureSnapshot:
    frame = build_feature_frame(close_prices, annual_rate).dropna()
    if frame.empty:
        raise ValueError("Not enough history to build features.")

    row = frame.iloc[-1]
    return FeatureSnapshot(
        shortMovingAverage=float(row["shortMovingAverage"]),
        longMovingAverage=float(row["longMovingAverage"]),
        volatility=float(row["volatility"]),
        momentum=float(row["momentum"]),
        discountFactor=float(row["discountFactor"]),
    )


def build_training_frame(
    close_prices: pd.Series,
    horizon_days: int = 5,
    neutral_band: float = 0.01,
    annual_rate: float = DEFAULT_ANNUAL_RATE,
) -> pd.DataFrame:
    closes = pd.Series(close_prices, dtype="float64").reset_index(drop=True)
    frame = build_feature_frame(closes, annual_rate)
    future_return = closes.shift(-horizon_days) / closes - 1.0
    frame["target"] = np.select(
        [future_return > neutral_band, future_return < -neutral_band],
        [1, -1],
        default=0,
    )
    frame = frame.dropna().reset_index(drop=True)
    frame["target"] = frame["target"].astype(int)
    return frame


def feature_snapshot_to_dict(snapshot: FeatureSnapshot) -> dict[str, float]:
    return asdict(snapshot)

