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
        self.previous_random_seed = os.environ.get("ML_STOCK_UNIVERSE_RANDOM_SEED")
        self.temp_file = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False)
        self.temp_file.write(
            "ticker,company_name,sector,industry,priority,is_student_friendly\n"
            "AAPL,Apple Inc.,Technology,Consumer Electronics,10,true\n"
            "MSFT,Microsoft Corp.,Technology,Software Infrastructure,11,true\n"
            "NVDA,NVIDIA Corp.,Technology,Semiconductors,12,true\n"
            "JNJ,Johnson & Johnson,Healthcare,Drug Manufacturers General,10,true\n"
            "PFE,Pfizer Inc.,Healthcare,Drug Manufacturers General,11,true\n"
            "JPM,JPMorgan Chase & Co.,Financial Services,Banks Diversified,10,true\n"
            "VOO,Vanguard S&P 500 ETF,ETF,Broad Market ETF,1,true\n"
        )
        self.temp_file.close()
        os.environ["ML_STOCK_UNIVERSE_CSV"] = self.temp_file.name
        reset_stock_universe_cache()

    def tearDown(self) -> None:
        if self.previous_csv_path is None:
            os.environ.pop("ML_STOCK_UNIVERSE_CSV", None)
        else:
            os.environ["ML_STOCK_UNIVERSE_CSV"] = self.previous_csv_path
        if self.previous_random_seed is None:
            os.environ.pop("ML_STOCK_UNIVERSE_RANDOM_SEED", None)
        else:
            os.environ["ML_STOCK_UNIVERSE_RANDOM_SEED"] = self.previous_random_seed
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

    def test_student_friendly_rows_are_preferred_when_available(self) -> None:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as handle:
            handle.write(
                "ticker,company_name,sector,industry,priority,is_student_friendly\n"
                "AAA,Advanced Alpha,Technology,Semiconductors,1,false\n"
                "BBB,Better Beta,Technology,Software Infrastructure,2,true\n"
                "CCC,Clear Charlie,Technology,Consumer Electronics,3,true\n"
            )
            temp_path = handle.name

        os.environ["ML_STOCK_UNIVERSE_CSV"] = temp_path
        os.environ["ML_STOCK_UNIVERSE_RANDOM_SEED"] = "4"
        reset_stock_universe_cache()

        try:
            picks = recommend_stocks_for_sectors(["Technology"], count=2)
        finally:
            Path(temp_path).unlink(missing_ok=True)

        self.assertEqual({item.ticker for item in picks}, {"BBB", "CCC"})

    def test_seeded_weighted_selection_can_vary_results(self) -> None:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as handle:
            handle.write(
                "ticker,company_name,sector,industry,priority,is_student_friendly\n"
                "AAA,Alpha,Technology,IndustryA,1,true\n"
                "BBB,Beta,Technology,IndustryB,1,true\n"
                "CCC,Gamma,Technology,IndustryC,1,true\n"
                "DDD,Delta,Technology,IndustryD,1,true\n"
            )
            temp_path = handle.name

        os.environ["ML_STOCK_UNIVERSE_CSV"] = temp_path
        try:
            os.environ["ML_STOCK_UNIVERSE_RANDOM_SEED"] = "1"
            reset_stock_universe_cache()
            picks_seed_one = [
                item.ticker
                for item in recommend_stocks_for_sectors(["Technology"], count=3)
            ]

            os.environ["ML_STOCK_UNIVERSE_RANDOM_SEED"] = "5"
            reset_stock_universe_cache()
            picks_seed_five = [
                item.ticker
                for item in recommend_stocks_for_sectors(["Technology"], count=3)
            ]
        finally:
            Path(temp_path).unlink(missing_ok=True)

        self.assertNotEqual(picks_seed_one, picks_seed_five)
        self.assertEqual(len(set(picks_seed_one)), 3)
        self.assertEqual(len(set(picks_seed_five)), 3)


if __name__ == "__main__":
    unittest.main()
