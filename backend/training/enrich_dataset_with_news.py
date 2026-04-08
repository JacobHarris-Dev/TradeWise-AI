"""Enrich an existing TradeWise dataset with recent yfinance news context.

This is a starter enrichment pass for experimentation. Because yfinance news is
not a full historical archive, older rows will often remain blank.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"
for candidate in (ROOT_DIR, SRC_DIR):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from tradewise_backend.news import build_news_context_for_date, fetch_recent_news

SENTIMENT_SCORE = {
    "positive": 1,
    "neutral": 0,
    "negative": -1,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Add recent news summaries and sentiment columns to a dataset CSV.",
    )
    parser.add_argument(
        "--input-csv",
        default="tradewise_training_dataset.csv",
        help="Existing dataset CSV with at least ticker and date columns.",
    )
    parser.add_argument(
        "--output-csv",
        default="tradewise_training_dataset_with_news.csv",
        help="Path to write the enriched CSV.",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=3,
        help="How many days of headlines to consider for each row date.",
    )
    parser.add_argument(
        "--article-limit",
        type=int,
        default=25,
        help="Maximum recent articles fetched per ticker.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input_csv).resolve()
    output_path = Path(args.output_csv).resolve()

    dataset = pd.read_csv(input_path)
    required_columns = {"ticker", "date"}
    missing_columns = sorted(required_columns - set(dataset.columns))
    if missing_columns:
        raise ValueError(
            "Dataset CSV is missing required columns: " + ", ".join(missing_columns)
        )

    dataset = dataset.copy()
    dataset["date"] = pd.to_datetime(dataset["date"], errors="coerce")
    if dataset["date"].isna().any():
        raise ValueError("Every row in the dataset must have a valid date value.")

    ticker_news_cache: dict[str, list] = {}
    for ticker in sorted(dataset["ticker"].astype(str).str.upper().unique()):
        print(f"Fetching news for {ticker}...")
        ticker_news_cache[ticker] = fetch_recent_news(ticker, limit=args.article_limit)

    summaries: list[str | None] = []
    sentiments: list[str | None] = []
    sentiment_scores: list[int] = []
    topics: list[str | None] = []
    headline_counts: list[int] = []

    for row in dataset.itertuples(index=False):
        ticker = str(row.ticker).upper()
        raw_row_date = row.date
        if isinstance(raw_row_date, pd.Timestamp):
            row_date = raw_row_date.date()
        else:
            row_date = pd.Timestamp(str(raw_row_date)).date()
        context = build_news_context_for_date(
            ticker,
            row_date,
            articles=ticker_news_cache.get(ticker, []),
            lookback_days=args.lookback_days,
        )
        if context is None:
            summaries.append(None)
            sentiments.append(None)
            sentiment_scores.append(0)
            topics.append(None)
            headline_counts.append(0)
            continue

        summaries.append(context.summary)
        sentiments.append(context.sentiment)
        sentiment_scores.append(SENTIMENT_SCORE.get(context.sentiment, 0))
        topics.append(", ".join(context.topics) if context.topics else None)
        headline_counts.append(context.article_count)

    dataset["date"] = dataset["date"].dt.strftime("%Y-%m-%d")
    dataset["news_summary"] = summaries
    dataset["news_sentiment"] = sentiments
    dataset["news_sentiment_score"] = sentiment_scores
    dataset["news_topics"] = topics
    dataset["news_headline_count"] = headline_counts

    dataset.to_csv(output_path, index=False)

    covered_rows = int(dataset["news_summary"].notna().sum())
    print(f"Saved enriched dataset to: {output_path}")
    print(f"Rows with attached news context: {covered_rows}/{len(dataset)}")
    if covered_rows == 0:
        print(
            "No dataset rows matched recent yfinance headlines. This is expected for older "
            "historical CSVs because yfinance news is useful for current-context MVP work, "
            "not full historical backfills."
        )


if __name__ == "__main__":
    main()
