from __future__ import annotations

import json
import os
from asyncio import Event, Lock, Queue, create_task, sleep
from collections import defaultdict
from typing import Any, cast

from fastapi import WebSocket

from .engine import normalize_ticker, validate_ticker
from .schemas import LiveStreamError, LiveStreamFeed, LiveStreamStatus, LiveTradeTick

try:
    import websockets
except ImportError:  # pragma: no cover - exercised only when websockets is missing
    websockets = None

ALLOWED_STREAM_FEEDS: set[LiveStreamFeed] = {"iex", "delayed_sip", "sip"}
DEFAULT_STREAM_FEED = os.getenv("ML_LIVE_STREAM_FEED", "iex").strip().lower() or "iex"
MAX_STREAM_SYMBOLS = 30
_STREAM_LOCK = Lock()


def _require_websockets_client() -> Any:
    if websockets is None:
        raise RuntimeError("Install websockets to enable the live stock stream.")
    return websockets


class _StreamChannel:
    def __init__(self, upstream_url: str, feed: LiveStreamFeed, tickers: list[str], key_id: str, secret_key: str):
        self.upstream_url = upstream_url
        self.feed = feed
        self.tickers = tickers
        self.key_id = key_id
        self.secret_key = secret_key
        self.subscribers: set[Queue[dict]] = set()
        self.started = False
        self.stopped = Event()
        self.task = None

    async def start(self) -> None:
        if self.started:
            return
        self.started = True
        self.task = create_task(self._run())

    async def _run(self) -> None:
        backoff = 1.0
        while not self.stopped.is_set():
            try:
                async with _require_websockets_client().connect(self.upstream_url, ping_interval=20, ping_timeout=20) as upstream:
                    await upstream.send(
                        json.dumps({"action": "auth", "key": self.key_id, "secret": self.secret_key})
                    )
                    await upstream.recv()
                    await upstream.send(json.dumps({"action": "subscribe", "trades": self.tickers}))
                    backoff = 1.0
                    while not self.stopped.is_set():
                        payload = await upstream.recv()
                        messages = json.loads(payload)
                        if not isinstance(messages, list):
                            continue
                        for message in messages:
                            if isinstance(message, dict):
                                await self._broadcast(message)
            except Exception:
                if self.stopped.is_set():
                    break
                await sleep(backoff)
                backoff = min(backoff * 2, 15.0)

    async def _broadcast(self, message: dict) -> None:
        if message.get("T") == "t" and message.get("S") in self.tickers:
            payload = LiveTradeTick(
                symbol=str(message["S"]),
                price=float(message["p"]),
                size=int(message.get("s", 0)) if message.get("s") is not None else None,
                timestamp=str(message.get("t", "")),
                feed=cast(LiveStreamFeed, self.feed),
            ).model_dump()
        elif message.get("T") == "error":
            payload = LiveStreamError(message=str(message.get("msg", "Live stream error."))).model_dump()
        else:
            return

        stale: list[Queue[dict]] = []
        for subscriber in list(self.subscribers):
            try:
                subscriber.put_nowait(payload)
            except Exception:
                stale.append(subscriber)
        for subscriber in stale:
            self.subscribers.discard(subscriber)

    async def subscribe(self) -> Queue[dict]:
        queue: Queue[dict] = Queue(maxsize=100)
        self.subscribers.add(queue)
        await self.start()
        return queue

    def unsubscribe(self, queue: Queue[dict]) -> None:
        self.subscribers.discard(queue)
        if not self.subscribers:
            self.stopped.set()
            if self.task is not None:
                self.task.cancel()


_CHANNELS: dict[str, _StreamChannel] = {}


def normalize_live_stream_feed(raw_feed: str | None) -> LiveStreamFeed:
    feed = (raw_feed or DEFAULT_STREAM_FEED).strip().lower()
    if feed in ALLOWED_STREAM_FEEDS:
        return cast(LiveStreamFeed, feed)
    raise ValueError("Invalid live stream feed. Use iex, delayed_sip, or sip.")


def normalize_live_stream_symbols(raw_symbols: str) -> list[str]:
    parts = [part.strip() for part in raw_symbols.split(",")]
    symbols = [validate_ticker(normalize_ticker(part)) for part in parts if part.strip()]
    if not symbols:
        raise ValueError("At least one ticker is required for the live stream.")

    deduped = list(dict.fromkeys(symbols))
    if len(deduped) > MAX_STREAM_SYMBOLS:
        raise ValueError(f"Live stream supports up to {MAX_STREAM_SYMBOLS} symbols per connection.")
    return deduped


def _market_data_credentials() -> tuple[str, str]:
    key_id = (
        os.getenv("ML_MARKET_DATA_ALPACA_KEY_ID")
        or os.getenv("ML_TRADING_ALPACA_KEY_ID")
        or os.getenv("APCA_API_KEY_ID")
    )
    secret_key = (
        os.getenv("ML_MARKET_DATA_ALPACA_SECRET_KEY")
        or os.getenv("ML_TRADING_ALPACA_SECRET_KEY")
        or os.getenv("APCA_API_SECRET_KEY")
    )
    if not key_id or not secret_key:
        raise RuntimeError(
            "Set Alpaca API credentials to enable the live stock websocket stream."
        )
    return key_id, secret_key


async def relay_live_trade_stream(
    websocket: WebSocket,
    raw_symbols: str,
    raw_feed: str | None = None,
) -> None:
    _ = _require_websockets_client()

    tickers = normalize_live_stream_symbols(raw_symbols)
    feed = normalize_live_stream_feed(raw_feed)
    key_id, secret_key = _market_data_credentials()
    upstream_url = f"wss://stream.data.alpaca.markets/v2/{feed}"

    await websocket.accept()

    channel_key = f"{feed}:{','.join(tickers)}"
    queue: Queue[dict] | None = None
    try:
        async with _STREAM_LOCK:
            channel = _CHANNELS.get(channel_key)
            if channel is None:
                channel = _StreamChannel(upstream_url, feed, tickers, key_id, secret_key)
                _CHANNELS[channel_key] = channel
        queue = await channel.subscribe()

        for ticker in tickers:
            await websocket.send_json(
                LiveStreamStatus(symbol=ticker, feed=feed, status="connected").model_dump()
            )

        while True:
            message = await queue.get()
            await websocket.send_json(message)
    finally:
        async with _STREAM_LOCK:
            channel = _CHANNELS.get(channel_key)
            if channel is not None and queue is not None:
                channel.unsubscribe(queue)
                if not channel.subscribers:
                    _CHANNELS.pop(channel_key, None)
        await websocket.close()
