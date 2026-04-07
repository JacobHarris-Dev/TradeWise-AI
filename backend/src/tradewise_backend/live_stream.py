from __future__ import annotations

import json
import os

from fastapi import WebSocket

from .engine import normalize_ticker, validate_ticker
from .schemas import LiveStreamError, LiveStreamFeed, LiveStreamStatus, LiveTradeTick

try:
    import websockets
except ImportError:  # pragma: no cover - exercised only when websockets is missing
    websockets = None

ALLOWED_STREAM_FEEDS = {"iex", "delayed_sip", "sip"}
DEFAULT_STREAM_FEED = os.getenv("ML_LIVE_STREAM_FEED", "iex").strip().lower() or "iex"
MAX_STREAM_SYMBOLS = 30


def normalize_live_stream_feed(raw_feed: str | None) -> LiveStreamFeed:
    feed = (raw_feed or DEFAULT_STREAM_FEED).strip().lower()
    if feed in ALLOWED_STREAM_FEEDS:
        return feed  # type: ignore[return-value]
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
    if websockets is None:
        raise RuntimeError("Install websockets to enable the live stock stream.")

    tickers = normalize_live_stream_symbols(raw_symbols)
    feed = normalize_live_stream_feed(raw_feed)
    key_id, secret_key = _market_data_credentials()
    upstream_url = f"wss://stream.data.alpaca.markets/v2/{feed}"

    await websocket.accept()

    try:
        async with websockets.connect(upstream_url, ping_interval=20, ping_timeout=20) as upstream:
            await upstream.send(
                json.dumps({"action": "auth", "key": key_id, "secret": secret_key})
            )
            await upstream.recv()
            await upstream.send(json.dumps({"action": "subscribe", "trades": tickers}))
            for ticker in tickers:
                await websocket.send_json(
                    LiveStreamStatus(
                        symbol=ticker,
                        feed=feed,
                        status="connected",
                    ).model_dump()
                )

            while True:
                payload = await upstream.recv()
                messages = json.loads(payload)
                if not isinstance(messages, list):
                    continue

                for message in messages:
                    if not isinstance(message, dict):
                        continue
                    if message.get("T") == "t" and message.get("S") in tickers:
                        await websocket.send_json(
                            LiveTradeTick(
                                symbol=str(message["S"]),
                                price=float(message["p"]),
                                size=int(message.get("s", 0)) if message.get("s") is not None else None,
                                timestamp=str(message.get("t", "")),
                                feed=feed,
                            ).model_dump()
                        )
                    elif message.get("T") == "error":
                        await websocket.send_json(
                            LiveStreamError(message=str(message.get("msg", "Live stream error."))).model_dump()
                        )
                        return
    finally:
        await websocket.close()
