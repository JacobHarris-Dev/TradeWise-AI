#!/usr/bin/env python3
"""
Build a production-ready training dataset for short-term stock prediction.

Dependencies:
    pip install yfinance pandas numpy

Output:
    tradewise_training_dataset.csv
"""

from __future__ import annotations

import sys
from typing import List

import numpy as np
import pandas as pd
import yfinance as yf

TICKERS: List[str] = [
    "AAPL",
    "GOOGL",
    "NVDA",
    "AMZN",
    "META",
    "TSLA",
    "SPY",
    "QQQ",
]
OUTPUT_FILE = "tradewise_training_dataset.csv"
PERIOD = "5y"
INTERVAL = "1d"


def compute_rsi(close: pd.Series, window: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    avg_loss = loss.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    rsi = rsi.mask(avg_loss == 0, 100.0)
    rsi = rsi.mask(avg_gain == 0, 0.0)
    rsi = rsi.mask((avg_gain == 0) & (avg_loss == 0), 50.0)
    return rsi


def download_ohlcv(ticker: str) -> pd.DataFrame:
    df = yf.download(
        tickers=ticker,
        period=PERIOD,
        interval=INTERVAL,
        auto_adjust=False,
        actions=False,
        progress=False,
        threads=False,
    )

    if df is None or df.empty:
        raise ValueError(f"No data returned for {ticker}.")

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df.reset_index()
    if "Date" not in df.columns:
        df = df.rename(columns={df.columns[0]: "Date"})

    required_cols = ["Date", "Open", "High", "Low", "Close", "Volume"]
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing expected columns for {ticker}: {missing_cols}")

    df = df[required_cols].copy()
    df["Date"] = pd.to_datetime(df["Date"]).dt.tz_localize(None)
    return df


def engineer_features(df: pd.DataFrame, ticker: str) -> pd.DataFrame:
    df = df.sort_values("Date").reset_index(drop=True).copy()
    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]

    df["return_1d"] = close.pct_change(periods=1, fill_method=None)
    df["return_5d"] = close.pct_change(periods=5, fill_method=None)
    df["return_10d"] = close.pct_change(periods=10, fill_method=None)

    df["volatility_10d"] = df["return_1d"].rolling(window=10, min_periods=10).std()
    df["volatility_20d"] = df["return_1d"].rolling(window=20, min_periods=20).std()

    df["sma_5"] = close.rolling(window=5, min_periods=5).mean()
    df["sma_20"] = close.rolling(window=20, min_periods=20).mean()
    df["sma_50"] = close.rolling(window=50, min_periods=50).mean()

    df["ema_12"] = close.ewm(span=12, adjust=False).mean()
    df["ema_26"] = close.ewm(span=26, adjust=False).mean()

    df["rsi_14"] = compute_rsi(close, window=14)

    df["macd"] = df["ema_12"] - df["ema_26"]
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"] = df["macd"] - df["macd_signal"]

    prev_close = close.shift(1)
    true_range = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    df["atr_14"] = true_range.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()

    bb_std = close.rolling(window=20, min_periods=20).std()
    df["bb_mid"] = close.rolling(window=20, min_periods=20).mean()
    df["bb_upper"] = df["bb_mid"] + (2 * bb_std)
    df["bb_lower"] = df["bb_mid"] - (2 * bb_std)

    volume_mean_20 = volume.rolling(window=20, min_periods=20).mean()
    volume_std_20 = volume.rolling(window=20, min_periods=20).std()
    df["volume_zscore_20d"] = (volume - volume_mean_20) / volume_std_20.replace(0, np.nan)

    df["high_low_range"] = (high - low) / close.replace(0, np.nan)

    future_close_1d = close.shift(-1)
    future_close_5d = close.shift(-5)

    df["target_up_1d"] = np.where(
        future_close_1d.notna(),
        (future_close_1d > close).astype(int),
        np.nan,
    )
    df["target_up_5d"] = np.where(
        future_close_5d.notna(),
        (future_close_5d > close).astype(int),
        np.nan,
    )
    df["target_return_5d"] = np.where(
        future_close_5d.notna(),
        (future_close_5d / close) - 1,
        np.nan,
    )

    df["ticker"] = ticker
    df["date"] = df["Date"].dt.strftime("%Y-%m-%d")

    final_columns = [
        "date",
        "ticker",
        "Open",
        "High",
        "Low",
        "Close",
        "Volume",
        "return_1d",
        "return_5d",
        "return_10d",
        "volatility_10d",
        "volatility_20d",
        "sma_5",
        "sma_20",
        "sma_50",
        "ema_12",
        "ema_26",
        "rsi_14",
        "macd",
        "macd_signal",
        "macd_hist",
        "atr_14",
        "bb_mid",
        "bb_upper",
        "bb_lower",
        "volume_zscore_20d",
        "high_low_range",
        "target_up_1d",
        "target_up_5d",
        "target_return_5d",
    ]

    df = df[final_columns].rename(
        columns={
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume": "volume",
        }
    )

    required_feature_and_target_cols = [
        "return_1d",
        "return_5d",
        "return_10d",
        "volatility_10d",
        "volatility_20d",
        "sma_5",
        "sma_20",
        "sma_50",
        "ema_12",
        "ema_26",
        "rsi_14",
        "macd",
        "macd_signal",
        "macd_hist",
        "atr_14",
        "bb_mid",
        "bb_upper",
        "bb_lower",
        "volume_zscore_20d",
        "high_low_range",
        "target_up_1d",
        "target_up_5d",
        "target_return_5d",
    ]

    df = df.dropna(subset=required_feature_and_target_cols).copy()
    df["target_up_1d"] = df["target_up_1d"].astype(int)
    df["target_up_5d"] = df["target_up_5d"].astype(int)
    return df


def print_class_balance(df: pd.DataFrame, target_col: str) -> None:
    counts = df[target_col].value_counts().sort_index()
    percentages = df[target_col].value_counts(normalize=True).sort_index() * 100

    print(f"\nClass balance for {target_col}:")
    for cls in counts.index:
        print(f"  class {int(cls)}: {counts[cls]} rows ({percentages[cls]:.2f}%)")


def print_missing_summary(df: pd.DataFrame) -> None:
    missing_summary = df.isna().sum().sort_values(ascending=False)
    print("\nMissing-value summary by column:")
    print(missing_summary.to_string())


def print_time_split_guidance(df: pd.DataFrame) -> None:
    unique_dates = sorted(df["date"].unique())
    if len(unique_dates) < 3:
        print("\nNot enough dates to create a train/validation/test example split.")
        return

    train_end_idx = max(int(len(unique_dates) * 0.70) - 1, 0)
    val_end_idx = max(int(len(unique_dates) * 0.85) - 1, train_end_idx + 1)
    val_end_idx = min(val_end_idx, len(unique_dates) - 2)

    train_end_date = unique_dates[train_end_idx]
    val_end_date = unique_dates[val_end_idx]

    train_mask = df["date"] <= train_end_date
    val_mask = (df["date"] > train_end_date) & (df["date"] <= val_end_date)
    test_mask = df["date"] > val_end_date

    print("\nTime-based split guidance (example, not random):")
    print("  Use the same date cutoffs across every ticker.")
    print(f"  Train:      <= {train_end_date} ({train_mask.sum()} rows)")
    print(f"  Validation: > {train_end_date} and <= {val_end_date} ({val_mask.sum()} rows)")
    print(f"  Test:       > {val_end_date} ({test_mask.sum()} rows)")


def main() -> None:
    frames = []
    errors = []

    for ticker in TICKERS:
        print(f"Downloading and processing {ticker}...")
        try:
            raw_df = download_ohlcv(ticker)
            feature_df = engineer_features(raw_df, ticker)
            frames.append(feature_df)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{ticker}: {exc}")

    if errors:
        print("\nThe following tickers failed:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)

    dataset = pd.concat(frames, ignore_index=True)

    before_dedup = len(dataset)
    dataset = dataset.drop_duplicates()
    dataset = dataset.drop_duplicates(subset=["ticker", "date"], keep="last")
    duplicates_removed = before_dedup - len(dataset)

    dataset = dataset.sort_values(["ticker", "date"]).reset_index(drop=True)

    dataset.to_csv(OUTPUT_FILE, index=False)

    print(f"\nSaved dataset to {OUTPUT_FILE}")
    print(f"Rows: {dataset.shape[0]}")
    print(f"Columns: {dataset.shape[1]}")
    print(f"Duplicate rows removed: {duplicates_removed}")

    print_class_balance(dataset, "target_up_1d")
    print_class_balance(dataset, "target_up_5d")
    print_missing_summary(dataset)
    print_time_split_guidance(dataset)


if __name__ == "__main__":
    main()