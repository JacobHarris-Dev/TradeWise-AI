from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from zoneinfo import ZoneInfo

from .engine import build_price_snapshots
from .paper_account import get_paper_account, normalize_paper_user_id
from .schemas import (
    PaperAccountPerformancePoint,
    PaperAccountPerformancePosition,
    PaperAccountPerformanceResponse,
)

MARKET_TIMEZONE = ZoneInfo("America/New_York")
MAX_INTRADAY_POINTS = 512
MIN_SNAPSHOT_INTERVAL_SECONDS = 20


@dataclass
class _IntradayEquitySnapshot:
    timestamp: datetime
    cash: float
    positions_value: float
    total_equity: float


_intraday_history_lock = Lock()
_intraday_history: dict[str, list[_IntradayEquitySnapshot]] = {}


def _market_day_key(timestamp: datetime) -> str:
    return timestamp.astimezone(MARKET_TIMEZONE).date().isoformat()


def _store_intraday_snapshot(
    user_id: str,
    *,
    timestamp: datetime,
    cash: float,
    positions_value: float,
    total_equity: float,
) -> list[_IntradayEquitySnapshot]:
    day_key = _market_day_key(timestamp)
    next_snapshot = _IntradayEquitySnapshot(
        timestamp=timestamp,
        cash=round(cash, 2),
        positions_value=round(positions_value, 2),
        total_equity=round(total_equity, 2),
    )

    with _intraday_history_lock:
        history = [
            snapshot
            for snapshot in _intraday_history.get(user_id, [])
            if _market_day_key(snapshot.timestamp) == day_key
        ]
        previous = history[-1] if history else None
        if previous and (
            timestamp - previous.timestamp
        ).total_seconds() < MIN_SNAPSHOT_INTERVAL_SECONDS:
            history[-1] = next_snapshot
        elif previous and (
            previous.cash == next_snapshot.cash
            and previous.positions_value == next_snapshot.positions_value
            and previous.total_equity == next_snapshot.total_equity
        ):
            history[-1] = next_snapshot
        else:
            history.append(next_snapshot)

        if len(history) > MAX_INTRADAY_POINTS:
            history = history[-MAX_INTRADAY_POINTS:]

        _intraday_history[user_id] = history
        return list(history)


def build_paper_account_performance(user_id: str | None) -> PaperAccountPerformanceResponse:
    normalized_user_id = normalize_paper_user_id(user_id)
    account = get_paper_account(normalized_user_id)

    snapshots_by_ticker = {}
    if account.positions:
        try:
            snapshots_by_ticker = {
                snapshot.ticker: snapshot
                for snapshot in build_price_snapshots(
                    [position.ticker for position in account.positions]
                )
            }
        except RuntimeError:
            snapshots_by_ticker = {}

    positions: list[PaperAccountPerformancePosition] = []
    positions_value = 0.0
    for position in account.positions:
        snapshot = snapshots_by_ticker.get(position.ticker)
        current_price = snapshot.lastPrice if snapshot is not None else position.avgEntryPrice
        market_value = round(current_price * position.shares, 2)
        positions_value += market_value
        positions.append(
            PaperAccountPerformancePosition(
                ticker=position.ticker,
                companyName=(
                    snapshot.companyName if snapshot is not None else f"{position.ticker} (paper)"
                ),
                shares=position.shares,
                avgEntryPrice=round(position.avgEntryPrice, 4),
                currentPrice=round(current_price, 4),
                marketValue=market_value,
                changePercent=(
                    round(snapshot.changePercent, 2) if snapshot is not None else None
                ),
            )
        )

    total_equity = round(account.cash + positions_value, 2)
    timestamp = datetime.now(UTC)
    history = _store_intraday_snapshot(
        normalized_user_id,
        timestamp=timestamp,
        cash=account.cash,
        positions_value=positions_value,
        total_equity=total_equity,
    )
    baseline_equity = round(history[0].total_equity if history else total_equity, 2)
    day_change = round(total_equity - baseline_equity, 2)
    day_change_percent = round(
        ((day_change / baseline_equity) * 100) if baseline_equity > 0 else 0.0,
        2,
    )

    return PaperAccountPerformanceResponse(
        userId=normalized_user_id,
        startingCash=round(account.startingCash, 2),
        cash=round(account.cash, 2),
        positionsValue=round(positions_value, 2),
        totalEquity=total_equity,
        dayChange=day_change,
        dayChangePercent=day_change_percent,
        baselineEquity=baseline_equity,
        positions=positions,
        points=[
            PaperAccountPerformancePoint(
                timestamp=snapshot.timestamp.isoformat(),
                totalEquity=round(snapshot.total_equity, 2),
                cash=round(snapshot.cash, 2),
                positionsValue=round(snapshot.positions_value, 2),
            )
            for snapshot in history
        ],
        updatedAt=timestamp.isoformat(),
    )
