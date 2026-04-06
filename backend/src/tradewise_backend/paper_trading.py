from __future__ import annotations

import os
from typing import Any

from .engine import build_quote_response
from .schemas import AutoTradeResponse, ModelProfile, RefreshCadence

try:
    from alpaca.trading.client import TradingClient
    from alpaca.trading.enums import OrderSide, TimeInForce
    from alpaca.trading.requests import MarketOrderRequest
except ImportError:  # pragma: no cover - exercised only when alpaca-py is missing
    TradingClient = None
    OrderSide = None
    TimeInForce = None
    MarketOrderRequest = None

REFRESH_CADENCE_SECONDS: dict[RefreshCadence, int] = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
}


def normalize_refresh_cadence(raw_cadence: str | None) -> RefreshCadence:
    cadence = (raw_cadence or "1m").strip().lower()
    if cadence in REFRESH_CADENCE_SECONDS:
        return cadence  # type: ignore[return-value]
    raise ValueError("Invalid refresh cadence. Use 1m, 5m, or 15m.")


def cadence_seconds(cadence: RefreshCadence) -> int:
    return REFRESH_CADENCE_SECONDS[cadence]


def _trading_client() -> TradingClient:
    if TradingClient is None or MarketOrderRequest is None or OrderSide is None or TimeInForce is None:
        raise RuntimeError("Install alpaca-py to enable paper auto-trading.")

    key_id = (
        os.getenv("ML_TRADING_ALPACA_KEY_ID")
        or os.getenv("ML_MARKET_DATA_ALPACA_KEY_ID")
        or os.getenv("APCA_API_KEY_ID")
    )
    secret_key = (
        os.getenv("ML_TRADING_ALPACA_SECRET_KEY")
        or os.getenv("ML_MARKET_DATA_ALPACA_SECRET_KEY")
        or os.getenv("APCA_API_SECRET_KEY")
    )
    if not key_id or not secret_key:
        raise RuntimeError(
            "Set ML_TRADING_ALPACA_KEY_ID and ML_TRADING_ALPACA_SECRET_KEY "
            "(or reuse the market-data Alpaca keys) to enable paper auto-trading."
        )

    return TradingClient(key_id, secret_key, paper=True)


def _position_before_shares(client: TradingClient, ticker: str) -> int:
    try:
        position = client.get_open_position(ticker)
    except Exception:
        return 0

    qty = getattr(position, "qty", 0)
    try:
        return max(0, int(float(qty)))
    except Exception:
        return 0


def _submit_market_order(client: TradingClient, ticker: str, side: Any, quantity: int):
    return client.submit_order(
        MarketOrderRequest(
            symbol=ticker,
            qty=quantity,
            side=side,
            time_in_force=TimeInForce.DAY,
        )
    )


def execute_auto_trade(
    raw_ticker: str,
    model_profile: ModelProfile | str | None = "risky",
    cadence: RefreshCadence | str | None = "1m",
) -> AutoTradeResponse:
    selected_cadence = normalize_refresh_cadence(cadence)
    quote = build_quote_response(
        raw_ticker,
        include_chart=False,
        model_profile=model_profile,
        chart_type="line",
    )

    client = _trading_client()
    position_before = _position_before_shares(client, quote.ticker)
    action = "hold"
    submitted = False
    quantity = 0
    order_id = None
    status_message = "No paper order submitted."

    if quote.signal == "bullish" and position_before == 0:
        quantity = 1
        order = _submit_market_order(client, quote.ticker, OrderSide.BUY, quantity)
        action = "buy"
        submitted = True
        order_id = str(getattr(order, "id", "")) or None
        status_message = f"Submitted paper buy for {quantity} share of {quote.ticker}."
    elif quote.signal == "bearish" and position_before > 0:
        quantity = position_before
        order = _submit_market_order(client, quote.ticker, OrderSide.SELL, quantity)
        action = "sell"
        submitted = True
        order_id = str(getattr(order, "id", "")) or None
        status_message = f"Submitted paper sell for {quantity} share{'s' if quantity != 1 else ''} of {quote.ticker}."
    elif quote.signal == "bullish":
        status_message = f"Holding {quote.ticker}; paper buy skipped because a position already exists."
    elif quote.signal == "bearish":
        status_message = f"No paper sell submitted because there is no open {quote.ticker} position."
    else:
        status_message = "Model is neutral; holding position."

    return AutoTradeResponse(
        ticker=quote.ticker,
        modelProfile=(quote.selectedModelProfile or "risky"),
        cadence=selected_cadence,
        signal=quote.signal,
        confidence=quote.confidence,
        action=action,  # type: ignore[arg-type]
        submitted=submitted,
        quantity=quantity,
        positionBeforeShares=position_before,
        orderId=order_id,
        statusMessage=status_message,
        quote=quote,
    )
