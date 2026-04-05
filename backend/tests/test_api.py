import unittest
from pathlib import Path
import sys

import numpy as np
import pandas as pd
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.main import app


def sample_close_history(length: int = 80) -> pd.Series:
    values = np.linspace(180.0, 205.0, length)
    return pd.Series(values)


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
            response = self.client.get("/v1/quote", params={"ticker": "AAPL", "includeChart": "true"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["ticker"], "AAPL")
        self.assertIn(body["signal"], {"bullish", "bearish", "neutral"})
        self.assertIn("technicals", body)
        self.assertTrue(body["chartDataUri"].startswith("data:image/png;base64,"))

    def test_invalid_ticker_rejected(self) -> None:
        response = self.client.get("/v1/quote", params={"ticker": "bad ticker"})
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
