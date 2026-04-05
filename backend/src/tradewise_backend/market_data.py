from __future__ import annotations

import re

import pandas as pd

try:
    import yfinance as yf
except ImportError:  # pragma: no cover - exercised only when yfinance is missing
    yf = None

TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,16}$")
DEFAULT_HISTORY_PERIOD = "1y"


def normalize_ticker(raw_ticker: str) -> str:
    return raw_ticker.strip().upper()


def validate_ticker(ticker: str) -> str:
    if not ticker:
        raise ValueError("Ticker is required.")
    if not TICKER_RE.fullmatch(ticker):
        raise ValueError("Invalid ticker. Use letters, numbers, dots, or hyphens up to 16 characters.")
    return ticker


def download_price_history(
    ticker: str,
    start: str | None = None,
    end: str | None = None,
    period: str = DEFAULT_HISTORY_PERIOD,
) -> pd.DataFrame:
    normalized = validate_ticker(normalize_ticker(ticker))
    if yf is None:
        raise RuntimeError("Install yfinance to download market data.")

    try:
        if start or end:
            history = yf.download(
                normalized,
                start=start,
                end=end,
                auto_adjust=True,
                progress=False,
                threads=False,
            )
        else:
            history = yf.download(
                normalized,
                period=period,
                auto_adjust=True,
                progress=False,
                threads=False,
            )
    except Exception as exc:  # pragma: no cover - network/provider failure
        raise RuntimeError(f"Failed to download price history for {normalized}: {exc}") from exc

    if history is None:
        raise RuntimeError(f"Failed to download price history for {normalized}.")

    if isinstance(history.columns, pd.MultiIndex):
        if "Close" in history.columns.get_level_values(0):
            history = history.copy()
            history.columns = history.columns.get_level_values(0)
        elif "Close" in history.columns.get_level_values(-1):
            history = history.copy()
            history.columns = history.columns.get_level_values(-1)

    if history.empty:
        raise ValueError(f"No price history returned for {normalized}.")
    if "Close" not in history.columns:
        raise ValueError(f"No close prices returned for {normalized}.")

    history = history.copy()
    history.index = pd.to_datetime(history.index)
    history.index.name = "Date"
    return history


def get_close_history(
    ticker: str,
    length: int = 60,
    start: str | None = None,
    end: str | None = None,
    period: str = DEFAULT_HISTORY_PERIOD,
) -> pd.Series:
    history = download_price_history(ticker, start=start, end=end, period=period)
    close = history["Close"]
    if isinstance(close, pd.DataFrame):
        # yfinance can occasionally return a DataFrame for one ticker (duplicate/extra
        # close columns depending on upstream formatting). Keep a deterministic first
        # close column so API responses stay stable.
        close = pd.Series(close.to_numpy(dtype="float64")[:, 0], index=close.index)

    close = pd.Series(close, dtype="float64").dropna()
    if len(close) < length:
        raise ValueError(
            f"Not enough historical rows for {normalize_ticker(ticker)}: "
            f"need at least {length}, got {len(close)}."
        )

    return close.tail(length).reset_index(drop=True)
