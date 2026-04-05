"""Train and save a TradeWise classification model artifact.

This script uses the existing feature pipeline in `tradewise_backend.features`
so the saved model can be loaded directly by the FastAPI runtime.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

try:
    from xgboost import XGBClassifier
except ImportError:  # pragma: no cover - exercised only when xgboost is missing
    XGBClassifier = None

ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"
for candidate in (ROOT_DIR, SRC_DIR):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from training.data import DEFAULT_TICKERS, load_price_history
from tradewise_backend.features import DEFAULT_ANNUAL_RATE, DISCOUNT_DAYS, FEATURE_COLUMNS, build_training_frame, discount_factor
from tradewise_backend.model_runtime import ModelBundle, save_model_bundle
from tradewise_backend.schemas import SignalLabel

ENCODED_LABEL_MAP: dict[int, SignalLabel] = {
    0: "bearish",
    1: "neutral",
    2: "bullish",
}
RAW_TO_ENCODED_LABEL = {
    -1: 0,
    0: 1,
    1: 2,
}
CSV_REQUIRED_COLUMNS = {
    "ticker",
    "sma_5",
    "sma_20",
    "volatility_20d",
    "return_5d",
    "target_return_5d",
}


def build_dataset(
    tickers: Iterable[str],
    start: str | None = None,
    end: str | None = None,
    period: str = "1y",
    horizon_days: int = 5,
    neutral_band: float = 0.01,
    provider: str = "yfinance",
    interval: str = "1d",
    alpaca_feed: str = "delayed_sip",
) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []

    for ticker in tickers:
        history = load_price_history(
            ticker,
            start=start,
            end=end,
            period=period,
            provider=provider,
            interval=interval,
            alpaca_feed=alpaca_feed,
        )
        frame = build_training_frame(
            history["Close"],
            horizon_days=horizon_days,
            neutral_band=neutral_band,
        ).copy()
        frame["ticker"] = ticker
        frame["targetEncoded"] = frame["target"].map(RAW_TO_ENCODED_LABEL)
        frames.append(frame)

    if not frames:
        raise ValueError("No tickers were provided.")

    dataset = pd.concat(frames, ignore_index=True)
    if dataset.empty:
        raise ValueError("No training rows were generated from the selected tickers.")

    return dataset


def _should_stratify(target: pd.Series) -> bool:
    counts = target.value_counts()
    return len(counts) > 1 and int(counts.min()) >= 2


def build_dataset_from_csv(
    csv_path: str | Path,
    neutral_band: float = 0.01,
    annual_rate: float = DEFAULT_ANNUAL_RATE,
) -> pd.DataFrame:
    path = Path(csv_path).resolve()
    dataset = pd.read_csv(path)

    missing_columns = sorted(CSV_REQUIRED_COLUMNS - set(dataset.columns))
    if missing_columns:
        raise ValueError(
            "Dataset CSV is missing required columns: " + ", ".join(missing_columns)
        )

    translated = pd.DataFrame(
        {
            "ticker": dataset["ticker"].astype(str).str.upper(),
            "shortMovingAverage": pd.to_numeric(dataset["sma_5"], errors="coerce"),
            "longMovingAverage": pd.to_numeric(dataset["sma_20"], errors="coerce"),
            "volatility": pd.to_numeric(dataset["volatility_20d"], errors="coerce"),
            "momentum": pd.to_numeric(dataset["return_5d"], errors="coerce"),
            "discountFactor": discount_factor(DISCOUNT_DAYS, annual_rate),
        }
    )

    target_return = pd.to_numeric(dataset["target_return_5d"], errors="coerce")
    translated["target"] = np.select(
        [target_return > neutral_band, target_return < -neutral_band],
        [1, -1],
        default=0,
    ).astype(int)
    translated = translated.dropna(subset=[*FEATURE_COLUMNS, "target", "ticker"]).reset_index(drop=True)
    translated["targetEncoded"] = translated["target"].map(RAW_TO_ENCODED_LABEL)

    if translated.empty:
        raise ValueError("Dataset CSV did not produce any usable training rows.")

    return translated


def train_classifier(
    dataset: pd.DataFrame,
    test_size: float = 0.25,
    random_state: int = 42,
    n_estimators: int = 300,
    max_depth: int = 4,
    learning_rate: float = 0.05,
    training_provider: str = "yfinance",
    interval: str = "1d",
    alpaca_feed: str = "delayed_sip",
    dataset_source: str | None = None,
) -> tuple[ModelBundle, dict[str, object]]:
    if XGBClassifier is None:
        raise RuntimeError("Install xgboost to train the XGBClassifier model.")

    X = dataset.loc[:, FEATURE_COLUMNS]
    y = dataset["targetEncoded"].astype(int)

    stratify = y if _should_stratify(y) else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=stratify,
    )

    estimator = XGBClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        random_state=random_state,
        objective="multi:softprob",
        num_class=3,
        eval_metric="mlogloss",
        n_jobs=4,
        subsample=0.9,
        colsample_bytree=0.9,
    )
    estimator.fit(X_train, y_train)

    predictions = estimator.predict(X_test)
    accuracy = float(accuracy_score(y_test, predictions))
    report = classification_report(
        y_test,
        predictions,
        labels=sorted(ENCODED_LABEL_MAP),
        target_names=[ENCODED_LABEL_MAP[label] for label in sorted(ENCODED_LABEL_MAP)],
        zero_division=0,
        output_dict=True,
    )

    metrics = {
        "accuracy": round(accuracy, 4),
        "rows": int(len(dataset)),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "tickers": int(dataset["ticker"].nunique()),
        "training_provider": training_provider,
        "interval": interval,
        "alpaca_feed": alpaca_feed,
        "dataset_source": dataset_source,
        "class_distribution": {str(label): int(count) for label, count in y.value_counts().sort_index().items()},
        "classification_report": report,
    }

    model_version = f"xgb-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    bundle = ModelBundle(
        estimator=estimator,
        feature_columns=tuple(FEATURE_COLUMNS),
        label_map=ENCODED_LABEL_MAP,
        model_version=model_version,
        trained_at=datetime.now(timezone.utc).isoformat(),
        metadata=metrics,
    )
    return bundle, metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a TradeWise model artifact.")
    parser.add_argument(
        "--tickers",
        nargs="+",
        default=list(DEFAULT_TICKERS),
        help="Tickers to include in the training set.",
    )
    parser.add_argument(
        "--provider",
        default="yfinance",
        choices=["yfinance", "alpaca"],
        help="Market data provider used to build the training set.",
    )
    parser.add_argument(
        "--dataset-csv",
        default=None,
        help="Optional prebuilt CSV dataset. When provided, training uses this file instead of downloading market data.",
    )
    parser.add_argument("--start", default=None, help="Optional start date (YYYY-MM-DD).")
    parser.add_argument("--end", default=None, help="Optional end date (YYYY-MM-DD).")
    parser.add_argument(
        "--period",
        default="1y",
        help="History window used when start/end are omitted. For yfinance intraday intervals, requests are capped to 60 days.",
    )
    parser.add_argument(
        "--interval",
        default="1d",
        help="Bar interval for training data, e.g. 1d or 15m.",
    )
    parser.add_argument(
        "--alpaca-feed",
        default="delayed_sip",
        help="Alpaca feed to use when provider=alpaca.",
    )
    parser.add_argument(
        "--horizon-days",
        type=int,
        default=5,
        help="Forward return horizon used to build labels.",
    )
    parser.add_argument(
        "--neutral-band",
        type=float,
        default=0.01,
        help="Absolute forward return band treated as neutral.",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.25,
        help="Fraction of rows reserved for evaluation.",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="Random seed for train/test split and classifier.",
    )
    parser.add_argument(
        "--n-estimators",
        type=int,
        default=300,
        help="Number of boosting rounds in XGBoost.",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=4,
        help="Maximum tree depth for XGBoost.",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=0.05,
        help="Learning rate for XGBoost.",
    )
    parser.add_argument(
        "--artifact",
        default=None,
        help="Optional output artifact path. Defaults to ML_MODEL_ARTIFACT or the repo default.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.dataset_csv:
        dataset = build_dataset_from_csv(
            args.dataset_csv,
            neutral_band=args.neutral_band,
        )
        training_provider = "csv"
        dataset_source = str(Path(args.dataset_csv).resolve())
    else:
        dataset = build_dataset(
            tickers=args.tickers,
            start=args.start,
            end=args.end,
            period=args.period,
            horizon_days=args.horizon_days,
            neutral_band=args.neutral_band,
            provider=args.provider,
            interval=args.interval,
            alpaca_feed=args.alpaca_feed,
        )
        training_provider = args.provider
        dataset_source = None

    bundle, metrics = train_classifier(
        dataset,
        test_size=args.test_size,
        random_state=args.random_state,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        training_provider=training_provider,
        interval=args.interval,
        alpaca_feed=args.alpaca_feed,
        dataset_source=dataset_source,
    )

    artifact_path = save_model_bundle(
        bundle,
        path=Path(args.artifact).resolve() if args.artifact else None,
    )

    print(f"Saved model artifact to: {artifact_path}")
    print(f"Model version: {bundle.model_version}")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
