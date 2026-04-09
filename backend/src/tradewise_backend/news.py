from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from importlib import import_module
import os
from threading import Lock

from .market_data import normalize_ticker, validate_ticker
from .schemas import NewsSentiment

POSITIVE_KEYWORDS = {
    "beat",
    "beats",
    "bullish",
    "gain",
    "gains",
    "growth",
    "higher",
    "jump",
    "jumps",
    "launch",
    "optimism",
    "outperform",
    "partnership",
    "profit",
    "record",
    "rally",
    "rise",
    "rises",
    "strong",
    "surge",
    "upgrade",
}

NEGATIVE_KEYWORDS = {
    "bearish",
    "cut",
    "cuts",
    "decline",
    "declines",
    "delay",
    "downgrade",
    "drop",
    "drops",
    "fall",
    "falls",
    "investigation",
    "lawsuit",
    "lower",
    "miss",
    "misses",
    "pressure",
    "recall",
    "risk",
    "risks",
    "slowdown",
    "warning",
    "weaker",
}

TOPIC_KEYWORDS = {
    "earnings": ("earnings", "guidance", "forecast", "quarter", "revenue"),
    "ai": ("ai", "artificial intelligence", "chip", "gpu", "model"),
    "products": ("launch", "product", "iphone", "device", "platform"),
    "analysts": ("upgrade", "downgrade", "rating", "target"),
    "macro": ("inflation", "rates", "fed", "economy", "tariff"),
    "deals": ("partnership", "acquisition", "deal", "contract"),
}

DEFAULT_NEWS_REFRESH_SECONDS = 90
DEFAULT_MARKET_NEWS_REFRESH_SECONDS = 300
DEFAULT_MARKET_NEWS_SYMBOLS = ("SPY", "QQQ", "DIA")


@dataclass(frozen=True)
class NewsArticle:
    title: str
    publisher: str | None
    link: str | None
    published_at: datetime | None


@dataclass(frozen=True)
class NewsContext:
    summary: str
    sentiment: NewsSentiment
    topics: tuple[str, ...]
    headlines: tuple[str, ...]
    article_count: int


@dataclass(frozen=True)
class NewsContextSnapshot:
    context: NewsContext | None
    fetched_at: datetime
    from_cache: bool
    refresh_seconds: int


@dataclass(frozen=True)
class _CachedNewsContext:
    context: NewsContext | None
    fetched_at: datetime


@dataclass(frozen=True)
class MarketNewsSnapshot:
    articles: tuple[NewsArticle, ...]
    context: NewsContext | None
    fetched_at: datetime
    from_cache: bool
    refresh_seconds: int


_NEWS_CONTEXT_CACHE: dict[str, _CachedNewsContext] = {}
_NEWS_CONTEXT_CACHE_LOCK = Lock()
_NEWS_HISTORIC_CONTEXT_CACHE: dict[str, _CachedNewsContext] = {}
_NEWS_HISTORIC_CONTEXT_CACHE_LOCK = Lock()
_MARKET_NEWS_CACHE: dict[str, MarketNewsSnapshot] = {}
_MARKET_NEWS_CACHE_LOCK = Lock()
_YFINANCE = None
_YFINANCE_IMPORT_ATTEMPTED = False


def _get_yfinance():
    global _YFINANCE, _YFINANCE_IMPORT_ATTEMPTED
    if _YFINANCE_IMPORT_ATTEMPTED:
        return _YFINANCE

    _YFINANCE_IMPORT_ATTEMPTED = True
    try:
        _YFINANCE = import_module("yfinance")
    except ImportError:  # pragma: no cover - exercised only when yfinance is missing
        _YFINANCE = None
    return _YFINANCE


def _configured_news_refresh_seconds() -> int:
    raw_value = os.getenv("ML_NEWS_REFRESH_SECONDS", str(DEFAULT_NEWS_REFRESH_SECONDS)).strip()
    try:
        value = int(raw_value)
    except ValueError:
        return DEFAULT_NEWS_REFRESH_SECONDS
    return max(0, value)


def _configured_historic_news_cache_seconds() -> int:
    """Long TTL for as-of news: same (ticker, UTC day) reuses one upstream fetch."""
    raw_value = os.getenv("ML_NEWS_HISTORIC_CACHE_SECONDS", "3600").strip()
    try:
        value = int(raw_value)
    except ValueError:
        return 3600
    return max(0, value)


def _configured_market_news_refresh_seconds() -> int:
    raw_value = os.getenv(
        "ML_MARKET_NEWS_REFRESH_SECONDS",
        str(DEFAULT_MARKET_NEWS_REFRESH_SECONDS),
    ).strip()
    try:
        value = int(raw_value)
    except ValueError:
        return DEFAULT_MARKET_NEWS_REFRESH_SECONDS
    return max(0, value)


def _configured_market_news_symbols() -> tuple[str, ...]:
    raw_value = os.getenv(
        "ML_MARKET_NEWS_SYMBOLS",
        ",".join(DEFAULT_MARKET_NEWS_SYMBOLS),
    ).strip()
    symbols = [
        validate_ticker(normalize_ticker(value))
        for value in raw_value.split(",")
        if value.strip()
    ]
    deduped = tuple(dict.fromkeys(symbols))
    return deduped or DEFAULT_MARKET_NEWS_SYMBOLS


def _coerce_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=UTC)
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    return None


def _article_title(article: NewsArticle) -> str:
    return article.title.strip().rstrip(".")


def _extract_raw_content(item: dict[str, object]) -> dict[str, object]:
    content = item.get("content")
    if isinstance(content, dict):
        return content
    return item


def fetch_recent_news(ticker: str, limit: int = 8) -> list[NewsArticle]:
    yf = _get_yfinance()
    if yf is None:
        return []

    normalized_ticker = validate_ticker(normalize_ticker(ticker))

    try:
        raw_items = yf.Ticker(normalized_ticker).news or []
    except Exception:  # pragma: no cover - network/provider failure
        return []

    articles: list[NewsArticle] = []
    seen_titles: set[str] = set()

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        content = _extract_raw_content(item)
        title = str(content.get("title") or item.get("title") or "").strip()
        if not title or title in seen_titles:
            continue

        provider = content.get("provider")
        publisher = None
        if isinstance(provider, dict):
            publisher = str(provider.get("displayName") or "").strip() or None
        if publisher is None:
            publisher = str(item.get("publisher") or "").strip() or None

        click_through = content.get("clickThroughUrl")
        canonical = content.get("canonicalUrl")
        link = None
        if isinstance(click_through, dict):
            link = str(click_through.get("url") or "").strip() or None
        if link is None and isinstance(canonical, dict):
            link = str(canonical.get("url") or "").strip() or None
        if link is None:
            link = str(item.get("link") or "").strip() or None

        published_at = _coerce_datetime(
            content.get("pubDate")
            or content.get("displayTime")
            or item.get("providerPublishTime")
            or item.get("published")
        )

        seen_titles.add(title)
        articles.append(
            NewsArticle(
                title=title,
                publisher=publisher,
                link=link,
                published_at=published_at,
            )
        )

    articles.sort(
        key=lambda article: article.published_at or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return articles[:limit]


def fetch_market_news(
    *,
    limit: int = 8,
    symbols: tuple[str, ...] | None = None,
) -> list[NewsArticle]:
    selected_symbols = symbols or _configured_market_news_symbols()
    target_per_symbol = max(4, limit)
    articles: list[NewsArticle] = []
    seen_titles: set[str] = set()

    for symbol in selected_symbols:
        for article in fetch_recent_news(symbol, limit=target_per_symbol):
            normalized_title = article.title.strip().lower()
            if not normalized_title or normalized_title in seen_titles:
                continue
            seen_titles.add(normalized_title)
            articles.append(article)

    articles.sort(
        key=lambda article: article.published_at or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return articles[:limit]


def summarize_news(articles: list[NewsArticle], max_items: int = 3) -> str | None:
    titles = [_article_title(article) for article in articles[:max_items] if article.title.strip()]
    if not titles:
        return None
    return ". ".join(titles) + "."


def infer_news_sentiment(articles: list[NewsArticle]) -> NewsSentiment:
    combined = " ".join(article.title.lower() for article in articles)
    positive_hits = sum(1 for keyword in POSITIVE_KEYWORDS if keyword in combined)
    negative_hits = sum(1 for keyword in NEGATIVE_KEYWORDS if keyword in combined)

    if positive_hits > negative_hits:
        return "positive"
    if negative_hits > positive_hits:
        return "negative"
    return "neutral"


def extract_news_topics(articles: list[NewsArticle], max_topics: int = 3) -> tuple[str, ...]:
    combined = " ".join(article.title.lower() for article in articles)
    matches: list[str] = []
    for topic, keywords in TOPIC_KEYWORDS.items():
        if any(keyword in combined for keyword in keywords):
            matches.append(topic)
    return tuple(matches[:max_topics])


def build_news_context(
    ticker: str,
    limit: int = 6,
    refresh_seconds: int | None = None,
    force_refresh: bool = False,
) -> NewsContext | None:
    return build_news_context_snapshot(
        ticker,
        limit=limit,
        refresh_seconds=refresh_seconds,
        force_refresh=force_refresh,
    ).context


def build_news_context_snapshot(
    ticker: str,
    limit: int = 6,
    refresh_seconds: int | None = None,
    force_refresh: bool = False,
) -> NewsContextSnapshot:
    normalized_ticker = validate_ticker(normalize_ticker(ticker))
    resolved_refresh_seconds = _configured_news_refresh_seconds() if refresh_seconds is None else max(0, refresh_seconds)
    now = datetime.now(tz=UTC)

    with _NEWS_CONTEXT_CACHE_LOCK:
        cached = _NEWS_CONTEXT_CACHE.get(normalized_ticker)
        if (
            not force_refresh
            and cached is not None
            and resolved_refresh_seconds > 0
            and (now - cached.fetched_at).total_seconds() < resolved_refresh_seconds
        ):
            return NewsContextSnapshot(
                context=cached.context,
                fetched_at=cached.fetched_at,
                from_cache=True,
                refresh_seconds=resolved_refresh_seconds,
            )

    articles = fetch_recent_news(normalized_ticker, limit=limit)
    context = _build_news_context_from_articles(articles)
    fetched_at = datetime.now(tz=UTC)

    with _NEWS_CONTEXT_CACHE_LOCK:
        _NEWS_CONTEXT_CACHE[normalized_ticker] = _CachedNewsContext(
            context=context,
            fetched_at=fetched_at,
        )

    return NewsContextSnapshot(
        context=context,
        fetched_at=fetched_at,
        from_cache=False,
        refresh_seconds=resolved_refresh_seconds,
    )


def build_news_context_snapshot_for_as_of(
    ticker: str,
    as_of: str,
    *,
    force_refresh: bool = False,
) -> NewsContextSnapshot:
    """
    News context for a simulated/historic instant: filter provider articles to a window
    ending on as_of's UTC calendar date. Cached per (ticker, date) to limit API churn.
    """
    normalized_ticker = validate_ticker(normalize_ticker(ticker))
    parsed = _coerce_datetime(as_of)
    if parsed is None:
        raise ValueError("Invalid asOf datetime. Use ISO-8601 format.")
    as_of_date = parsed.astimezone(UTC).date()
    cache_key = f"{normalized_ticker}|{as_of_date.isoformat()}"
    cache_ttl = _configured_historic_news_cache_seconds()
    now = datetime.now(tz=UTC)

    with _NEWS_HISTORIC_CONTEXT_CACHE_LOCK:
        cached = _NEWS_HISTORIC_CONTEXT_CACHE.get(cache_key)
        if (
            not force_refresh
            and cached is not None
            and cache_ttl > 0
            and (now - cached.fetched_at).total_seconds() < cache_ttl
        ):
            return NewsContextSnapshot(
                context=cached.context,
                fetched_at=cached.fetched_at,
                from_cache=True,
                refresh_seconds=cache_ttl,
            )

    articles = fetch_recent_news(normalized_ticker, limit=50)
    context = build_news_context_for_date(
        normalized_ticker,
        as_of_date,
        articles=articles,
        lookback_days=7,
    )
    fetched_at = datetime.now(tz=UTC)

    with _NEWS_HISTORIC_CONTEXT_CACHE_LOCK:
        _NEWS_HISTORIC_CONTEXT_CACHE[cache_key] = _CachedNewsContext(
            context=context,
            fetched_at=fetched_at,
        )

    return NewsContextSnapshot(
        context=context,
        fetched_at=fetched_at,
        from_cache=False,
        refresh_seconds=cache_ttl,
    )


def build_news_context_for_date(
    ticker: str,
    as_of_date: date,
    articles: list[NewsArticle] | None = None,
    lookback_days: int = 3,
) -> NewsContext | None:
    candidate_articles = articles if articles is not None else fetch_recent_news(ticker, limit=25)
    window_start = as_of_date - timedelta(days=lookback_days)

    filtered = [
        article
        for article in candidate_articles
        if article.published_at is not None
        and window_start <= article.published_at.date() <= as_of_date
    ]
    return _build_news_context_from_articles(filtered)


def build_market_news_snapshot(
    *,
    limit: int = 8,
    refresh_seconds: int | None = None,
    force_refresh: bool = False,
) -> MarketNewsSnapshot:
    selected_symbols = _configured_market_news_symbols()
    cache_key = ",".join(selected_symbols)
    resolved_refresh_seconds = (
        _configured_market_news_refresh_seconds()
        if refresh_seconds is None
        else max(0, refresh_seconds)
    )
    now = datetime.now(tz=UTC)

    with _MARKET_NEWS_CACHE_LOCK:
        cached = _MARKET_NEWS_CACHE.get(cache_key)
        if (
            not force_refresh
            and cached is not None
            and resolved_refresh_seconds > 0
            and (now - cached.fetched_at).total_seconds() < resolved_refresh_seconds
        ):
            return MarketNewsSnapshot(
                articles=cached.articles[:limit],
                context=cached.context,
                fetched_at=cached.fetched_at,
                from_cache=True,
                refresh_seconds=resolved_refresh_seconds,
            )

    articles = tuple(fetch_market_news(limit=limit, symbols=selected_symbols))
    context = _build_news_context_from_articles(list(articles))
    fetched_at = datetime.now(tz=UTC)
    snapshot = MarketNewsSnapshot(
        articles=articles,
        context=context,
        fetched_at=fetched_at,
        from_cache=False,
        refresh_seconds=resolved_refresh_seconds,
    )

    with _MARKET_NEWS_CACHE_LOCK:
        _MARKET_NEWS_CACHE[cache_key] = snapshot

    return snapshot


def _build_news_context_from_articles(articles: list[NewsArticle]) -> NewsContext | None:
    summary = summarize_news(articles)
    if not summary:
        return None

    return NewsContext(
        summary=summary,
        sentiment=infer_news_sentiment(articles),
        topics=extract_news_topics(articles),
        headlines=tuple(_article_title(article) for article in articles[:3]),
        article_count=len(articles),
    )
