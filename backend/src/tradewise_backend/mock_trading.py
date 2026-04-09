from __future__ import annotations

import os
from datetime import datetime, time, timedelta
from functools import lru_cache
from importlib import import_module
from pathlib import Path

from .features import DEFAULT_ANNUAL_RATE, DISCOUNT_DAYS, discount_factor
from .model_runtime import load_model_bundle, normalize_model_profile, predict_signal
from .schemas import MockTradingDayResponse, MockTradingStep, MockTradingSummary
from .engine import _price_profile, normalize_ticker, validate_ticker

DEFAULT_STARTING_CASH = 10_000.0
DEFAULT_MOCK_STEPS = 20
MIN_MOCK_STEPS = 8
MAX_MOCK_STEPS = 26
DATASET_REQUIRED_COLUMNS = {
    "date",
    "ticker",
    "close",
    "sma_5",
    "sma_20",
    "volatility_20d",
    "return_5d",
}


def _pd():
    return import_module("pandas")


def get_mock_trading_dataset_path() -> Path:
    configured = os.getenv("ML_TRAINING_DATASET_CSV")
    if configured:
        path = Path(configured)
        if path.is_absolute():
            return path
        return Path(__file__).resolve().parents[3] / path
    return Path(__file__).resolve().parents[3] / "tradewise_training_dataset.csv"


@lru_cache(maxsize=4)
def _load_mock_trading_dataset(
    dataset_path: str,
    mtime_ns: int,
):
    del mtime_ns
    return _pd().read_csv(dataset_path)


def build_mock_trading_day_response(
    raw_ticker: str,
    model_profile: str | None = None,
    steps: int = DEFAULT_MOCK_STEPS,
) -> MockTradingDayResponse:
    ticker = validate_ticker(normalize_ticker(raw_ticker))
    selected_model_profile = normalize_model_profile(model_profile) or "risky"
    if steps < MIN_MOCK_STEPS or steps > MAX_MOCK_STEPS:
        raise ValueError(f"Mock trading day steps must be between {MIN_MOCK_STEPS} and {MAX_MOCK_STEPS}.")

    bundle = load_model_bundle(profile=selected_model_profile)
    if bundle is None:
        raise RuntimeError(f"No trained {selected_model_profile} model artifact is available.")

    dataset_path = get_mock_trading_dataset_path()
    if not dataset_path.exists():
        raise RuntimeError(f"Mock trading dataset not found at {dataset_path}.")

    pd = _pd()
    dataset = _load_mock_trading_dataset(
        str(dataset_path.resolve()),
        dataset_path.stat().st_mtime_ns,
    )
    missing_columns = sorted(DATASET_REQUIRED_COLUMNS - set(dataset.columns))
    if missing_columns:
        raise RuntimeError(
            "Mock trading dataset is missing required columns: " + ", ".join(missing_columns)
        )

    ticker_rows = dataset[dataset["ticker"].astype(str).str.upper() == ticker].copy()
    if ticker_rows.empty:
        raise ValueError(f"No mock trading rows are available for {ticker}.")

    ticker_rows["date"] = pd.to_datetime(ticker_rows["date"], errors="coerce")
    ticker_rows["close"] = pd.to_numeric(ticker_rows["close"], errors="coerce")
    ticker_rows["sma_5"] = pd.to_numeric(ticker_rows["sma_5"], errors="coerce")
    ticker_rows["sma_20"] = pd.to_numeric(ticker_rows["sma_20"], errors="coerce")
    ticker_rows["volatility_20d"] = pd.to_numeric(ticker_rows["volatility_20d"], errors="coerce")
    ticker_rows["return_5d"] = pd.to_numeric(ticker_rows["return_5d"], errors="coerce")
    ticker_rows = ticker_rows.dropna(
        subset=["date", "close", "sma_5", "sma_20", "volatility_20d", "return_5d"]
    ).sort_values("date")

    if len(ticker_rows) < steps:
        raise ValueError(f"Need at least {steps} mock trading rows for {ticker}, got {len(ticker_rows)}.")

    selected_rows = ticker_rows.tail(steps).reset_index(drop=True)
    replay_date = selected_rows["date"].iloc[-1].strftime("%Y-%m-%d")
    trading_start = datetime.combine(datetime.now().date(), time(hour=9, minute=30))

    cash = DEFAULT_STARTING_CASH
    shares = 0
    buys = 0
    sells = 0
    holds = 0
    step_responses: list[MockTradingStep] = []

    for index, row in selected_rows.iterrows():
        features = {
            "shortMovingAverage": float(row["sma_5"]),
            "longMovingAverage": float(row["sma_20"]),
            "volatility": float(row["volatility_20d"]),
            "momentum": float(row["return_5d"]),
            "discountFactor": discount_factor(DISCOUNT_DAYS, DEFAULT_ANNUAL_RATE),
        }
        prediction = predict_signal(bundle, features)
        if prediction is None:
            raise RuntimeError("Could not generate a prediction for the mock trading day.")

        price = float(row["close"])
        previous_price = float(selected_rows.iloc[index - 1]["close"]) if index > 0 else price
        change_percent = round((price / previous_price - 1.0) * 100.0, 2) if index > 0 else 0.0

        action = "hold"
        if prediction.signal == "bullish" and cash >= price:
            cash -= price
            shares += 1
            buys += 1
            action = "buy"
        elif prediction.signal == "bearish" and shares > 0:
            cash += price
            shares -= 1
            sells += 1
            action = "sell"
        else:
            holds += 1

        equity = round(cash + shares * price, 2)
        slot = (trading_start + timedelta(minutes=index * 15)).strftime("%H:%M")
        step_responses.append(
            MockTradingStep(
                slot=slot,
                sourceDate=row["date"].strftime("%Y-%m-%d"),
                price=round(price, 2),
                changePercent=change_percent,
                signal=prediction.signal,
                confidence=prediction.confidence,
                action=action,
                cash=round(cash, 2),
                shares=shares,
                equity=equity,
            )
        )

    starting_price = round(float(selected_rows.iloc[0]["close"]), 2)
    ending_price = round(float(selected_rows.iloc[-1]["close"]), 2)
    ending_equity = round(cash + shares * float(selected_rows.iloc[-1]["close"]), 2)
    return_percent = round(((ending_equity / DEFAULT_STARTING_CASH) - 1.0) * 100.0, 2)

    return MockTradingDayResponse(
        ticker=ticker,
        companyName=_price_profile(ticker).company_name,
        modelProfile=selected_model_profile,
        modelVersion=bundle.model_version,
        sessionLabel=f"Compressed replay of the latest {steps} historical {ticker} rows as one mock trading day.",
        datasetSource=get_mock_trading_dataset_path().name,
        steps=step_responses,
        summary=MockTradingSummary(
            startingCash=DEFAULT_STARTING_CASH,
            startingPrice=starting_price,
            endingCash=round(cash, 2),
            endingPrice=ending_price,
            endingShares=shares,
            endingEquity=ending_equity,
            returnPercent=return_percent,
            buys=buys,
            sells=sells,
            holds=holds,
        ),
    )
