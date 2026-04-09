import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
import sys
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend import market_data
from tradewise_backend.market_data import (
    YFINANCE_INTRADAY_LOOKBACK_DAYS,
    download_price_history,
    get_close_history,
)


class MarketDataTestCase(unittest.TestCase):
    def setUp(self) -> None:
        with market_data._PRICE_HISTORY_CACHE_LOCK:
            market_data._PRICE_HISTORY_CACHE.clear()
        with market_data._ALPACA_SHARED_LOCK:
            market_data._ALPACA_CLIENT_INSTANCE = None
            market_data._ALPACA_LAST_REQUEST_AT_MONO = 0.0

    def test_download_price_history_rejects_invalid_provider(self) -> None:
        with self.assertRaisesRegex(ValueError, "Invalid market data provider"):
            download_price_history("AAPL", provider="polygon")

    def test_download_price_history_uses_yfinance_helper_by_default(self) -> None:
        history = pd.DataFrame({"Close": np.arange(10.0, 20.0)})

        with (
            patch("tradewise_backend.market_data.DEFAULT_MARKET_DATA_PROVIDER", "yfinance"),
            patch(
                "tradewise_backend.market_data._download_yfinance_price_history",
                return_value=history,
            ) as mock_yfinance,
        ):
            returned = download_price_history("aapl", interval="15m")

        self.assertTrue(returned.equals(history))
        mock_yfinance.assert_called_once_with(
            "AAPL",
            start=None,
            end=None,
            period="1y",
            interval="15m",
        )

    def test_download_price_history_caps_open_ended_yfinance_intraday_requests(self) -> None:
        history = pd.DataFrame({"Close": np.arange(10.0, 20.0)}, index=pd.date_range("2024-01-01", periods=10))
        mock_yfinance = Mock()
        mock_yfinance.download.return_value = history

        with patch("tradewise_backend.market_data.yf", new=mock_yfinance):
            returned = download_price_history("AAPL", interval="15m", provider="yfinance")

        self.assertEqual(len(returned), len(history))
        kwargs = mock_yfinance.download.call_args.kwargs
        self.assertEqual(kwargs["interval"], "15m")
        self.assertNotIn("period", kwargs)
        self.assertIsInstance(kwargs["start"], datetime)
        self.assertIsInstance(kwargs["end"], datetime)
        self.assertLessEqual(
            kwargs["end"] - kwargs["start"],
            timedelta(days=YFINANCE_INTRADAY_LOOKBACK_DAYS),
        )

    def test_download_price_history_rejects_yfinance_intraday_ranges_beyond_sixty_days(self) -> None:
        start = "2024-01-01"
        end = "2024-04-15"

        with self.assertRaisesRegex(ValueError, "limited to the last 60 days"):
            download_price_history("AAPL", interval="15m", provider="yfinance", start=start, end=end)

    def test_download_price_history_uses_alpaca_helper_when_requested(self) -> None:
        history = pd.DataFrame({"Close": np.arange(10.0, 20.0)})

        with patch(
            "tradewise_backend.market_data._download_alpaca_price_history",
            return_value=history,
        ) as mock_alpaca:
            returned = download_price_history(
                "msft",
                provider="alpaca",
                interval="15m",
                alpaca_feed="delayed_sip",
            )

        self.assertTrue(returned.equals(history))
        mock_alpaca.assert_called_once_with(
            "MSFT",
            start=None,
            end=None,
            period="1y",
            interval="15m",
            feed="delayed_sip",
        )

    def test_download_price_history_normalizes_common_ticker_typo(self) -> None:
        history = pd.DataFrame({"Close": np.arange(10.0, 20.0)})

        with patch(
            "tradewise_backend.market_data._download_yfinance_price_history",
            return_value=history,
        ) as mock_yfinance:
            returned = download_price_history("APPL", provider="yfinance", interval="1d")

        self.assertTrue(returned.equals(history))
        mock_yfinance.assert_called_once_with(
            "AAPL",
            start=None,
            end=None,
            period="1y",
            interval="1d",
        )

    def test_download_price_history_uses_cache_for_identical_requests(self) -> None:
        history = pd.DataFrame({"Close": np.arange(10.0, 20.0)})

        with (
            patch.dict("tradewise_backend.market_data._PRICE_HISTORY_CACHE", {}, clear=True),
            patch.dict("os.environ", {"ML_MARKET_DATA_CACHE_SECONDS": "60"}, clear=False),
            patch(
                "tradewise_backend.market_data._download_yfinance_price_history",
                return_value=history,
            ) as mock_yfinance,
        ):
            first = download_price_history("AAPL", provider="yfinance")
            second = download_price_history("AAPL", provider="yfinance")

        self.assertTrue(first.equals(history))
        self.assertTrue(second.equals(history))
        self.assertIsNot(first, second)
        mock_yfinance.assert_called_once()

    def test_download_alpaca_price_history_retries_on_rate_limit(self) -> None:
        bars_df = pd.DataFrame(
            {"close": [100.0]},
            index=pd.DatetimeIndex([pd.Timestamp("2024-01-02", tz=UTC)]),
        )
        mock_bars = Mock()
        mock_bars.df = bars_df
        client = Mock()
        client.get_stock_bars = Mock(
            side_effect=[
                RuntimeError('{"message": "too many requests."}'),
                mock_bars,
            ]
        )

        with (
            patch("tradewise_backend.market_data._alpaca_client_locked", return_value=client),
            patch("tradewise_backend.market_data.StockBarsRequest", Mock()),
            patch("tradewise_backend.market_data._parse_alpaca_timeframe", return_value=Mock()),
            patch("tradewise_backend.market_data._parse_alpaca_feed", return_value=Mock()),
            patch(
                "tradewise_backend.market_data._resolve_alpaca_end",
                return_value=datetime.now(UTC),
            ),
            patch("tradewise_backend.market_data.time.sleep", Mock()),
        ):
            result = market_data._download_alpaca_price_history("AAPL")

        self.assertEqual(client.get_stock_bars.call_count, 2)
        self.assertIn("Close", result.columns)
        self.assertEqual(float(result["Close"].iloc[-1]), 100.0)

    def test_get_close_history_handles_2d_close_frame(self) -> None:
        rows = 65
        dates = pd.date_range("2024-01-01", periods=rows, freq="B")
        first_close = np.arange(100.0, 100.0 + rows)
        second_close = np.arange(1000.0, 1000.0 + rows)
        open_values = np.arange(90.0, 90.0 + rows)

        history = pd.DataFrame(
            np.column_stack([first_close, second_close, open_values]),
            index=dates,
            columns=["Close", "Close", "Open"],
        )

        with patch("tradewise_backend.market_data.download_price_history", return_value=history):
            close = get_close_history("AAPL", length=60)

        self.assertEqual(len(close), 60)
        self.assertEqual(close.iloc[0], 105.0)
        self.assertEqual(close.iloc[-1], 164.0)


if __name__ == "__main__":
    unittest.main()
