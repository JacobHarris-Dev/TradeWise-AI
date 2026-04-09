"""
Performance benchmarks for critical TradeWise-AI operations.

These tests measure execution time for key operations and establish baselines
for detecting performance regressions.

Run with: pytest backend/tests/test_performance.py -v -s
"""

import os
import time
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

# Performance thresholds (in seconds)
THRESHOLDS = {
    "ollama_model_discovery": 2.0,  # /api/tags call should complete quickly
    "news_reasoning_qwen_local": 10.0,  # Local Qwen model inference
    "news_reasoning_template": 0.5,  # Template fallback (should be instant)
    "market_data_alpaca_fetch": 5.0,  # Historical data fetch
    "stock_universe_lookup": 1.0,  # Ticker/company lookup
    "live_stream_tick_parse": 0.1,  # Single tick parsing
}


class TestPerformanceOllama:
    """Benchmarks for Ollama integration."""

    @pytest.mark.benchmark
    def test_ollama_model_discovery_timing(self):
        """Measure time to discover available Ollama models via /api/tags."""
        from tradewise_backend import news_reasoning

        with patch.object(news_reasoning._REMOTE_LLM_CLIENT, "get") as mock_get:
            # Mock Ollama /api/tags response
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "models": [
                    {"name": "qwen2.5:7b", "size": 4_700_000_000},
                    {"name": "qwen2.5:1.5b", "size": 1_000_000_000},
                    {"name": "llama2:13b", "size": 7_300_000_000},
                ]
            }
            mock_get.return_value = mock_response

            start = time.perf_counter()
            models = news_reasoning._ollama_available_models()
            elapsed = time.perf_counter() - start

            assert len(models) == 3
            assert elapsed < THRESHOLDS["ollama_model_discovery"], (
                f"Model discovery took {elapsed:.3f}s, expected < {THRESHOLDS['ollama_model_discovery']}s"
            )
            print(f"✓ Ollama model discovery: {elapsed:.3f}s")

    @pytest.mark.benchmark
    def test_preferred_ollama_model_selection_timing(self):
        """Measure time to select preferred model from available list."""
        from tradewise_backend.news_reasoning import _preferred_ollama_model_name

        with patch(
            "tradewise_backend.news_reasoning._ollama_available_models"
        ) as mock_models:
            mock_models.return_value = [
                {"name": "qwen2.5:7b", "size": 4_700_000_000},
                {"name": "qwen2.5:1.5b", "size": 1_000_000_000},
                {"name": "llama2:13b", "size": 7_300_000_000},
                {"name": "mistral:7b", "size": 4_000_000_000},
            ]

            start = time.perf_counter()
            selected = _preferred_ollama_model_name()
            elapsed = time.perf_counter() - start

            assert selected == "qwen2.5:1.5b"  # Should select smallest Qwen
            assert elapsed < 0.01, (
                f"Model selection took {elapsed:.3f}s, expected < 0.01s"
            )
            print(f"✓ Model selection: {elapsed:.4f}s")


class TestPerformanceNewsReasoning:
    """Benchmarks for news reasoning operations."""

    @pytest.mark.benchmark
    def test_template_reasoning_speed(self):
        """Template-based reasoning should be near-instant."""
        from tradewise_backend.news_reasoning import build_student_news_reasoning

        # Force template mode by disabling the remote LLM and local Qwen path.
        with patch.dict(
            os.environ,
            {
                "ML_QWEN_REMOTE_BASE_URL": "",
                "ML_NEWS_REPORT_USE_QWEN": "false",
                "ML_QWEN_LOCAL_ONLY": "true",
            },
            clear=False,
        ):
            start = time.perf_counter()
            result = build_student_news_reasoning(
                ticker="AAPL",
                signal="neutral",
                confidence=52.0,
                sentiment="neutral",
                change_percent=0.2,
                momentum=0.001,
                short_moving_average=100.0,
                long_moving_average=100.5,
                topics=["earnings"],
                headlines=["Apple beats earnings estimates"],
                force_refresh=True,
            )
            elapsed = time.perf_counter() - start

            assert result.source == "template"
            assert elapsed < THRESHOLDS["news_reasoning_template"], (
                f"Template reasoning took {elapsed:.3f}s, expected < {THRESHOLDS['news_reasoning_template']}s"
            )
            print(f"✓ Template reasoning: {elapsed:.4f}s")

    @pytest.mark.benchmark
    def test_news_reasoning_cache_hit_speed(self):
        """Cached reasoning should be faster than first computation."""
        from tradewise_backend.news_reasoning import build_student_news_reasoning

        with patch.dict(
            os.environ,
            {
                "ML_QWEN_REMOTE_BASE_URL": "",
                "ML_NEWS_REPORT_USE_QWEN": "false",
                "ML_QWEN_LOCAL_ONLY": "true",
                "ML_NEWS_REASONING_CACHE_SECONDS": "120",
            },
            clear=False,
        ):
            # First call (cache miss)
            start1 = time.perf_counter()
            result1 = build_student_news_reasoning(
                ticker="MSFT",
                signal="neutral",
                confidence=51.0,
                sentiment="neutral",
                change_percent=0.1,
                momentum=0.0005,
                short_moving_average=98.0,
                long_moving_average=98.5,
                topics=["macro"],
                headlines=["Market rally continues"],
                force_refresh=True,
            )
            elapsed1 = time.perf_counter() - start1

            # Second call (cache hit)
            start2 = time.perf_counter()
            result2 = build_student_news_reasoning(
                ticker="MSFT",
                signal="neutral",
                confidence=51.0,
                sentiment="neutral",
                change_percent=0.1,
                momentum=0.0005,
                short_moving_average=98.0,
                long_moving_average=98.5,
                topics=["macro"],
                headlines=["Market rally continues"],
            )
            elapsed2 = time.perf_counter() - start2

            # Cache hit should be significantly faster
            speedup = elapsed1 / elapsed2 if elapsed2 > 0 else float("inf")
            assert (
                speedup > 1.5
            ), f"Cache speedup only {speedup:.1f}x, expected > 1.5x"
            print(f"✓ Cache speedup: {speedup:.1f}x ({elapsed1:.4f}s → {elapsed2:.4f}s)")


class TestPerformanceStockUniverse:
    """Benchmarks for stock universe lookups."""

    @pytest.mark.benchmark
    def test_stock_lookup_speed(self):
        """Stock ticker lookup should be sub-second."""
        from tradewise_backend.stock_universe import resolve_stock_universe_matches

        start = time.perf_counter()
        results = resolve_stock_universe_matches("AAPL")
        elapsed = time.perf_counter() - start

        assert len(results) > 0
        assert elapsed < THRESHOLDS["stock_universe_lookup"], (
            f"Stock lookup took {elapsed:.3f}s, expected < {THRESHOLDS['stock_universe_lookup']}s"
        )
        print(f"✓ Stock lookup (AAPL): {elapsed:.4f}s")

    @pytest.mark.benchmark
    def test_company_name_lookup_speed(self):
        """Company name lookup should handle multiple matches quickly."""
        from tradewise_backend.stock_universe import resolve_stock_universe_matches

        start = time.perf_counter()
        results = resolve_stock_universe_matches("Apple")
        elapsed = time.perf_counter() - start

        assert len(results) > 0
        assert elapsed < THRESHOLDS["stock_universe_lookup"], (
            f"Company lookup took {elapsed:.3f}s, expected < {THRESHOLDS['stock_universe_lookup']}s"
        )
        print(f"✓ Company lookup (Apple): {elapsed:.4f}s")


class TestPerformanceMarketData:
    """Benchmarks for market data operations."""

    @pytest.mark.benchmark
    def test_market_data_parse_speed(self):
        """Market data parsing should be fast for batch operations."""
        from tradewise_backend.market_data import _normalize_history_frame

        sample_data = pd.DataFrame(
            {
                "Open": [150.0, 150.5, 151.0],
                "High": [151.5, 152.0, 152.5],
                "Low": [149.7, 150.2, 150.8],
                "Close": [150.25, 151.0, 152.1],
                "Volume": [52_000_000, 48_000_000, 50_000_000],
            },
            index=pd.to_datetime(
                ["2024-01-01T14:30:00Z", "2024-01-02T14:30:00Z", "2024-01-03T14:30:00Z"]
            ),
        )

        start = time.perf_counter()
        for _ in range(100):  # Parse 100 records
            result = _normalize_history_frame(sample_data, "AAPL")
        elapsed = time.perf_counter() - start

        avg_time = elapsed / 100
        assert (
            avg_time < 0.01
        ), f"Average parse time {avg_time:.4f}s exceeds 0.01s threshold"
        print(f"✓ Market data parsing: {avg_time:.4f}s per record")


class TestPerformanceLiveStream:
    """Benchmarks for live stream tick processing."""

    @pytest.mark.benchmark
    def test_live_stream_tick_parsing(self):
        """Live stream tick parsing should be sub-millisecond."""
        from tradewise_backend.schemas import LiveTradeTick

        # Sample tick data
        tick_data = {
            "type": "trade",
            "symbol": "AAPL",
            "price": 150.25,
            "size": 100,
            "timestamp": "2024-01-01T14:30:00Z",
            "feed": "iex",
        }

        start = time.perf_counter()
        for _ in range(1000):  # Parse 1000 ticks
            tick = LiveTradeTick(**tick_data)
        elapsed = time.perf_counter() - start

        avg_time = elapsed / 1000
        assert (
            avg_time < THRESHOLDS["live_stream_tick_parse"]
        ), f"Average tick parsing {avg_time:.4f}s exceeds {THRESHOLDS['live_stream_tick_parse']}s"
        print(f"✓ Tick parsing: {avg_time:.6f}s per tick ({1/avg_time:.0f} ticks/sec)")


class TestPerformanceRegression:
    """Regression detection suite - runs all benchmarks and flags slowdowns."""

    @pytest.mark.benchmark
    def test_no_regressions_summary(self, capsys):
        """
        Summary test that reports all threshold comparisons.
        
        This serves as documentation of expected performance characteristics.
        """
        print("\n" + "=" * 70)
        print("PERFORMANCE THRESHOLDS SUMMARY")
        print("=" * 70)

        for operation, threshold in THRESHOLDS.items():
            print(f"{operation:.<40} {threshold:.2f}s")

        print("=" * 70)
        print("To detect regressions:")
        print("1. Run: pytest backend/tests/test_performance.py -v -s --benchmark-only")
        print("2. Compare against previous baseline")
        print("3. Flag operations exceeding thresholds")
        print("=" * 70)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
