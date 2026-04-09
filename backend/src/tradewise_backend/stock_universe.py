from __future__ import annotations

import csv
import os
import random
import re
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
    industry: str
    priority: int
    is_student_friendly: bool
    aliases: tuple[str, ...] = ()
    search_terms: tuple[str, ...] = ()
    theme_tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class StockUniverseMatch:
    row: StockUniverseRow
    match_type: str
    matched_term: str
    score: int


# Fallback rows keep the feature usable even before a custom CSV is provided.
_FALLBACK_UNIVERSE: tuple[StockUniverseRow, ...] = (
    StockUniverseRow("AAPL", "Apple Inc.", "Technology", "Consumer Electronics", 10, True),
    StockUniverseRow("MSFT", "Microsoft Corp.", "Technology", "Software Infrastructure", 11, True),
    StockUniverseRow("NVDA", "NVIDIA Corp.", "Technology", "Semiconductors", 12, True),
    StockUniverseRow("JPM", "JPMorgan Chase & Co.", "Financial Services", "Banks Diversified", 10, True),
    StockUniverseRow("V", "Visa Inc.", "Financial Services", "Credit Services", 11, True),
    StockUniverseRow("XOM", "Exxon Mobil Corp.", "Energy", "Oil & Gas Integrated", 10, True),
    StockUniverseRow("CVX", "Chevron Corp.", "Energy", "Oil & Gas Integrated", 11, True),
    StockUniverseRow("JNJ", "Johnson & Johnson", "Healthcare", "Drug Manufacturers General", 10, True),
    StockUniverseRow("PFE", "Pfizer Inc.", "Healthcare", "Drug Manufacturers General", 11, True),
    StockUniverseRow("WMT", "Walmart Inc.", "Consumer Defensive", "Discount Stores", 10, True),
    StockUniverseRow("AMZN", "Amazon.com Inc.", "Consumer Cyclical", "Internet Retail", 10, True),
    StockUniverseRow("VOO", "Vanguard S&P 500 ETF", "ETF", "Broad Market ETF", 1, True),
    StockUniverseRow("SPY", "SPDR S&P 500 ETF Trust", "ETF", "Broad Market ETF", 2, True),
    StockUniverseRow("QQQ", "Invesco QQQ Trust", "ETF", "Large Growth ETF", 3, True),
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

_COMPANY_STOPWORDS = {
    "and",
    "class",
    "co",
    "company",
    "corp",
    "corporation",
    "etf",
    "fund",
    "group",
    "holdings",
    "inc",
    "incorporated",
    "limited",
    "lp",
    "ltd",
    "plc",
    "shares",
    "technologies",
    "technology",
    "trust",
}

_LOOKUP_SPLIT_RE = re.compile(r"[|;,]")
_LOOKUP_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")


def _normalize_sector_label(value: str) -> str:
    normalized = value.strip().lower()
    return _SECTOR_SYNONYMS.get(normalized, normalized)


def _default_universe_csv_path() -> Path:
    return Path(__file__).resolve().parents[2] / "artifacts" / "stock_universe.csv"


def _resolve_universe_csv_path() -> Path:
    configured = os.getenv("ML_STOCK_UNIVERSE_CSV", "").strip()
    return Path(configured) if configured else _default_universe_csv_path()


def _coerce_csv_value(raw: dict[str, str | None], key: str) -> str:
    return (raw.get(key) or "").strip()


def _split_lookup_terms(value: str) -> tuple[str, ...]:
    if not value:
        return ()
    deduped: list[str] = []
    for term in _LOOKUP_SPLIT_RE.split(value):
        normalized = term.strip()
        if normalized and normalized not in deduped:
            deduped.append(normalized)
    return tuple(deduped)


def _normalize_lookup_text(value: str) -> str:
    return " ".join(_LOOKUP_NORMALIZE_RE.sub(" ", value.lower()).split())


def _derive_company_terms(company_name: str) -> tuple[str, ...]:
    normalized = _normalize_lookup_text(company_name)
    if not normalized:
        return ()

    tokens = [
        token
        for token in normalized.split()
        if token not in _COMPANY_STOPWORDS and (len(token) > 2 or token.isdigit())
    ]
    if not tokens:
        return ()

    terms = [token for token in tokens if len(token) > 2]
    joined = " ".join(tokens)
    if joined and joined not in terms and joined != normalized:
        terms.insert(0, joined)
    return tuple(dict.fromkeys(terms))


def _normalize_row(raw: dict[str, str | None]) -> StockUniverseRow | None:
    ticker = _coerce_csv_value(raw, "ticker").upper()
    company_name = _coerce_csv_value(raw, "company_name")
    sector = _coerce_csv_value(raw, "sector")
    industry = _coerce_csv_value(raw, "industry") or sector
    if not ticker or not company_name or not sector:
        return None

    priority_raw = _coerce_csv_value(raw, "priority")
    try:
        priority = int(priority_raw) if priority_raw else 100
    except ValueError:
        priority = 100

    student_friendly_raw = _coerce_csv_value(raw, "is_student_friendly").lower()
    is_student_friendly = student_friendly_raw not in {"false", "0", "no"}
    aliases = _split_lookup_terms(_coerce_csv_value(raw, "aliases"))
    search_terms = _split_lookup_terms(_coerce_csv_value(raw, "search_terms"))
    theme_tags = _split_lookup_terms(_coerce_csv_value(raw, "theme_tags"))

    return StockUniverseRow(
        ticker=ticker,
        company_name=company_name,
        sector=sector,
        industry=industry,
        priority=priority,
        is_student_friendly=is_student_friendly,
        aliases=aliases,
        search_terms=search_terms,
        theme_tags=theme_tags,
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


def list_stock_universe_tickers(
    *,
    student_friendly_only: bool = False,
) -> tuple[str, ...]:
    rows = [
        row
        for row in get_stock_universe()
        if not student_friendly_only or row.is_student_friendly
    ]
    ordered = sorted(
        rows,
        key=lambda item: (
            0 if item.is_student_friendly else 1,
            item.priority,
            _normalize_sector_label(item.sector),
            item.industry,
            item.ticker,
        ),
    )
    return tuple(dict.fromkeys(row.ticker for row in ordered))


def get_stock_universe_row(ticker: str) -> StockUniverseRow | None:
    normalized = ticker.strip().upper()
    if not normalized:
        return None

    for row in get_stock_universe():
        if row.ticker == normalized:
            return row
    return None


def _row_sort_key(item: StockUniverseRow) -> tuple[int, int, str, str]:
    return (0 if item.is_student_friendly else 1, item.priority, item.industry, item.ticker)


def _lookup_terms(row: StockUniverseRow) -> tuple[tuple[str, str, int], ...]:
    derived_terms = _derive_company_terms(row.company_name)
    normalized_company = _normalize_lookup_text(row.company_name)
    terms: list[tuple[str, str, int]] = []
    if normalized_company:
        terms.append((normalized_company, "company", 90))
    for alias in row.aliases:
        normalized = _normalize_lookup_text(alias)
        if normalized:
            terms.append((normalized, "alias", 110))
    for term in row.search_terms:
        normalized = _normalize_lookup_text(term)
        if normalized:
            terms.append((normalized, "search-term", 100))
    for tag in row.theme_tags:
        normalized = _normalize_lookup_text(tag)
        if normalized:
            terms.append((normalized, "theme-tag", 88))
    for term in derived_terms:
        normalized = _normalize_lookup_text(term)
        if normalized:
            terms.append((normalized, "company-fragment", 78))
    deduped: list[tuple[str, str, int]] = []
    seen: set[tuple[str, str]] = set()
    for term, match_type, base_score in terms:
        key = (term, match_type)
        if key in seen:
            continue
        seen.add(key)
        deduped.append((term, match_type, base_score))
    return tuple(deduped)


def _match_term_score(
    prompt_text: str,
    prompt_tickers: set[str],
    row: StockUniverseRow,
) -> StockUniverseMatch | None:
    best: StockUniverseMatch | None = None
    if row.ticker in prompt_tickers:
        best = StockUniverseMatch(
            row=row,
            match_type="ticker",
            matched_term=row.ticker,
            score=140,
        )

    for term, match_type, base_score in _lookup_terms(row):
        if len(term) < 3 or f" {term} " not in prompt_text:
            continue
        word_bonus = min(len(term.split()) * 3, 9)
        match = StockUniverseMatch(
            row=row,
            match_type=match_type,
            matched_term=term,
            score=base_score + word_bonus,
        )
        if best is None or match.score > best.score:
            best = match
    return best


def _extract_prompt_tickers(prompt: str) -> set[str]:
    matches = re.findall(r"\$[A-Za-z][A-Za-z0-9.\-]{0,15}\b|\b[A-Z][A-Z0-9.\-]{1,15}\b", prompt)
    return {match.replace("$", "").upper() for match in matches}


def resolve_stock_universe_matches(query: str, *, count: int = DEFAULT_RECOMMENDATION_COUNT) -> list[StockUniverseMatch]:
    if count < 1 or count > 10:
        raise ValueError("Count must be between 1 and 10.")

    prompt_text = f" {_normalize_lookup_text(query)} "
    if not prompt_text.strip():
        return []
    prompt_tickers = _extract_prompt_tickers(query)

    matches: list[StockUniverseMatch] = []
    for row in get_stock_universe():
        match = _match_term_score(prompt_text, prompt_tickers, row)
        if match is not None:
            matches.append(match)

    matches.sort(
        key=lambda item: (
            -item.score,
            0 if item.row.is_student_friendly else 1,
            item.row.priority,
            item.row.ticker,
        ),
    )
    return matches[:count]


def _selection_rng() -> random.Random:
    raw_seed = os.getenv("ML_STOCK_UNIVERSE_RANDOM_SEED", "").strip()
    if not raw_seed:
        return random.SystemRandom()
    try:
        return random.Random(int(raw_seed))
    except ValueError:
        return random.Random(raw_seed)


def _weighted_pick(
    pool: list[StockUniverseRow],
    rng: random.Random,
) -> StockUniverseRow:
    if len(pool) == 1:
        return pool[0]

    weights: list[float] = []
    for rank, row in enumerate(pool):
        rank_weight = 1.0 / float(rank + 1)
        priority_weight = 1.0 / float(max(row.priority, 1))
        student_bonus = 1.25 if row.is_student_friendly else 1.0
        weights.append(rank_weight * priority_weight * student_bonus)

    total = sum(weights)
    if total <= 0:
        return pool[0]

    threshold = rng.random() * total
    running = 0.0
    for row, weight in zip(pool, weights, strict=False):
        running += weight
        if threshold <= running:
            return row

    return pool[-1]


def _pick_from_bucket(
    bucket_rows: list[StockUniverseRow],
    seen_tickers: set[str],
    seen_industries: set[str],
    rng: random.Random,
) -> StockUniverseRow | None:
    available = sorted(
        (row for row in bucket_rows if row.ticker not in seen_tickers),
        key=_row_sort_key,
    )
    if not available:
        return None

    unseen_industry = [
        row for row in available if row.industry not in seen_industries
    ]
    candidate_pool = unseen_industry or available
    candidate_pool = candidate_pool[: min(4, len(candidate_pool))]
    candidate = _weighted_pick(candidate_pool, rng)
    bucket_rows.remove(candidate)
    return candidate


def _select_diversified(
    rows: list[StockUniverseRow],
    count: int,
    preferred_sector_order: list[str],
) -> list[StockUniverseRow]:
    buckets: dict[str, list[StockUniverseRow]] = defaultdict(list)
    for row in rows:
        buckets[_normalize_sector_label(row.sector)].append(row)

    for bucket_rows in buckets.values():
        bucket_rows.sort(key=_row_sort_key)

    ordered_sectors = [sector for sector in preferred_sector_order if sector in buckets]
    ordered_sectors.extend(
        sector for sector in sorted(buckets.keys()) if sector not in ordered_sectors
    )
    selected: list[StockUniverseRow] = []
    seen_tickers: set[str] = set()
    seen_industries: set[str] = set()
    rng = _selection_rng()

    while len(selected) < count:
        added_in_round = False
        for sector in ordered_sectors:
            bucket_rows = buckets[sector]
            next_row = _pick_from_bucket(
                bucket_rows,
                seen_tickers,
                seen_industries,
                rng,
            )
            if next_row is None:
                continue
            selected.append(next_row)
            seen_tickers.add(next_row.ticker)
            seen_industries.add(next_row.industry)
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

    selected = _select_diversified(
        matching,
        count=count,
        preferred_sector_order=sectors,
    )
    if not selected:
        raise ValueError("No stock recommendations available for those sectors.")

    return selected
