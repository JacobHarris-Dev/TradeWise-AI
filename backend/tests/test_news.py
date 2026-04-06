import unittest
from datetime import UTC, datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.news import (  # noqa: E402
    NewsArticle,
    build_news_context_for_date,
    extract_news_topics,
    infer_news_sentiment,
    summarize_news,
)


def sample_articles() -> list[NewsArticle]:
    return [
        NewsArticle(
            title="Apple rises after strong AI product launch",
            publisher="Reuters",
            link="https://example.com/1",
            published_at=datetime(2026, 4, 5, 15, 0, tzinfo=UTC),
        ),
        NewsArticle(
            title="Analysts upgrade Apple on iPhone demand",
            publisher="Bloomberg",
            link="https://example.com/2",
            published_at=datetime(2026, 4, 4, 13, 0, tzinfo=UTC),
        ),
    ]


class NewsHelpersTestCase(unittest.TestCase):
    def test_summarize_news(self) -> None:
        summary = summarize_news(sample_articles())
        self.assertIsNotNone(summary)
        self.assertIn("Apple rises after strong AI product launch", summary)

    def test_sentiment_and_topics(self) -> None:
        articles = sample_articles()
        self.assertEqual(infer_news_sentiment(articles), "positive")
        self.assertIn("ai", extract_news_topics(articles))
        self.assertIn("analysts", extract_news_topics(articles))

    def test_build_news_context_for_date_filters_window(self) -> None:
        context = build_news_context_for_date(
            "AAPL",
            datetime(2026, 4, 5, tzinfo=UTC).date(),
            articles=sample_articles(),
            lookback_days=1,
        )
        self.assertIsNotNone(context)
        self.assertEqual(context.sentiment, "positive")
        self.assertGreaterEqual(context.article_count, 1)


if __name__ == "__main__":
    unittest.main()
