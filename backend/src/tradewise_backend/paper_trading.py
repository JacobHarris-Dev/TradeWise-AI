from __future__ import annotations

from dataclasses import dataclass
import os
from datetime import UTC, datetime
from typing import Any, Literal

from .engine import build_quote_response, normalize_ticker, validate_ticker
from .model_runtime import normalize_model_profile
from .paper_account import (
    apply_paper_buy,
    apply_paper_sell,
    get_paper_account,
    normalize_paper_user_id,
)
from .schemas import AutoTradeResponse, ModelProfile, QuoteResponse, RefreshCadence

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
DEFAULT_PAPER_EXECUTION_BACKEND = (
    os.getenv("ML_PAPER_EXECUTION_BACKEND", "local").strip().lower() or "local"
)
DEFAULT_PAPER_BUY_SHARES = max(
    1,
    int((os.getenv("ML_PAPER_BUY_SHARES", "1").strip() or "1")),
)
DEFAULT_PARTIAL_SELL_RATIO = min(
    1.0,
    max(0.05, float(os.getenv("ML_PAPER_SELL_RATIO", "0.5").strip() or "0.5")),
)
MAX_AUTO_TRADE_BATCH_TICKERS = 25


@dataclass(frozen=True)
class _AllocationPolicy:
    cash_reserve_fraction: float
    max_position_fraction: float


PROFILE_ALLOCATION_POLICIES: dict[ModelProfile, _AllocationPolicy] = {
    "safe": _AllocationPolicy(cash_reserve_fraction=0.40, max_position_fraction=0.25),
    "neutral": _AllocationPolicy(cash_reserve_fraction=0.25, max_position_fraction=0.35),
    "risky": _AllocationPolicy(cash_reserve_fraction=0.10, max_position_fraction=0.50),
}


def normalize_refresh_cadence(raw_cadence: str | None) -> RefreshCadence:
    cadence = (raw_cadence or "1m").strip().lower()
    if cadence in REFRESH_CADENCE_SECONDS:
        return cadence  # type: ignore[return-value]
    raise ValueError("Invalid refresh cadence. Use 1m, 5m, or 15m.")


def cadence_seconds(cadence: RefreshCadence) -> int:
    return REFRESH_CADENCE_SECONDS[cadence]


def _partial_sell_quantity(position_before: int) -> int:
    if position_before <= 0:
        return 0
    return min(position_before, max(1, int(position_before * DEFAULT_PARTIAL_SELL_RATIO)))


def _normalize_requested_side(
    raw_side: str | None,
) -> Literal["buy", "sell"] | None:
    if raw_side is None:
        return None
    side = raw_side.strip().lower()
    if side in {"buy", "sell"}:
        return side
    raise ValueError("Requested side must be buy or sell.")


def _allocation_policy(model_profile: ModelProfile | str | None) -> _AllocationPolicy:
    selected_profile = normalize_model_profile(model_profile) or "risky"
    return PROFILE_ALLOCATION_POLICIES[selected_profile]


def _account_equity(account, prices_by_ticker: dict[str, float]) -> float:
    holdings_value = sum(
        (prices_by_ticker.get(position.ticker, position.avgEntryPrice) * position.shares)
        for position in account.positions
    )
    return round(account.cash + holdings_value, 2)


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


def _normalize_auto_trade_tickers(raw_tickers: list[str]) -> list[str]:
    tickers = [validate_ticker(normalize_ticker(raw_ticker)) for raw_ticker in raw_tickers]
    deduped = list(dict.fromkeys(tickers))
    if not deduped:
        raise ValueError("At least one ticker is required for auto-trading.")
    if len(deduped) > MAX_AUTO_TRADE_BATCH_TICKERS:
        raise ValueError(
            f"Auto-trade supports up to {MAX_AUTO_TRADE_BATCH_TICKERS} tickers per batch."
        )
    return deduped


def _build_auto_trade_response(
    *,
    quote: QuoteResponse,
    selected_cadence: RefreshCadence,
    normalized_user_id: str,
    action: str,
    submitted: bool,
    quantity: int,
    position_before: int,
    position_after: int,
    status_message: str,
    cash_before: float | None = None,
    cash_after: float | None = None,
    order_id: str | None = None,
) -> AutoTradeResponse:
    return AutoTradeResponse(
        ticker=quote.ticker,
        modelProfile=(quote.selectedModelProfile or "risky"),
        cadence=selected_cadence,
        userId=normalized_user_id,
        signal=quote.signal,
        confidence=quote.confidence,
        action=action,  # type: ignore[arg-type]
        submitted=submitted,
        quantity=quantity,
        positionBeforeShares=position_before,
        positionAfterShares=position_after,
        cashBefore=round(cash_before, 2) if cash_before is not None else None,
        cashAfter=round(cash_after, 2) if cash_after is not None else None,
        orderId=order_id,
        statusMessage=status_message,
        quote=quote,
    )


def _execute_local_auto_trade(
    raw_ticker: str,
    model_profile: ModelProfile | str | None,
    selected_cadence: RefreshCadence,
    user_id: str | None,
) -> AutoTradeResponse:
    normalized_user_id = normalize_paper_user_id(user_id)
    quote = build_quote_response(
        raw_ticker,
        include_chart=False,
        model_profile=model_profile,
        chart_type="line",
    )

    account = get_paper_account(normalized_user_id)
    position_before = 0
    for position in account.positions:
        if position.ticker == quote.ticker:
            position_before = position.shares
            break

    action = "hold"
    submitted = False
    quantity = 0
    position_after = position_before
    cash_before = account.cash
    cash_after = account.cash
    order_id = None
    status_message = "No paper order submitted."

    if quote.signal == "bullish" and position_before == 0:
        quantity_target = DEFAULT_PAPER_BUY_SHARES
        filled, position_after, cash_before, cash_after = apply_paper_buy(
            normalized_user_id,
            quote.ticker,
            quote.lastPrice,
            quantity_target,
        )
        quantity = filled
        if filled > 0:
            action = "buy"
            submitted = True
            order_id = f"local-buy-{int(datetime.now(UTC).timestamp() * 1000)}"
            status_message = (
                f"Submitted paper buy for {filled} share{'s' if filled != 1 else ''} of "
                f"{quote.ticker} from account cash."
            )
        else:
            status_message = (
                f"Buy skipped for {quote.ticker}; paper account cash (${cash_before:.2f}) "
                "cannot fund the requested share quantity."
            )
    elif quote.signal == "bearish" and position_before > 0:
        quantity_target = _partial_sell_quantity(position_before)
        filled, position_after, cash_before, cash_after = apply_paper_sell(
            normalized_user_id,
            quote.ticker,
            quote.lastPrice,
            quantity_target,
        )
        quantity = filled
        if filled > 0:
            action = "sell"
            submitted = True
            order_id = f"local-sell-{int(datetime.now(UTC).timestamp() * 1000)}"
            status_message = (
                f"Submitted partial paper sell for {filled} share{'s' if filled != 1 else ''} "
                f"of {quote.ticker} ({position_before} -> {position_after} shares)."
            )
    elif quote.signal == "bullish":
        status_message = (
            f"Holding {quote.ticker}; paper buy skipped because a position already exists."
        )
    elif quote.signal == "bearish":
        status_message = (
            f"No paper sell submitted because there is no open {quote.ticker} position."
        )
    else:
        status_message = "Model is neutral; holding position."

    return _build_auto_trade_response(
        quote=quote,
        selected_cadence=selected_cadence,
        normalized_user_id=normalized_user_id,
        action=action,
        submitted=submitted,
        quantity=quantity,
        position_before=position_before,
        position_after=position_after,
        status_message=status_message,
        cash_before=cash_before,
        cash_after=cash_after,
        order_id=order_id,
    )


def _execute_local_manual_trade(
    raw_ticker: str,
    model_profile: ModelProfile | str | None,
    selected_cadence: RefreshCadence,
    user_id: str | None,
    requested_side: Literal["buy", "sell"],
    quantity: int,
) -> AutoTradeResponse:
    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")

    normalized_user_id = normalize_paper_user_id(user_id)
    quote = build_quote_response(
        raw_ticker,
        include_chart=False,
        model_profile=model_profile,
        chart_type="line",
    )
    account = get_paper_account(normalized_user_id)
    position_before = next(
        (position.shares for position in account.positions if position.ticker == quote.ticker),
        0,
    )
    cash_before = account.cash
    cash_after = account.cash
    position_after = position_before
    submitted = False
    filled = 0
    status_message = "No manual paper trade submitted."
    order_id = None

    if requested_side == "buy":
        filled, position_after, cash_before, cash_after = apply_paper_buy(
            normalized_user_id,
            quote.ticker,
            quote.lastPrice,
            quantity,
        )
        submitted = filled > 0
        if submitted:
            order_id = f"local-manual-buy-{int(datetime.now(UTC).timestamp() * 1000)}"
            status_message = (
                f"Submitted manual paper buy for {filled} share{'s' if filled != 1 else ''} "
                f"of {quote.ticker}."
            )
        else:
            status_message = (
                f"Manual buy skipped for {quote.ticker}; paper account cash (${cash_before:.2f}) "
                "could not fund the requested share quantity."
            )
    else:
        filled, position_after, cash_before, cash_after = apply_paper_sell(
            normalized_user_id,
            quote.ticker,
            quote.lastPrice,
            quantity,
        )
        submitted = filled > 0
        if submitted:
            order_id = f"local-manual-sell-{int(datetime.now(UTC).timestamp() * 1000)}"
            status_message = (
                f"Submitted manual paper sell for {filled} share{'s' if filled != 1 else ''} "
                f"of {quote.ticker} ({position_before} -> {position_after} shares)."
            )
        else:
            status_message = (
                f"Manual paper sell skipped because there is no open {quote.ticker} position."
            )

    return _build_auto_trade_response(
        quote=quote,
        selected_cadence=selected_cadence,
        normalized_user_id=normalized_user_id,
        action=requested_side if submitted else "hold",
        submitted=submitted,
        quantity=filled,
        position_before=position_before,
        position_after=position_after,
        status_message=status_message,
        cash_before=cash_before,
        cash_after=cash_after,
        order_id=order_id,
    )


def _execute_local_auto_trade_batch(
    raw_tickers: list[str],
    model_profile: ModelProfile | str | None,
    selected_cadence: RefreshCadence,
    user_id: str | None,
) -> list[AutoTradeResponse]:
    normalized_user_id = normalize_paper_user_id(user_id)
    tickers = _normalize_auto_trade_tickers(raw_tickers)
    quotes = [
        build_quote_response(
            ticker,
            include_chart=False,
            model_profile=model_profile,
            chart_type="line",
        )
        for ticker in tickers
    ]

    allocation_policy = _allocation_policy(model_profile)
    account = get_paper_account(normalized_user_id)
    positions_by_ticker = {position.ticker: position.shares for position in account.positions}
    results_by_ticker: dict[str, AutoTradeResponse] = {}
    prices_by_ticker = {quote.ticker: quote.lastPrice for quote in quotes}

    current_cash = account.cash

    for quote in quotes:
        position_before = positions_by_ticker.get(quote.ticker, 0)
        if quote.signal != "bearish" or position_before <= 0:
            continue

        quantity_target = _partial_sell_quantity(position_before)
        filled, position_after, cash_before, cash_after = apply_paper_sell(
            normalized_user_id,
            quote.ticker,
            quote.lastPrice,
            quantity_target,
        )
        positions_by_ticker[quote.ticker] = position_after
        current_cash = cash_after
        results_by_ticker[quote.ticker] = _build_auto_trade_response(
            quote=quote,
            selected_cadence=selected_cadence,
            normalized_user_id=normalized_user_id,
            action="sell" if filled > 0 else "hold",
            submitted=filled > 0,
            quantity=filled,
            position_before=position_before,
            position_after=position_after,
            status_message=(
                f"Submitted partial paper sell for {filled} share{'s' if filled != 1 else ''} "
                f"of {quote.ticker} ({position_before} -> {position_after} shares)."
                if filled > 0
                else f"No paper sell submitted because there is no open {quote.ticker} position."
            ),
            cash_before=cash_before,
            cash_after=cash_after,
            order_id=(
                f"local-sell-{int(datetime.now(UTC).timestamp() * 1000)}"
                if filled > 0
                else None
            ),
        )

    account_after_sells = get_paper_account(normalized_user_id)
    current_cash = account_after_sells.cash
    total_equity = _account_equity(account_after_sells, prices_by_ticker)
    cash_reserve_floor = round(total_equity * allocation_policy.cash_reserve_fraction, 2)
    max_position_value = round(total_equity * allocation_policy.max_position_fraction, 2)

    buy_candidates = sorted(
        [
            quote
            for quote in quotes
            if quote.signal == "bullish" and positions_by_ticker.get(quote.ticker, 0) == 0
        ],
        key=lambda quote: (-quote.confidence, quote.ticker),
    )
    unopened_candidates: list[QuoteResponse] = []
    shared_budget_per_candidate = (
        max(0.0, current_cash - cash_reserve_floor) / len(buy_candidates)
        if buy_candidates
        else 0.0
    )

    for quote in buy_candidates:
        available_cash = max(0.0, current_cash - cash_reserve_floor)
        allocation_budget = min(shared_budget_per_candidate, max_position_value, available_cash)
        quantity_target = int(allocation_budget // quote.lastPrice)
        if quantity_target <= 0:
            unopened_candidates.append(quote)
            continue

        filled, position_after, cash_before, cash_after = apply_paper_buy(
            normalized_user_id,
            quote.ticker,
            quote.lastPrice,
            quantity_target,
        )
        positions_by_ticker[quote.ticker] = position_after
        current_cash = cash_after
        results_by_ticker[quote.ticker] = _build_auto_trade_response(
            quote=quote,
            selected_cadence=selected_cadence,
            normalized_user_id=normalized_user_id,
            action="buy" if filled > 0 else "hold",
            submitted=filled > 0,
            quantity=filled,
            position_before=0,
            position_after=position_after,
            status_message=(
                f"Submitted paper buy for {filled} share{'s' if filled != 1 else ''} of "
                f"{quote.ticker} using the shared cash allocation with a "
                f"{int(allocation_policy.cash_reserve_fraction * 100)}% cash reserve "
                "and profile position cap."
                if filled > 0
                else (
                    f"Buy skipped for {quote.ticker}; allocation budget (${allocation_budget:.2f}) "
                    "could not fund the requested share quantity."
                )
            ),
            cash_before=cash_before,
            cash_after=cash_after,
            order_id=(
                f"local-buy-{int(datetime.now(UTC).timestamp() * 1000)}"
                if filled > 0
                else None
            ),
        )

    for quote in unopened_candidates:
        position_before = positions_by_ticker.get(quote.ticker, 0)
        available_cash = max(0.0, current_cash - cash_reserve_floor)
        max_affordable_quantity = int(min(available_cash, max_position_value) // quote.lastPrice)
        cash_before = current_cash
        if max_affordable_quantity > 0:
            filled, position_after, cash_before, cash_after = apply_paper_buy(
                normalized_user_id,
                quote.ticker,
                quote.lastPrice,
                min(DEFAULT_PAPER_BUY_SHARES, max_affordable_quantity),
            )
            positions_by_ticker[quote.ticker] = position_after
            current_cash = cash_after
            results_by_ticker[quote.ticker] = _build_auto_trade_response(
                quote=quote,
                selected_cadence=selected_cadence,
                normalized_user_id=normalized_user_id,
                action="buy" if filled > 0 else "hold",
                submitted=filled > 0,
                quantity=filled,
                position_before=position_before,
                position_after=position_after,
                status_message=(
                    f"Submitted fallback paper buy for {filled} share{'s' if filled != 1 else ''} "
                    f"of {quote.ticker} after splitting cash across tracked symbols and "
                    "preserving the profile reserve."
                    if filled > 0
                    else (
                        f"Buy skipped for {quote.ticker}; remaining paper cash (${cash_before:.2f}) "
                        "could not fund a fallback share."
                    )
                ),
                cash_before=cash_before,
                cash_after=cash_after,
                order_id=(
                    f"local-buy-{int(datetime.now(UTC).timestamp() * 1000)}"
                    if filled > 0
                    else None
                ),
            )
            continue

        if max_position_value < quote.lastPrice:
            skip_reason = (
                f"profile cap (${max_position_value:.2f}) is below one share price "
                f"(${quote.lastPrice:.2f})"
            )
        elif available_cash < quote.lastPrice:
            skip_reason = (
                f"cash reserve keeps only ${available_cash:.2f} available for new buys"
            )
        else:
            skip_reason = "the shared allocation budget could not fund a full share"

        results_by_ticker[quote.ticker] = _build_auto_trade_response(
            quote=quote,
            selected_cadence=selected_cadence,
            normalized_user_id=normalized_user_id,
            action="hold",
            submitted=False,
            quantity=0,
            position_before=position_before,
            position_after=position_before,
            status_message=(
                f"Buy skipped for {quote.ticker}; {skip_reason}."
            ),
            cash_before=cash_before,
            cash_after=cash_before,
        )

    for quote in quotes:
        if quote.ticker in results_by_ticker:
            continue

        position_before = positions_by_ticker.get(quote.ticker, 0)
        if quote.signal == "bullish":
            status_message = (
                f"Holding {quote.ticker}; paper buy skipped because a position already exists."
            )
        elif quote.signal == "bearish":
            status_message = (
                f"No paper sell submitted because there is no open {quote.ticker} position."
            )
        else:
            status_message = "Model is neutral; holding position."

        results_by_ticker[quote.ticker] = _build_auto_trade_response(
            quote=quote,
            selected_cadence=selected_cadence,
            normalized_user_id=normalized_user_id,
            action="hold",
            submitted=False,
            quantity=0,
            position_before=position_before,
            position_after=position_before,
            status_message=status_message,
            cash_before=current_cash,
            cash_after=current_cash,
        )

    return [results_by_ticker[quote.ticker] for quote in quotes]


def _execute_alpaca_auto_trade(
    raw_ticker: str,
    model_profile: ModelProfile | str | None,
    selected_cadence: RefreshCadence,
    user_id: str | None,
) -> AutoTradeResponse:
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
    position_after = position_before

    if quote.signal == "bullish" and position_before == 0:
        quantity = DEFAULT_PAPER_BUY_SHARES
        order = _submit_market_order(client, quote.ticker, OrderSide.BUY, quantity)
        action = "buy"
        submitted = True
        order_id = str(getattr(order, "id", "")) or None
        position_after = position_before + quantity
        status_message = (
            f"Submitted paper buy for {quantity} share{'s' if quantity != 1 else ''} of {quote.ticker}."
        )
    elif quote.signal == "bearish" and position_before > 0:
        quantity = _partial_sell_quantity(position_before)
        order = _submit_market_order(client, quote.ticker, OrderSide.SELL, quantity)
        action = "sell"
        submitted = True
        order_id = str(getattr(order, "id", "")) or None
        position_after = max(0, position_before - quantity)
        status_message = (
            f"Submitted partial paper sell for {quantity} share{'s' if quantity != 1 else ''} "
            f"of {quote.ticker} ({position_before} -> {position_after} shares)."
        )
    elif quote.signal == "bullish":
        status_message = (
            f"Holding {quote.ticker}; paper buy skipped because a position already exists."
        )
    elif quote.signal == "bearish":
        status_message = (
            f"No paper sell submitted because there is no open {quote.ticker} position."
        )
    else:
        status_message = "Model is neutral; holding position."

    return _build_auto_trade_response(
        quote=quote,
        selected_cadence=selected_cadence,
        normalized_user_id=normalize_paper_user_id(user_id),
        action=action,
        submitted=submitted,
        quantity=quantity,
        position_before=position_before,
        position_after=position_after,
        status_message=status_message,
        order_id=order_id,
    )


def _execute_alpaca_manual_trade(
    raw_ticker: str,
    model_profile: ModelProfile | str | None,
    selected_cadence: RefreshCadence,
    user_id: str | None,
    requested_side: Literal["buy", "sell"],
    quantity: int,
) -> AutoTradeResponse:
    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")

    quote = build_quote_response(
        raw_ticker,
        include_chart=False,
        model_profile=model_profile,
        chart_type="line",
    )
    client = _trading_client()
    position_before = _position_before_shares(client, quote.ticker)
    order_id = None
    submitted = False
    position_after = position_before
    status_message = "No manual paper trade submitted."

    if requested_side == "buy":
        order = _submit_market_order(client, quote.ticker, OrderSide.BUY, quantity)
        order_id = str(getattr(order, "id", "")) or None
        submitted = True
        position_after = position_before + quantity
        status_message = (
            f"Submitted manual paper buy for {quantity} share{'s' if quantity != 1 else ''} "
            f"of {quote.ticker}."
        )
    elif position_before > 0:
        fill_quantity = min(quantity, position_before)
        order = _submit_market_order(client, quote.ticker, OrderSide.SELL, fill_quantity)
        order_id = str(getattr(order, "id", "")) or None
        submitted = True
        position_after = max(0, position_before - fill_quantity)
        quantity = fill_quantity
        status_message = (
            f"Submitted manual paper sell for {quantity} share{'s' if quantity != 1 else ''} "
            f"of {quote.ticker} ({position_before} -> {position_after} shares)."
        )
    else:
        quantity = 0
        status_message = (
            f"Manual paper sell skipped because there is no open {quote.ticker} position."
        )

    return _build_auto_trade_response(
        quote=quote,
        selected_cadence=selected_cadence,
        normalized_user_id=normalize_paper_user_id(user_id),
        action=requested_side if submitted else "hold",
        submitted=submitted,
        quantity=quantity if submitted else 0,
        position_before=position_before,
        position_after=position_after,
        status_message=status_message,
        order_id=order_id,
    )


def execute_auto_trade(
    raw_ticker: str,
    model_profile: ModelProfile | str | None = "risky",
    cadence: RefreshCadence | str | None = "1m",
    user_id: str | None = None,
    requested_side: str | None = None,
    quantity: int | None = None,
) -> AutoTradeResponse:
    selected_cadence = normalize_refresh_cadence(cadence)
    normalized_requested_side = _normalize_requested_side(requested_side)
    if normalized_requested_side is not None:
        if quantity is None or quantity <= 0:
            raise ValueError("Quantity must be greater than zero for manual paper trades.")
        if DEFAULT_PAPER_EXECUTION_BACKEND == "alpaca":
            return _execute_alpaca_manual_trade(
                raw_ticker,
                model_profile=model_profile,
                selected_cadence=selected_cadence,
                user_id=user_id,
                requested_side=normalized_requested_side,
                quantity=quantity,
            )
        return _execute_local_manual_trade(
            raw_ticker,
            model_profile=model_profile,
            selected_cadence=selected_cadence,
            user_id=user_id,
            requested_side=normalized_requested_side,
            quantity=quantity,
        )
    if DEFAULT_PAPER_EXECUTION_BACKEND == "alpaca":
        return _execute_alpaca_auto_trade(
            raw_ticker,
            model_profile=model_profile,
            selected_cadence=selected_cadence,
            user_id=user_id,
        )
    return _execute_local_auto_trade(
        raw_ticker,
        model_profile=model_profile,
        selected_cadence=selected_cadence,
        user_id=user_id,
    )


def execute_auto_trade_batch(
    raw_tickers: list[str],
    model_profile: ModelProfile | str | None = "risky",
    cadence: RefreshCadence | str | None = "1m",
    user_id: str | None = None,
) -> list[AutoTradeResponse]:
    selected_cadence = normalize_refresh_cadence(cadence)
    tickers = _normalize_auto_trade_tickers(raw_tickers)
    if DEFAULT_PAPER_EXECUTION_BACKEND == "alpaca":
        return [
            _execute_alpaca_auto_trade(
                ticker,
                model_profile=model_profile,
                selected_cadence=selected_cadence,
                user_id=user_id,
            )
            for ticker in tickers
        ]
    return _execute_local_auto_trade_batch(
        tickers,
        model_profile=model_profile,
        selected_cadence=selected_cadence,
        user_id=user_id,
    )
