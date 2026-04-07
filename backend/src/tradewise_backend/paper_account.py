from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock

from .schemas import PaperAccountPosition, PaperAccountResponse

DEFAULT_PAPER_STARTING_CASH = float(
    os.getenv("ML_PAPER_STARTING_CASH", "10000").strip() or "10000"
)


@dataclass
class _PaperPositionState:
    shares: int
    avg_entry_price: float


@dataclass
class _PaperAccountState:
    cash: float
    holdings: dict[str, _PaperPositionState] = field(default_factory=dict)
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


_paper_accounts_lock = Lock()
_paper_accounts: dict[str, _PaperAccountState] = {}


def normalize_paper_user_id(raw_user_id: str | None) -> str:
    user_id = (raw_user_id or "guest").strip()
    if not user_id:
        return "guest"
    return user_id


def normalize_paper_ticker(raw_ticker: str) -> str:
    ticker = raw_ticker.strip().upper()
    if not ticker:
        raise ValueError("Ticker is required.")
    return ticker


def _get_or_create_account_state(user_id: str) -> _PaperAccountState:
    account = _paper_accounts.get(user_id)
    if account is None:
        account = _PaperAccountState(cash=round(DEFAULT_PAPER_STARTING_CASH, 2))
        _paper_accounts[user_id] = account
    return account


def get_paper_account(user_id: str | None) -> PaperAccountResponse:
    normalized_user_id = normalize_paper_user_id(user_id)
    with _paper_accounts_lock:
        account = _get_or_create_account_state(normalized_user_id)
        positions = [
            PaperAccountPosition(
                ticker=ticker,
                shares=state.shares,
                avgEntryPrice=round(state.avg_entry_price, 4),
            )
            for ticker, state in sorted(account.holdings.items())
            if state.shares > 0
        ]
        return PaperAccountResponse(
            userId=normalized_user_id,
            startingCash=round(DEFAULT_PAPER_STARTING_CASH, 2),
            cash=round(account.cash, 2),
            positions=positions,
            updatedAt=account.updated_at.isoformat(),
        )


def apply_paper_buy(
    user_id: str | None,
    ticker: str,
    price: float,
    quantity: int,
) -> tuple[int, int, float, float]:
    normalized_user_id = normalize_paper_user_id(user_id)
    with _paper_accounts_lock:
        account = _get_or_create_account_state(normalized_user_id)
        cash_before = account.cash

        if quantity <= 0 or price <= 0:
            position_after = account.holdings.get(
                ticker,
                _PaperPositionState(0, 0.0),
            ).shares
            return 0, position_after, cash_before, account.cash

        affordable = int(account.cash // price)
        fill_qty = min(quantity, affordable)
        if fill_qty <= 0:
            position_after = account.holdings.get(ticker, _PaperPositionState(0, 0.0)).shares
            return 0, position_after, cash_before, account.cash

        total_cost = price * fill_qty
        prior = account.holdings.get(ticker)
        if prior is None:
            account.holdings[ticker] = _PaperPositionState(
                shares=fill_qty,
                avg_entry_price=price,
            )
        else:
            combined_shares = prior.shares + fill_qty
            weighted_avg = ((prior.avg_entry_price * prior.shares) + total_cost) / combined_shares
            prior.shares = combined_shares
            prior.avg_entry_price = weighted_avg

        account.cash = round(account.cash - total_cost, 2)
        account.updated_at = datetime.now(UTC)
        position_after = account.holdings[ticker].shares
        return fill_qty, position_after, cash_before, account.cash


def apply_paper_sell(
    user_id: str | None,
    ticker: str,
    price: float,
    quantity: int,
) -> tuple[int, int, float, float]:
    normalized_user_id = normalize_paper_user_id(user_id)
    with _paper_accounts_lock:
        account = _get_or_create_account_state(normalized_user_id)
        cash_before = account.cash
        prior = account.holdings.get(ticker)
        if prior is None or prior.shares <= 0 or quantity <= 0 or price <= 0:
            position_after = prior.shares if prior is not None else 0
            return 0, position_after, cash_before, account.cash

        fill_qty = min(quantity, prior.shares)
        proceeds = price * fill_qty
        prior.shares -= fill_qty
        if prior.shares == 0:
            del account.holdings[ticker]

        account.cash = round(account.cash + proceeds, 2)
        account.updated_at = datetime.now(UTC)
        position_after = account.holdings.get(ticker).shares if ticker in account.holdings else 0
        return fill_qty, position_after, cash_before, account.cash


def grant_paper_position(
    user_id: str | None,
    ticker: str,
    shares: int,
    avg_entry_price: float,
    cash: float | None = None,
) -> PaperAccountResponse:
    normalized_user_id = normalize_paper_user_id(user_id)
    normalized_ticker = normalize_paper_ticker(ticker)
    if shares < 0:
        raise ValueError("Shares must be zero or greater.")
    if avg_entry_price <= 0:
        raise ValueError("Average entry price must be greater than zero.")

    with _paper_accounts_lock:
        account = _get_or_create_account_state(normalized_user_id)
        if shares == 0:
            account.holdings.pop(normalized_ticker, None)
        else:
            account.holdings[normalized_ticker] = _PaperPositionState(
                shares=shares,
                avg_entry_price=avg_entry_price,
            )
        if cash is not None:
            account.cash = round(cash, 2)
        account.updated_at = datetime.now(UTC)

        positions = [
            PaperAccountPosition(
                ticker=held_ticker,
                shares=state.shares,
                avgEntryPrice=round(state.avg_entry_price, 4),
            )
            for held_ticker, state in sorted(account.holdings.items())
            if state.shares > 0
        ]
        return PaperAccountResponse(
            userId=normalized_user_id,
            startingCash=round(DEFAULT_PAPER_STARTING_CASH, 2),
            cash=round(account.cash, 2),
            positions=positions,
            updatedAt=account.updated_at.isoformat(),
        )
