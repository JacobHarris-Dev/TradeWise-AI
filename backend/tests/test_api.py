import unittest
from datetime import UTC, datetime
from pathlib import Path
import sys

import numpy as np
import pandas as pd
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.main import app
from tradewise_backend.news import NewsContext, NewsContextSnapshot
from tradewise_backend.schemas import (
    AutoTradeBatchResponse,
    AutoTradeResponse,
    MockTradingDayResponse,
    MockTradingStep,
    MockTradingSummary,
    PaperAccountPerformanceResponse,
    PaperAccountPerformancePoint,
    PaperAccountPerformancePosition,
    PriceSnapshotResponse,
    QuoteResponse,
    TechnicalSnapshot,
)
from tradewise_backend.stock_universe import StockUniverseRow


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
        positionAfterShares=1,
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


def sample_auto_trade_batch_response() -> AutoTradeBatchResponse:
    return AutoTradeBatchResponse(results=[sample_auto_trade_response()])


def sample_price_snapshot() -> PriceSnapshotResponse:
    return PriceSnapshotResponse(
        ticker="AAPL",
        companyName="Apple Inc.",
        lastPrice=188.42,
        changePercent=0.52,
    )


def sample_paper_account_performance_response() -> PaperAccountPerformanceResponse:
    return PaperAccountPerformanceResponse(
        userId="test-user",
        startingCash=10000.0,
        cash=8200.0,
        positionsValue=1900.0,
        totalEquity=10100.0,
        dayChange=100.0,
        dayChangePercent=1.0,
        baselineEquity=10000.0,
        positions=[
            PaperAccountPerformancePosition(
                ticker="NVDA",
                companyName="NVIDIA Corp.",
                shares=10,
                avgEntryPrice=180.0,
                currentPrice=190.0,
                marketValue=1900.0,
                changePercent=1.25,
            )
        ],
        points=[
            PaperAccountPerformancePoint(
                timestamp="2026-04-07T09:30:00+00:00",
                totalEquity=10000.0,
                cash=8200.0,
                positionsValue=1800.0,
            ),
            PaperAccountPerformancePoint(
                timestamp="2026-04-07T10:00:00+00:00",
                totalEquity=10100.0,
                cash=8200.0,
                positionsValue=1900.0,
            ),
        ],
        updatedAt="2026-04-07T10:00:00+00:00",
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
        with (
            patch("tradewise_backend.engine.get_close_history", return_value=sample_close_history()),
            patch(
                "tradewise_backend.engine.build_news_context",
                return_value=NewsContext(
                    summary="Apple headlines stay focused on AI demand and product momentum.",
                    sentiment="positive",
                    topics=("ai", "products"),
                    headlines=("Apple headlines stay focused on AI demand.",),
                    article_count=1,
                ),
            ),
        ):
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
        self.assertEqual(body["newsSentiment"], "positive")
        self.assertEqual(body["newsTopics"], ["ai", "products"])

    def test_price_snapshots_contract(self) -> None:
        with patch(
            "tradewise_backend.main.build_price_snapshots",
            return_value=[sample_price_snapshot()],
        ):
            response = self.client.get(
                "/v1/price-snapshots",
                params={"tickers": "AAPL,NVDA"},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["ticker"], "AAPL")
        self.assertIn("lastPrice", body[0])

    def test_stock_recommendations_contract(self) -> None:
        with patch(
            "tradewise_backend.main.recommend_stocks_for_sectors",
            return_value=[
                StockUniverseRow(
                    ticker="AAPL",
                    company_name="Apple Inc.",
                    sector="Technology",
                    priority=10,
                ),
                StockUniverseRow(
                    ticker="MSFT",
                    company_name="Microsoft Corp.",
                    sector="Technology",
                    priority=11,
                ),
                StockUniverseRow(
                    ticker="VOO",
                    company_name="Vanguard S&P 500 ETF",
                    sector="ETF",
                    priority=1,
                ),
            ],
        ):
            response = self.client.get(
                "/v1/stock-universe/recommendations",
                params={"sectors": "Technology,ETF", "count": "3"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 3)
        self.assertEqual(body["results"][0]["ticker"], "AAPL")
        self.assertEqual(body["results"][0]["sector"], "Technology")

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

    def test_auto_trade_batch_contract(self) -> None:
        with patch(
            "tradewise_backend.main.execute_auto_trade_batch",
            return_value=sample_auto_trade_batch_response().results,
        ):
            response = self.client.post(
                "/v1/auto-trade/batch",
                json={"tickers": ["NVDA", "AAPL"], "modelProfile": "risky", "cadence": "1m"},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["ticker"], "NVDA")
        self.assertEqual(body["results"][0]["action"], "buy")

    def test_paper_account_contract(self) -> None:
        response = self.client.get("/v1/paper-account", params={"userId": "test-user"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["userId"], "test-user")
        self.assertGreaterEqual(body["startingCash"], 0)
        self.assertGreaterEqual(body["cash"], 0)
        self.assertIn("positions", body)

    def test_paper_account_grant_contract(self) -> None:
        response = self.client.post(
            "/v1/paper-account/grant",
            json={
                "userId": "test-user",
                "ticker": "NVDA",
                "shares": 100,
                "avgEntryPrice": 176.73,
                "cash": 10000.0,
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["userId"], "test-user")
        self.assertEqual(body["cash"], 10000.0)
        self.assertEqual(body["positions"][0]["ticker"], "NVDA")
        self.assertEqual(body["positions"][0]["shares"], 100)

    def test_paper_account_performance_contract(self) -> None:
        with patch(
            "tradewise_backend.main.build_paper_account_performance",
            return_value=sample_paper_account_performance_response(),
        ):
            response = self.client.get(
                "/v1/paper-account/performance",
                params={"userId": "test-user"},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["userId"], "test-user")
        self.assertEqual(body["totalEquity"], 10100.0)
        self.assertEqual(body["positions"][0]["ticker"], "NVDA")
        self.assertEqual(len(body["points"]), 2)

    def test_news_report_contract(self) -> None:
        snapshot = NewsContextSnapshot(
            context=NewsContext(
                summary="Apple news stays focused on AI demand and enterprise rollouts.",
                sentiment="positive",
                topics=("ai", "products"),
                headlines=("Apple news stays focused on AI demand.",),
                article_count=1,
            ),
            fetched_at=datetime.now(tz=UTC),
            from_cache=False,
            refresh_seconds=120,
        )
        quote = QuoteResponse(
            ticker="AAPL",
            companyName="Apple Inc.",
            lastPrice=100.0,
            changePercent=1.2,
            signal="bullish",
            confidence=72.5,
            explanation="test",
            modelVersion="xgb-test",
            selectedModelProfile="neutral",
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
            newsSummary=snapshot.context.summary,
            newsSentiment=snapshot.context.sentiment,
            newsTopics=list(snapshot.context.topics),
            newsHeadlines=list(snapshot.context.headlines),
        )

        with (
            patch("tradewise_backend.main.build_news_context_snapshot", return_value=snapshot),
            patch("tradewise_backend.main.build_quote_response", return_value=quote),
            patch(
                "tradewise_backend.main.build_student_news_reasoning",
                return_value=type("Reasoning", (), {"text": "Simple college-level reasoning.", "source": "qwen"})(),
            ),
        ):
            response = self.client.get(
                "/v1/news-report",
                params={
                    "ticker": "AAPL",
                    "modelProfile": "neutral",
                    "refreshSeconds": "120",
                },
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["ticker"], "AAPL")
        self.assertEqual(body["signal"], "bullish")
        self.assertEqual(body["fromCache"], False)
        self.assertEqual(body["refreshSeconds"], 120)
        self.assertEqual(body["newsSentiment"], "positive")
        self.assertEqual(body["report"], "Simple college-level reasoning.")
        self.assertEqual(body["studentReasoning"], "Simple college-level reasoning.")
        self.assertEqual(body["reasoningSource"], "qwen")


if __name__ == "__main__":
    unittest.main()
