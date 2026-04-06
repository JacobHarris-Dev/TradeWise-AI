from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

try:
    import yfinance as yf
except ImportError:  # pragma: no cover - exercised only when yfinance is missing
    yf = None

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
) -> NewsContext | None:
    articles = fetch_recent_news(ticker, limit=limit)
    return _build_news_context_from_articles(articles)


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
