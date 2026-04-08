from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass, field
from datetime import datetime, UTC
from threading import Lock
from typing import Any

from .engine import build_quote_responses
from .paper_trading import execute_auto_trade_batch
from .schemas import AutoTradeResponse, ModelProfile, QuoteResponse, RefreshCadence


WATCH_CADENCE_SECONDS: dict[RefreshCadence, int] = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
}


@dataclass
class WatchTradeEntry:
    id: str
    timestamp: str
    ticker: str
    modelProfile: ModelProfile
    action: str
    signal: str
    confidence: float
    submitted: bool
    statusMessage: str


@dataclass
class WatchSession:
    user_id: str
    tickers: list[str]
    model_profile: ModelProfile
    cadence: RefreshCadence
    auto_trade_enabled: bool
    created_at: str
    updated_at: str
    running: bool = True
    quotes: list[QuoteResponse] = field(default_factory=list)
    last_auto_trade: AutoTradeResponse | None = None
    trade_log: list[WatchTradeEntry] = field(default_factory=list)
    last_error: str | None = None
    last_run_at: str | None = None


_WATCH_LOCK = Lock()
_WATCH_SESSIONS: dict[str, WatchSession] = {}
_WATCH_TASKS: dict[str, asyncio.Task[None]] = {}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _normalize_tickers(tickers: list[str]) -> list[str]:
    next_tickers = [ticker.strip().upper() for ticker in tickers if ticker and ticker.strip()]
    deduped = list(dict.fromkeys(next_tickers))
    if len(deduped) == 0:
        raise ValueError("At least one ticker is required to start watching.")
    if len(deduped) > 3:
        raise ValueError("Watch sessions support up to 3 tickers.")
    return deduped


def _cadence_seconds(cadence: RefreshCadence) -> int:
    return WATCH_CADENCE_SECONDS[cadence]


async def _run_watch_loop(user_id: str) -> None:
    while True:
        with _WATCH_LOCK:
            session = _WATCH_SESSIONS.get(user_id)
            if session is None or not session.running:
                _WATCH_TASKS.pop(user_id, None)
                return
            tickers = list(session.tickers)
            model_profile = session.model_profile
            cadence = session.cadence
            auto_trade_enabled = session.auto_trade_enabled

        try:
            quote_batch = await asyncio.to_thread(
                build_quote_responses,
                tickers,
                False,
                model_profile,
                "line",
            )
            quotes = list(quote_batch.results)
            trade_results: list[AutoTradeResponse] = []
            if auto_trade_enabled:
                trade_results = await asyncio.to_thread(
                    lambda: execute_auto_trade_batch(
                        tickers,
                        model_profile=model_profile,
                        cadence=cadence,
                        user_id=user_id,
                    ),
                )
                trade_results = list(trade_results)

            with _WATCH_LOCK:
                session = _WATCH_SESSIONS.get(user_id)
                if session is None or not session.running:
                    continue
                session.quotes = quotes
                session.last_run_at = _now_iso()
                session.last_error = None
                if trade_results:
                    session.last_auto_trade = trade_results[0]
                    now = _now_iso()
                    session.trade_log = [
                        WatchTradeEntry(
                            id=f"{now}-{index}-{result.ticker}-{result.action}",
                            timestamp=now,
                            ticker=result.ticker,
                            modelProfile=result.modelProfile,
                            action=result.action,
                            signal=result.signal,
                            confidence=result.confidence,
                            submitted=result.submitted,
                            statusMessage=result.statusMessage,
                        )
                        for index, result in enumerate(trade_results)
                    ] + session.trade_log
                    session.trade_log = session.trade_log[:24]
                session.updated_at = _now_iso()
        except Exception as exc:
            with _WATCH_LOCK:
                session = _WATCH_SESSIONS.get(user_id)
                if session is not None:
                    session.last_error = str(exc)
                    session.updated_at = _now_iso()

        await asyncio.sleep(_cadence_seconds(cadence))


def start_watch_session(
    *,
    user_id: str,
    tickers: list[str],
    model_profile: ModelProfile,
    cadence: RefreshCadence,
    auto_trade_enabled: bool,
) -> WatchSession:
    normalized_tickers = _normalize_tickers(tickers)
    session = WatchSession(
        user_id=user_id,
        tickers=normalized_tickers,
        model_profile=model_profile,
        cadence=cadence,
        auto_trade_enabled=auto_trade_enabled,
        created_at=_now_iso(),
        updated_at=_now_iso(),
    )

    with _WATCH_LOCK:
        existing = _WATCH_TASKS.get(user_id)
        if existing is not None:
            existing.cancel()
        _WATCH_SESSIONS[user_id] = session
        task = asyncio.create_task(_run_watch_loop(user_id))
        _WATCH_TASKS[user_id] = task

    return session


def stop_watch_session(user_id: str) -> None:
    with _WATCH_LOCK:
        session = _WATCH_SESSIONS.get(user_id)
        if session is not None:
            session.running = False
        task = _WATCH_TASKS.pop(user_id, None)
    if task is not None:
        task.cancel()


def get_watch_session(user_id: str) -> WatchSession | None:
    with _WATCH_LOCK:
        return _WATCH_SESSIONS.get(user_id)


def snapshot_watch_session(session: WatchSession) -> dict[str, Any]:
    return {
        "userId": session.user_id,
        "trackedTickers": session.tickers,
        "modelProfile": session.model_profile,
        "cadence": session.cadence,
        "autoTradeEnabled": session.auto_trade_enabled,
        "running": session.running,
        "quotes": [quote.model_dump() for quote in session.quotes],
        "lastAutoTrade": session.last_auto_trade.model_dump() if session.last_auto_trade else None,
        "paperTradeLog": [asdict(entry) for entry in session.trade_log],
        "lastError": session.last_error,
        "lastRunAt": session.last_run_at,
        "createdAt": session.created_at,
        "updatedAt": session.updated_at,
    }
