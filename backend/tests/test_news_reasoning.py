import unittest
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradewise_backend.news_reasoning import build_student_news_reasoning


class NewsReasoningTestCase(unittest.TestCase):
    def test_build_student_news_reasoning_marks_template_when_qwen_load_fails(self) -> None:
        with (
            patch("tradewise_backend.news_reasoning._use_qwen_enabled", return_value=True),
            patch("tradewise_backend.news_reasoning._qwen_runtime_supported", return_value=True),
            patch(
                "tradewise_backend.news_reasoning._load_qwen",
                side_effect=RuntimeError("missing model"),
            ),
        ):
            result = build_student_news_reasoning(
                ticker="NVDA",
                signal="bullish",
                confidence=77.3,
                sentiment="positive",
                topics=["ai", "chips"],
                headlines=["NVIDIA launches new AI platform"],
                force_refresh=True,
            )

        self.assertEqual(result.source, "template")
        self.assertIn("NVDA in plain terms", result.text)


if __name__ == "__main__":
    unittest.main()
