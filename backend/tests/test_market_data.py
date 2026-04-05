import unittest
from pathlib import Path
import sys
from unittest.mock import patch

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.market_data import get_close_history


class MarketDataTestCase(unittest.TestCase):
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
