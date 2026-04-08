import unittest
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.paper_account import get_paper_account, grant_paper_position
from tradewise_backend.paper_trading import execute_auto_trade_batch
from tradewise_backend.schemas import QuoteResponse, TechnicalSnapshot


def sample_quote(
    ticker: str,
    *,
    signal: str,
    confidence: float,
    last_price: float,
) -> QuoteResponse:
    return QuoteResponse(
        ticker=ticker,
        companyName=f"{ticker} Corp.",
        lastPrice=last_price,
        changePercent=1.2,
        signal=signal,  # type: ignore[arg-type]
        confidence=confidence,
        explanation="test",
        modelVersion="xgb-test",
        selectedModelProfile="risky",
        selectedChartType="line",
        history=[last_price - 1, last_price],
        technicals=TechnicalSnapshot(
            shortMovingAverage=last_price - 0.5,
            longMovingAverage=last_price - 1.0,
            volatility=0.02,
            momentum=0.01,
            discountFactor=0.99,
        ),
        chartDataUri=None,
    )


class PaperTradingTestCase(unittest.TestCase):
    def test_execute_auto_trade_batch_splits_cash_across_bullish_symbols(self) -> None:
        user_id = "batch-allocation-user"
        grant_paper_position(user_id, "AAPL", 0, 1.0, cash=1000.0)
        grant_paper_position(user_id, "MSFT", 0, 1.0)
        grant_paper_position(user_id, "NVDA", 0, 1.0)

        quotes = {
            "AAPL": sample_quote("AAPL", signal="bullish", confidence=92.0, last_price=400.0),
            "MSFT": sample_quote("MSFT", signal="bullish", confidence=81.0, last_price=400.0),
            "NVDA": sample_quote("NVDA", signal="bullish", confidence=73.0, last_price=400.0),
        }

        with patch(
            "tradewise_backend.paper_trading.build_quote_response",
            side_effect=lambda raw_ticker, **_kwargs: quotes[raw_ticker],
        ):
            results = execute_auto_trade_batch(
                ["AAPL", "MSFT", "NVDA"],
                model_profile="risky",
                cadence="1m",
                user_id=user_id,
            )

        self.assertEqual([result.ticker for result in results], ["AAPL", "MSFT", "NVDA"])
        self.assertEqual(results[0].action, "buy")
        self.assertEqual(results[0].quantity, 1)
        self.assertEqual(results[1].action, "buy")
        self.assertEqual(results[1].quantity, 1)
        self.assertEqual(results[2].action, "hold")
        self.assertEqual(results[2].quantity, 0)

        account = get_paper_account(user_id)
        self.assertEqual(account.cash, 200.0)
        self.assertEqual(
            [(position.ticker, position.shares) for position in account.positions],
            [("AAPL", 1), ("MSFT", 1)],
        )

    def test_execute_auto_trade_batch_caps_single_symbol_concentration(self) -> None:
        user_id = "single-symbol-cap-user"
        grant_paper_position(user_id, "NVDA", 0, 1.0, cash=1000.0)

        quotes = {
            "NVDA": sample_quote("NVDA", signal="bullish", confidence=92.0, last_price=100.0),
        }

        with patch(
            "tradewise_backend.paper_trading.build_quote_response",
            side_effect=lambda raw_ticker, **_kwargs: quotes[raw_ticker],
        ):
            results = execute_auto_trade_batch(
                ["NVDA"],
                model_profile="risky",
                cadence="1m",
                user_id=user_id,
            )

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].ticker, "NVDA")
        self.assertEqual(results[0].action, "buy")
        self.assertEqual(results[0].quantity, 5)

        account = get_paper_account(user_id)
        self.assertEqual(account.cash, 500.0)
        self.assertEqual(
            [(position.ticker, position.shares) for position in account.positions],
            [("NVDA", 5)],
        )


if __name__ == "__main__":
    unittest.main()
