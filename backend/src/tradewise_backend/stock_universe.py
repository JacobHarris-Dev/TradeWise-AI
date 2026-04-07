from __future__ import annotations

import csv
import os
from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DEFAULT_RECOMMENDATION_COUNT = 3
MAX_RECOMMENDATION_COUNT = 5


@dataclass(frozen=True)
class StockUniverseRow:
    ticker: str
    company_name: str
    sector: str
    priority: int


# Fallback rows keep the feature usable even before a custom CSV is provided.
_FALLBACK_UNIVERSE: tuple[StockUniverseRow, ...] = (
    StockUniverseRow("AAPL", "Apple Inc.", "Technology", 10),
    StockUniverseRow("MSFT", "Microsoft Corp.", "Technology", 11),
    StockUniverseRow("NVDA", "NVIDIA Corp.", "Technology", 12),
    StockUniverseRow("JPM", "JPMorgan Chase & Co.", "Financial Services", 10),
    StockUniverseRow("V", "Visa Inc.", "Financial Services", 11),
    StockUniverseRow("XOM", "Exxon Mobil Corp.", "Energy", 10),
    StockUniverseRow("CVX", "Chevron Corp.", "Energy", 11),
    StockUniverseRow("JNJ", "Johnson & Johnson", "Healthcare", 10),
    StockUniverseRow("PFE", "Pfizer Inc.", "Healthcare", 11),
    StockUniverseRow("WMT", "Walmart Inc.", "Consumer Defensive", 10),
    StockUniverseRow("AMZN", "Amazon.com Inc.", "Consumer Cyclical", 10),
    StockUniverseRow("VOO", "Vanguard S&P 500 ETF", "ETF", 1),
    StockUniverseRow("SPY", "SPDR S&P 500 ETF Trust", "ETF", 2),
    StockUniverseRow("QQQ", "Invesco QQQ Trust", "ETF", 3),
)

_SECTOR_SYNONYMS = {
    "tech": "technology",
    "technology": "technology",
    "health": "healthcare",
    "health care": "healthcare",
    "healthcare": "healthcare",
    "finance": "financial services",
    "financial": "financial services",
    "financial services": "financial services",
    "energy": "energy",
    "consumer": "consumer defensive",
    "consumer defensive": "consumer defensive",
    "consumer cyclical": "consumer cyclical",
    "etf": "etf",
    "index": "etf",
}


def _normalize_sector_label(value: str) -> str:
    normalized = value.strip().lower()
    return _SECTOR_SYNONYMS.get(normalized, normalized)


def _default_universe_csv_path() -> Path:
    return Path(__file__).resolve().parents[2] / "artifacts" / "stock_universe.csv"


def _resolve_universe_csv_path() -> Path:
    configured = os.getenv("ML_STOCK_UNIVERSE_CSV", "").strip()
    return Path(configured) if configured else _default_universe_csv_path()


def _normalize_row(raw: dict[str, str]) -> StockUniverseRow | None:
    ticker = raw.get("ticker", "").strip().upper()
    company_name = raw.get("company_name", "").strip()
    sector = raw.get("sector", "").strip()
    if not ticker or not company_name or not sector:
        return None

    priority_raw = raw.get("priority", "").strip()
    try:
        priority = int(priority_raw) if priority_raw else 100
    except ValueError:
        priority = 100

    return StockUniverseRow(
        ticker=ticker,
        company_name=company_name,
        sector=sector,
        priority=priority,
    )


def _load_universe_rows(path: Path) -> tuple[StockUniverseRow, ...]:
    if not path.exists():
        return _FALLBACK_UNIVERSE

    rows: list[StockUniverseRow] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            parsed = _normalize_row(raw)
            if parsed is not None:
                rows.append(parsed)

    return tuple(rows) if rows else _FALLBACK_UNIVERSE


@lru_cache(maxsize=1)
def get_stock_universe() -> tuple[StockUniverseRow, ...]:
    return _load_universe_rows(_resolve_universe_csv_path())


def reset_stock_universe_cache() -> None:
    get_stock_universe.cache_clear()


def normalize_requested_sectors(raw_sectors: list[str]) -> list[str]:
    normalized: list[str] = []
    for value in raw_sectors:
        clean = _normalize_sector_label(value)
        if clean and clean not in normalized:
            normalized.append(clean)
    if not normalized:
        raise ValueError("Select at least one sector.")
    return normalized


def _select_diversified(rows: list[StockUniverseRow], count: int) -> list[StockUniverseRow]:
    buckets: dict[str, list[StockUniverseRow]] = defaultdict(list)
    for row in rows:
        buckets[_normalize_sector_label(row.sector)].append(row)

    for bucket_rows in buckets.values():
        bucket_rows.sort(key=lambda item: (item.priority, item.ticker))

    ordered_sectors = sorted(buckets.keys())
    selected: list[StockUniverseRow] = []
    seen_tickers: set[str] = set()

    while len(selected) < count:
        added_in_round = False
        for sector in ordered_sectors:
            bucket_rows = buckets[sector]
            while bucket_rows and bucket_rows[0].ticker in seen_tickers:
                bucket_rows.pop(0)
            if not bucket_rows:
                continue
            next_row = bucket_rows.pop(0)
            selected.append(next_row)
            seen_tickers.add(next_row.ticker)
            added_in_round = True
            if len(selected) >= count:
                break
        if not added_in_round:
            break

    return selected


def recommend_stocks_for_sectors(raw_sectors: list[str], count: int = DEFAULT_RECOMMENDATION_COUNT) -> list[StockUniverseRow]:
    if count < 1 or count > MAX_RECOMMENDATION_COUNT:
        raise ValueError(f"Count must be between 1 and {MAX_RECOMMENDATION_COUNT}.")

    sectors = normalize_requested_sectors(raw_sectors)
    rows = list(get_stock_universe())

    matching = [
        row
        for row in rows
        if _normalize_sector_label(row.sector) in sectors
    ]

    # If sector coverage is thin, top up with broad ETFs.
    if len(matching) < count:
        matching.extend(
            row
            for row in rows
            if _normalize_sector_label(row.sector) == "etf"
        )

    if len(matching) < count:
        matching.extend(rows)

    selected = _select_diversified(matching, count=count)
    if not selected:
        raise ValueError("No stock recommendations available for those sectors.")

    return selected
