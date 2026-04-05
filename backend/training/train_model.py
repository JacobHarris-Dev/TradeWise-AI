"""Barebones training scaffold.

Fill in feature engineering, labels, model selection, evaluation, and artifact
saving here.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable

ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"
for candidate in (ROOT_DIR, SRC_DIR):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from training.data import DEFAULT_TICKERS, load_price_history


def load_training_histories(
    tickers: Iterable[str] = DEFAULT_TICKERS,
    start: str | None = None,
    end: str | None = None,
):
    tickers = list(tickers)
    return {ticker: load_price_history(ticker, start=start, end=end) for ticker in tickers}


def train_model(
    tickers: Iterable[str] = DEFAULT_TICKERS,
    start: str | None = None,
    end: str | None = None,
):
    histories = load_training_histories(tickers=tickers, start=start, end=end)
    raise NotImplementedError(
        f"Loaded {len(histories)} histories. Add your own feature engineering, labels, "
        "model fitting, and artifact saving in train_model.py."
    )


def main() -> None:
    histories = load_training_histories()
    print(f"Loaded {len(histories)} ticker histories. Implement train_model() next.")


if __name__ == "__main__":
    main()
