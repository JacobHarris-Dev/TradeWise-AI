"""Thin market-data helper for training scripts."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"
for candidate in (ROOT_DIR, SRC_DIR):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from tradewise_backend.market_data import download_price_history

DEFAULT_TICKERS = ("AAPL", "MSFT", "GOOGL", "NVDA", "SPY", "QQQ")


def load_price_history(
    ticker: str,
    start: str | None = None,
    end: str | None = None,
    period: str = "1y",
    interval: str = "1d",
    provider: str = "yfinance",
    alpaca_feed: str = "delayed_sip",
):
    return download_price_history(
        ticker,
        start=start,
        end=end,
        period=period,
        interval=interval,
        provider=provider,
        alpaca_feed=alpaca_feed,
    )
