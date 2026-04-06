import unittest
from pathlib import Path
import sys

import numpy as np
import pandas as pd
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.main import app
from tradewise_backend.schemas import (
    AutoTradeResponse,
    MockTradingDayResponse,
    MockTradingStep,
    MockTradingSummary,
    QuoteResponse,
    TechnicalSnapshot,
)


def sample_close_history(length: int = 80) -> pd.Series:
    values = np.linspace(180.0, 205.0, length)
    return pd.Series(values)


def sample_ohlc_history(length: int = 80) -> pd.DataFrame:
    base = np.linspace(180.0, 205.0, length)
    return pd.DataFrame(
        {
            "Open": base - 0.4,
            "High": base + 1.2,
            "Low": base - 1.1,
            "Close": base,
        }
    )


def sample_mock_trading_day() -> MockTradingDayResponse:
    return MockTradingDayResponse(
        ticker="NVDA",
        companyName="NVIDIA Corp.",
        modelProfile="risky",
        modelVersion="xgb-test",
        sessionLabel="Compressed replay.",
        datasetSource="tradewise_training_dataset.csv",
        steps=[
            MockTradingStep(
                slot="09:30",
                sourceDate="2025-04-01",
                price=100.0,
                changePercent=0.0,
                signal="bullish",
                confidence=72.5,
                action="buy",
                cash=9900.0,
                shares=1,
                equity=10000.0,
            )
        ],
        summary=MockTradingSummary(
            startingCash=10000.0,
            startingPrice=100.0,
            endingCash=9900.0,
            endingPrice=100.0,
            endingShares=1,
            endingEquity=10000.0,
            returnPercent=0.0,
            buys=1,
            sells=0,
            holds=0,
        ),
    )


def sample_auto_trade_response() -> AutoTradeResponse:
    return AutoTradeResponse(
        ticker="NVDA",
        modelProfile="risky",
        cadence="1m",
        signal="bullish",
        confidence=72.5,
        action="buy",
        submitted=True,
        quantity=1,
        positionBeforeShares=0,
        orderId="paper-order-1",
        statusMessage="Submitted paper buy for 1 share of NVDA.",
        quote=QuoteResponse(
            ticker="NVDA",
            companyName="NVIDIA Corp.",
            lastPrice=100.0,
            changePercent=1.2,
            signal="bullish",
            confidence=72.5,
            explanation="test",
            modelVersion="xgb-test",
            selectedModelProfile="risky",
            selectedChartType="line",
            history=[99.0, 100.0],
            technicals=TechnicalSnapshot(
                shortMovingAverage=99.5,
                longMovingAverage=98.0,
                volatility=0.02,
                momentum=0.01,
                discountFactor=0.99,
            ),
            chartDataUri=None,
        ),
    )


class ApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["service"], "tradewise-ml")

    def test_quote_contract(self) -> None:
        with patch("tradewise_backend.engine.get_close_history", return_value=sample_close_history()):
            response = self.client.get(
                "/v1/quote",
                params={
                    "ticker": "AAPL",
                    "includeChart": "true",
                    "modelProfile": "neutral",
                    "chartType": "line",
                },
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["ticker"], "AAPL")
        self.assertIn(body["signal"], {"bullish", "bearish", "neutral"})
        self.assertIn("technicals", body)
        self.assertTrue(body["chartDataUri"].startswith("data:image/png;base64,"))
        self.assertEqual(body["selectedModelProfile"], "neutral")
        self.assertEqual(body["selectedChartType"], "line")

    def test_invalid_ticker_rejected(self) -> None:
        response = self.client.get("/v1/quote", params={"ticker": "bad ticker"})
        self.assertEqual(response.status_code, 400)

    def test_invalid_model_profile_rejected(self) -> None:
        response = self.client.get("/v1/quote", params={"ticker": "AAPL", "modelProfile": "aggressive"})
        self.assertEqual(response.status_code, 400)

    def test_invalid_chart_type_rejected(self) -> None:
        response = self.client.get("/v1/quote", params={"ticker": "AAPL", "chartType": "area"})
        self.assertEqual(response.status_code, 400)

    def test_candlestick_chart_contract(self) -> None:
        with (
            patch("tradewise_backend.engine.get_close_history", return_value=sample_close_history()),
            patch("tradewise_backend.engine.get_ohlc_history", return_value=sample_ohlc_history()),
        ):
            response = self.client.get(
                "/v1/quote",
                params={"ticker": "AAPL", "includeChart": "true", "chartType": "candlestick"},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["selectedChartType"], "candlestick")
        self.assertTrue(body["chartDataUri"].startswith("data:image/png;base64,"))

    def test_missing_model_profile_preserves_default_behavior(self) -> None:
        with patch("tradewise_backend.engine.get_close_history", return_value=sample_close_history()):
            response = self.client.get("/v1/quote", params={"ticker": "AAPL"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNone(body["selectedModelProfile"])
        self.assertEqual(body["selectedChartType"], "line")

    def test_mock_trading_day_contract(self) -> None:
        with patch(
            "tradewise_backend.main.build_mock_trading_day_response",
            return_value=sample_mock_trading_day(),
        ):
            response = self.client.get(
                "/v1/mock-day",
                params={"ticker": "NVDA", "modelProfile": "risky", "steps": "8"},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["ticker"], "NVDA")
        self.assertEqual(body["modelProfile"], "risky")
        self.assertEqual(len(body["steps"]), 1)

    def test_auto_trade_contract(self) -> None:
        with patch(
            "tradewise_backend.main.execute_auto_trade",
            return_value=sample_auto_trade_response(),
        ):
            response = self.client.post(
                "/v1/auto-trade",
                json={"ticker": "NVDA", "modelProfile": "risky", "cadence": "1m"},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["ticker"], "NVDA")
        self.assertEqual(body["action"], "buy")
        self.assertTrue(body["submitted"])


if __name__ == "__main__":
    unittest.main()
