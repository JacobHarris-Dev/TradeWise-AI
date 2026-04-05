import tempfile
import unittest
from pathlib import Path
import sys
from unittest.mock import patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.model_runtime import ModelBundle, ModelPrediction
from tradewise_backend.mock_trading import build_mock_trading_day_response


class MockTradingTestCase(unittest.TestCase):
    def test_build_mock_trading_day_response_replays_dataset_rows(self) -> None:
        dataset = pd.DataFrame(
            {
                "date": pd.date_range("2025-03-03", periods=10, freq="B").strftime("%Y-%m-%d"),
                "ticker": ["NVDA"] * 10,
                "close": [100, 102, 101, 103, 105, 104, 106, 108, 107, 109],
                "sma_5": [99, 100, 100, 101, 102, 103, 104, 105, 106, 107],
                "sma_20": [95, 96, 97, 98, 99, 100, 101, 102, 103, 104],
                "volatility_20d": [0.02] * 10,
                "return_5d": [0.01, 0.02, -0.01, 0.02, 0.03, -0.02, 0.04, 0.03, -0.01, 0.02],
            }
        )
        bundle = ModelBundle(
            estimator=object(),
            feature_columns=(
                "shortMovingAverage",
                "longMovingAverage",
                "volatility",
                "momentum",
                "discountFactor",
            ),
            label_map={0: "bearish", 1: "neutral", 2: "bullish"},
            model_version="xgb-risky-test",
        )
        predictions = iter(
            [
                ModelPrediction(signal="bullish", confidence=71.2, model_version="xgb-risky-test"),
                ModelPrediction(signal="bullish", confidence=72.0, model_version="xgb-risky-test"),
                ModelPrediction(signal="neutral", confidence=52.0, model_version="xgb-risky-test"),
                ModelPrediction(signal="bearish", confidence=65.0, model_version="xgb-risky-test"),
                ModelPrediction(signal="neutral", confidence=51.0, model_version="xgb-risky-test"),
                ModelPrediction(signal="bullish", confidence=73.0, model_version="xgb-risky-test"),
                ModelPrediction(signal="bearish", confidence=69.0, model_version="xgb-risky-test"),
                ModelPrediction(signal="bullish", confidence=75.0, model_version="xgb-risky-test"),
            ]
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            csv_path = Path(temp_dir) / "mock.csv"
            dataset.to_csv(csv_path, index=False)

            with (
                patch.dict("os.environ", {"ML_TRAINING_DATASET_CSV": str(csv_path)}),
                patch("tradewise_backend.mock_trading.load_model_bundle", return_value=bundle),
                patch(
                    "tradewise_backend.mock_trading.predict_signal",
                    side_effect=lambda *_args, **_kwargs: next(predictions),
                ),
            ):
                response = build_mock_trading_day_response("NVDA", model_profile="risky", steps=8)

        self.assertEqual(response.ticker, "NVDA")
        self.assertEqual(response.modelProfile, "risky")
        self.assertEqual(response.modelVersion, "xgb-risky-test")
        self.assertEqual(response.datasetSource, "mock.csv")
        self.assertEqual(len(response.steps), 8)
        self.assertEqual(response.steps[0].slot, "09:30")
        self.assertEqual(response.steps[1].action, "buy")
        self.assertEqual(response.summary.buys + response.summary.sells + response.summary.holds, 8)


if __name__ == "__main__":
    unittest.main()
