import os
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.stock_universe import (
    MAX_RECOMMENDATION_COUNT,
    recommend_stocks_for_sectors,
    reset_stock_universe_cache,
)


class StockUniverseTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_csv_path = os.environ.get("ML_STOCK_UNIVERSE_CSV")
        self.temp_file = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False)
        self.temp_file.write(
            "ticker,company_name,sector,priority\n"
            "AAPL,Apple Inc.,Technology,10\n"
            "MSFT,Microsoft Corp.,Technology,11\n"
            "NVDA,NVIDIA Corp.,Technology,12\n"
            "JNJ,Johnson & Johnson,Healthcare,10\n"
            "PFE,Pfizer Inc.,Healthcare,11\n"
            "JPM,JPMorgan Chase & Co.,Financial Services,10\n"
            "VOO,Vanguard S&P 500 ETF,ETF,1\n"
        )
        self.temp_file.close()
        os.environ["ML_STOCK_UNIVERSE_CSV"] = self.temp_file.name
        reset_stock_universe_cache()

    def tearDown(self) -> None:
        if self.previous_csv_path is None:
            os.environ.pop("ML_STOCK_UNIVERSE_CSV", None)
        else:
            os.environ["ML_STOCK_UNIVERSE_CSV"] = self.previous_csv_path
        reset_stock_universe_cache()
        Path(self.temp_file.name).unlink(missing_ok=True)

    def test_sector_filtering_prefers_selected_sectors(self) -> None:
        picks = recommend_stocks_for_sectors(["Technology"], count=3)
        self.assertEqual(len(picks), 3)
        self.assertTrue(all(item.sector == "Technology" for item in picks))

    def test_count_is_respected_with_etf_top_up(self) -> None:
        picks = recommend_stocks_for_sectors(["Financial Services"], count=3)
        self.assertEqual(len(picks), 3)
        sectors = {item.sector for item in picks}
        self.assertIn("Financial Services", sectors)
        self.assertIn("ETF", sectors)

    def test_invalid_count_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            recommend_stocks_for_sectors(["Technology"], count=MAX_RECOMMENDATION_COUNT + 1)


if __name__ == "__main__":
    unittest.main()
