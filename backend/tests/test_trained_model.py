import os
import tempfile
import unittest
from pathlib import Path
import sys

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from training.data import get_default_training_tickers
from training.trained_model import build_dataset_from_csv
from tradewise_backend.stock_universe import reset_stock_universe_cache


class TrainedModelDatasetTestCase(unittest.TestCase):
    def test_default_training_tickers_use_stock_universe_csv(self) -> None:
        previous_csv_path = os.environ.get("ML_STOCK_UNIVERSE_CSV")
        with tempfile.TemporaryDirectory() as temp_dir:
            csv_path = Path(temp_dir) / "universe.csv"
            csv_path.write_text(
                "\n".join(
                    [
                        "ticker,company_name,sector,industry,priority,is_student_friendly",
                        "ZZZ,Zeta Corp.,Technology,Software,3,true",
                        "AAA,Alpha Corp.,Technology,Hardware,1,true",
                        "MMM,Micro Corp.,Healthcare,Devices,2,false",
                    ]
                ),
                encoding="utf-8",
            )
            os.environ["ML_STOCK_UNIVERSE_CSV"] = str(csv_path)
            reset_stock_universe_cache()
            tickers = get_default_training_tickers()

        if previous_csv_path is None:
            os.environ.pop("ML_STOCK_UNIVERSE_CSV", None)
        else:
            os.environ["ML_STOCK_UNIVERSE_CSV"] = previous_csv_path
        reset_stock_universe_cache()

        self.assertEqual(tickers, ("AAA", "ZZZ", "MMM"))

    def test_build_dataset_from_csv_translates_columns_for_runtime_model(self) -> None:
        source = pd.DataFrame(
            {
                "ticker": ["AAPL", "MSFT", "NVDA"],
                "sma_5": [100.0, 200.0, 300.0],
                "sma_20": [98.0, 202.0, 295.0],
                "volatility_20d": [0.02, 0.03, 0.04],
                "return_5d": [0.015, -0.01, 0.03],
                "target_return_5d": [0.025, -0.03, 0.0],
            }
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            csv_path = Path(temp_dir) / "dataset.csv"
            source.to_csv(csv_path, index=False)
            dataset = build_dataset_from_csv(csv_path, neutral_band=0.01)

        self.assertEqual(
            list(dataset.columns),
            [
                "ticker",
                "shortMovingAverage",
                "longMovingAverage",
                "volatility",
                "momentum",
                "discountFactor",
                "target",
                "targetEncoded",
            ],
        )
        self.assertEqual(dataset["target"].tolist(), [1, -1, 0])
        self.assertEqual(dataset["targetEncoded"].tolist(), [2, 0, 1])
        self.assertTrue((dataset["discountFactor"] > 0).all())


if __name__ == "__main__":
    unittest.main()
