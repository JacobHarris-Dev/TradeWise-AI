from __future__ import annotations

import os
import re
from datetime import UTC, datetime, timedelta
from dataclasses import dataclass
from threading import Lock
from time import monotonic

import pandas as pd

try:
    import yfinance as yf
except ImportError:  # pragma: no cover - exercised only when yfinance is missing
    yf = None

try:
    from alpaca.data.enums import DataFeed
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
except ImportError:  # pragma: no cover - exercised only when alpaca-py is missing
    DataFeed = None
    StockBarsRequest = None
    StockHistoricalDataClient = None
    TimeFrame = None
    TimeFrameUnit = None

TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,16}$")
DEFAULT_HISTORY_PERIOD = "1y"
DEFAULT_MARKET_DATA_PROVIDER = os.getenv("ML_MARKET_DATA_PROVIDER", "yfinance").strip().lower() or "yfinance"
DEFAULT_MARKET_DATA_INTERVAL = os.getenv("ML_MARKET_DATA_INTERVAL", "1d").strip() or "1d"
DEFAULT_ALPACA_FEED = os.getenv("ML_MARKET_DATA_ALPACA_FEED", "delayed_sip").strip().lower() or "delayed_sip"
ALLOWED_MARKET_DATA_PROVIDERS = {"yfinance", "alpaca"}
YFINANCE_INTRADAY_LOOKBACK_DAYS = 60
ALPACA_DELAY_MINUTES = 15
DEFAULT_MARKET_DATA_CACHE_SECONDS = 20
DEFAULT_MARKET_DATA_CACHE_MAX_ENTRIES = 128
TICKER_ALIASES = {
    "APPL": "AAPL",
}


@dataclass(frozen=True)
class _CachedPriceHistory:
    history: pd.DataFrame
    cached_at: float


_PRICE_HISTORY_CACHE: dict[str, _CachedPriceHistory] = {}
_PRICE_HISTORY_CACHE_LOCK = Lock()


def normalize_ticker(raw_ticker: str) -> str:
    normalized = raw_ticker.strip().upper()
    return TICKER_ALIASES.get(normalized, normalized)


def validate_ticker(ticker: str) -> str:
    if not ticker:
        raise ValueError("Ticker is required.")
    if not TICKER_RE.fullmatch(ticker):
        raise ValueError("Invalid ticker. Use letters, numbers, dots, or hyphens up to 16 characters.")
    return ticker


def normalize_market_data_provider(provider: str | None) -> str:
    selected = (provider or DEFAULT_MARKET_DATA_PROVIDER).strip().lower()
    if selected not in ALLOWED_MARKET_DATA_PROVIDERS:
        raise ValueError("Invalid market data provider. Use yfinance or alpaca.")
    return selected


def _market_data_cache_seconds() -> int:
    raw_value = os.getenv(
        "ML_MARKET_DATA_CACHE_SECONDS",
        str(DEFAULT_MARKET_DATA_CACHE_SECONDS),
    ).strip()
    try:
        value = int(raw_value)
    except ValueError:
        return DEFAULT_MARKET_DATA_CACHE_SECONDS
    return max(0, value)


def _market_data_cache_max_entries() -> int:
    raw_value = os.getenv(
        "ML_MARKET_DATA_CACHE_MAX_ENTRIES",
        str(DEFAULT_MARKET_DATA_CACHE_MAX_ENTRIES),
    ).strip()
    try:
        value = int(raw_value)
    except ValueError:
        return DEFAULT_MARKET_DATA_CACHE_MAX_ENTRIES
    return max(1, value)


def _price_history_cache_key(
    *,
    ticker: str,
    start: str | None,
    end: str | None,
    period: str,
    interval: str,
    provider: str,
    alpaca_feed: str,
) -> str:
    return "|".join(
        [
            ticker,
            start or "",
            end or "",
            period,
            interval,
            provider,
            alpaca_feed,
        ]
    )


def _clone_history(history: pd.DataFrame) -> pd.DataFrame:
    return history.copy(deep=True)


def _cached_price_history(key: str, ttl_seconds: int) -> pd.DataFrame | None:
    if ttl_seconds <= 0:
        return None

    now = monotonic()
    with _PRICE_HISTORY_CACHE_LOCK:
        cached = _PRICE_HISTORY_CACHE.get(key)
        if cached is None:
            return None
        if (now - cached.cached_at) > ttl_seconds:
            del _PRICE_HISTORY_CACHE[key]
            return None
        return _clone_history(cached.history)


def _store_cached_price_history(key: str, history: pd.DataFrame, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return

    now = monotonic()
    max_entries = _market_data_cache_max_entries()
    with _PRICE_HISTORY_CACHE_LOCK:
        _PRICE_HISTORY_CACHE[key] = _CachedPriceHistory(
            history=_clone_history(history),
            cached_at=now,
        )

        expired_keys = [
            cache_key
            for cache_key, cached in _PRICE_HISTORY_CACHE.items()
            if (now - cached.cached_at) > ttl_seconds
        ]
        for expired_key in expired_keys:
            _PRICE_HISTORY_CACHE.pop(expired_key, None)

        while len(_PRICE_HISTORY_CACHE) > max_entries:
            oldest_key = min(
                _PRICE_HISTORY_CACHE,
                key=lambda cache_key: _PRICE_HISTORY_CACHE[cache_key].cached_at,
            )
            _PRICE_HISTORY_CACHE.pop(oldest_key, None)


def _is_intraday_interval(interval: str) -> bool:
    normalized = interval.strip().lower()
    return normalized.endswith(("m", "h")) and not normalized.endswith("mo")


def _normalize_history_frame(history: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if history is None:
        raise RuntimeError(f"Failed to download price history for {ticker}.")

    if isinstance(history.columns, pd.MultiIndex):
        if "Close" in history.columns.get_level_values(0):
            history = history.copy()
            history.columns = history.columns.get_level_values(0)
        elif "Close" in history.columns.get_level_values(-1):
            history = history.copy()
            history.columns = history.columns.get_level_values(-1)

    if history.empty:
        raise ValueError(f"No price history returned for {ticker}.")
    if "Close" not in history.columns:
        raise ValueError(f"No close prices returned for {ticker}.")

    history = history.copy()
    history.index = pd.to_datetime(history.index)
    history.index.name = "Date"
    return history


def _download_yfinance_price_history(
    ticker: str,
    start: str | None = None,
    end: str | None = None,
    period: str = DEFAULT_HISTORY_PERIOD,
    interval: str = DEFAULT_MARKET_DATA_INTERVAL,
) -> pd.DataFrame:
    if yf is None:
        raise RuntimeError("Install yfinance to download market data.")

    try:
        if _is_intraday_interval(interval):
            parsed_start = _parse_datetime(start)
            parsed_end = _parse_datetime(end) or datetime.now(UTC)
            if parsed_start is not None:
                if (parsed_end - parsed_start) > timedelta(days=YFINANCE_INTRADAY_LOOKBACK_DAYS):
                    raise ValueError(
                        "yfinance intraday intervals are limited to the last 60 days. "
                        "Use a shorter date range or switch to Alpaca for delayed intraday bars."
                    )
                history = yf.download(
                    ticker,
                    start=parsed_start,
                    end=parsed_end,
                    interval=interval,
                    auto_adjust=True,
                    progress=False,
                    threads=False,
                )
            else:
                history = yf.download(
                    ticker,
                    start=parsed_end - timedelta(days=YFINANCE_INTRADAY_LOOKBACK_DAYS - 1),
                    end=parsed_end,
                    interval=interval,
                    auto_adjust=True,
                    progress=False,
                    threads=False,
                )
        elif start or end:
            history = yf.download(
                ticker,
                start=start,
                end=end,
                interval=interval,
                auto_adjust=True,
                progress=False,
                threads=False,
            )
        else:
            history = yf.download(
                ticker,
                period=period,
                interval=interval,
                auto_adjust=True,
                progress=False,
                threads=False,
            )
    except ValueError:
        raise
    except Exception as exc:  # pragma: no cover - network/provider failure
        raise RuntimeError(f"Failed to download price history for {ticker}: {exc}") from exc

    return _normalize_history_frame(history, ticker)


def _parse_period_to_start(period: str) -> datetime:
    now = datetime.now(UTC)
    normalized = period.strip().lower()
    mapping = {
        "1d": timedelta(days=1),
        "5d": timedelta(days=5),
        "1mo": timedelta(days=30),
        "3mo": timedelta(days=90),
        "6mo": timedelta(days=180),
        "1y": timedelta(days=365),
        "2y": timedelta(days=730),
        "5y": timedelta(days=365 * 5),
        "10y": timedelta(days=365 * 10),
        "ytd": timedelta(days=max(1, (now.date() - datetime(now.year, 1, 1, tzinfo=UTC).date()).days)),
        "max": timedelta(days=365 * 10),
    }
    return now - mapping.get(normalized, timedelta(days=365))


def _parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    parsed = pd.Timestamp(value)
    if parsed.tzinfo is None:
        parsed = parsed.tz_localize(UTC)
    else:
        parsed = parsed.tz_convert(UTC)
    return parsed.to_pydatetime()


def _parse_alpaca_timeframe(interval: str) -> TimeFrame:
    normalized = interval.strip().lower()
    if normalized.endswith("m"):
        amount = int(normalized[:-1])
        return TimeFrame(amount, TimeFrameUnit.Minute)
    if normalized.endswith("h"):
        amount = int(normalized[:-1])
        return TimeFrame(amount, TimeFrameUnit.Hour)
    if normalized == "1d":
        return TimeFrame.Day
    if normalized == "1wk":
        return TimeFrame.Week
    if normalized == "1mo":
        return TimeFrame.Month
    raise ValueError("Invalid Alpaca interval. Use values like 15m, 1h, or 1d.")


def _parse_alpaca_feed(feed: str):
    if DataFeed is None:
        raise RuntimeError("Install alpaca-py to use Alpaca market data.")

    normalized = feed.strip().lower()
    mapping = {
        "iex": DataFeed.IEX,
        "sip": DataFeed.SIP,
        # Historical stock bars use SIP with an end timestamp at least 15 minutes old.
        "delayed_sip": DataFeed.SIP,
    }
    if normalized not in mapping:
        raise ValueError("Invalid Alpaca feed. Use iex, sip, or delayed_sip.")
    return mapping[normalized]


def _resolve_alpaca_end(feed: str, end: str | None) -> datetime:
    parsed_end = _parse_datetime(end) or datetime.now(UTC)
    if feed.strip().lower() != "delayed_sip":
        return parsed_end

    delayed_cutoff = datetime.now(UTC) - timedelta(minutes=ALPACA_DELAY_MINUTES)
    return min(parsed_end, delayed_cutoff)


def _alpaca_client() -> StockHistoricalDataClient:
    if StockHistoricalDataClient is None:
        raise RuntimeError("Install alpaca-py to download Alpaca market data.")

    key_id = os.getenv("ML_MARKET_DATA_ALPACA_KEY_ID") or os.getenv("APCA_API_KEY_ID")
    secret_key = os.getenv("ML_MARKET_DATA_ALPACA_SECRET_KEY") or os.getenv("APCA_API_SECRET_KEY")
    if not key_id or not secret_key:
        raise RuntimeError(
            "Set ML_MARKET_DATA_ALPACA_KEY_ID and ML_MARKET_DATA_ALPACA_SECRET_KEY "
            "(or APCA_API_KEY_ID / APCA_API_SECRET_KEY) to use Alpaca market data."
        )

    return StockHistoricalDataClient(key_id, secret_key)


def _download_alpaca_price_history(
    ticker: str,
    start: str | None = None,
    end: str | None = None,
    period: str = DEFAULT_HISTORY_PERIOD,
    interval: str = DEFAULT_MARKET_DATA_INTERVAL,
    feed: str = DEFAULT_ALPACA_FEED,
) -> pd.DataFrame:
    resolved_end = _resolve_alpaca_end(feed, end)
    request = StockBarsRequest(
        symbol_or_symbols=ticker,
        timeframe=_parse_alpaca_timeframe(interval),
        start=_parse_datetime(start) or _parse_period_to_start(period),
        end=resolved_end,
        feed=_parse_alpaca_feed(feed),
    )

    try:
        history = _alpaca_client().get_stock_bars(request).df
    except Exception as exc:  # pragma: no cover - network/provider failure
        raise RuntimeError(f"Failed to download Alpaca price history for {ticker}: {exc}") from exc

    if isinstance(history.index, pd.MultiIndex) and "symbol" in history.index.names:
        history = history.reset_index(level="symbol", drop=True)

    history = history.rename(
        columns={
            "open": "Open",
            "high": "High",
            "low": "Low",
            "close": "Close",
            "volume": "Volume",
        }
    )
    return _normalize_history_frame(history, ticker)


def download_price_history(
    ticker: str,
    start: str | None = None,
    end: str | None = None,
    period: str = DEFAULT_HISTORY_PERIOD,
    interval: str = DEFAULT_MARKET_DATA_INTERVAL,
    provider: str | None = None,
    alpaca_feed: str = DEFAULT_ALPACA_FEED,
) -> pd.DataFrame:
    normalized = validate_ticker(normalize_ticker(ticker))
    selected_provider = normalize_market_data_provider(provider)
    cache_ttl = _market_data_cache_seconds()
    cache_key = _price_history_cache_key(
        ticker=normalized,
        start=start,
        end=end,
        period=period,
        interval=interval,
        provider=selected_provider,
        alpaca_feed=alpaca_feed,
    )
    cached = _cached_price_history(cache_key, cache_ttl)
    if cached is not None:
        return cached

    if selected_provider == "alpaca":
        history = _download_alpaca_price_history(
            normalized,
            start=start,
            end=end,
            period=period,
            interval=interval,
            feed=alpaca_feed,
        )
    else:
        history = _download_yfinance_price_history(
            normalized,
            start=start,
            end=end,
            period=period,
            interval=interval,
        )

    _store_cached_price_history(cache_key, history, cache_ttl)
    return _clone_history(history)


def get_close_history(
    ticker: str,
    length: int = 60,
    start: str | None = None,
    end: str | None = None,
    period: str = DEFAULT_HISTORY_PERIOD,
    interval: str = DEFAULT_MARKET_DATA_INTERVAL,
    provider: str | None = None,
    alpaca_feed: str = DEFAULT_ALPACA_FEED,
) -> pd.Series:
    history = download_price_history(
        ticker,
        start=start,
        end=end,
        period=period,
        interval=interval,
        provider=provider,
        alpaca_feed=alpaca_feed,
    )
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


def get_ohlc_history(
    ticker: str,
    length: int = 60,
    start: str | None = None,
    end: str | None = None,
    period: str = DEFAULT_HISTORY_PERIOD,
    interval: str = DEFAULT_MARKET_DATA_INTERVAL,
    provider: str | None = None,
    alpaca_feed: str = DEFAULT_ALPACA_FEED,
) -> pd.DataFrame:
    history = download_price_history(
        ticker,
        start=start,
        end=end,
        period=period,
        interval=interval,
        provider=provider,
        alpaca_feed=alpaca_feed,
    )
    required_columns = ["Open", "High", "Low", "Close"]
    missing_columns = [column for column in required_columns if column not in history.columns]
    if missing_columns:
        raise ValueError(
            f"Missing OHLC columns for {normalize_ticker(ticker)}: {', '.join(missing_columns)}."
        )

    ohlc = history[required_columns].apply(pd.to_numeric, errors="coerce").dropna()
    if len(ohlc) < length:
        raise ValueError(
            f"Not enough OHLC rows for {normalize_ticker(ticker)}: "
            f"need at least {length}, got {len(ohlc)}."
        )

    return ohlc.tail(length).reset_index(drop=True)
