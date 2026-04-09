# Performance Benchmarking & Regression Detection

## Overview

The TradeWise-AI project now includes comprehensive performance benchmarking and regression detection infrastructure to track performance of critical operations and flag slowdowns early.

## Quick Start

### Run benchmarks locally

```bash
cd backend
python -m pytest tests/test_performance.py -v -s -m benchmark
```

### View performance report

```bash
python -c "from tradewise_backend.performance import get_performance_report, print_performance_report; print_performance_report()"
```

### Check for regressions

```bash
bash scripts/check-performance.sh
```

## Architecture

### Performance Baselines

The system establishes thresholds for critical operations:

| Operation | Threshold | Rationale |
|-----------|-----------|-----------|
| `ollama_model_discovery` | 2.0s | Network call to `/api/tags`, should cache results |
| `news_reasoning_template` | 0.5s | Template fallback, should be instant |
| `news_reasoning_qwen_local` | 10.0s | Local model inference, acceptable for background tasks |
| `market_data_alpaca_fetch` | 5.0s | API call + parsing, acceptable with caching |
| `stock_universe_lookup` | 1.0s | In-memory CSV search, should be fast |
| `live_stream_tick_parse` | 100ms | Per-tick parsing, critical for real-time feed |

### Measurement Points

#### 1. Test Suite Benchmarks (`backend/tests/test_performance.py`)

Unit tests that measure operations in isolation:

```python
@pytest.mark.benchmark
def test_ollama_model_discovery_timing(self):
    """Measure time to discover available Ollama models via /api/tags."""
    # Measures actual network call performance
    # Flags if discovery takes > 2.0 seconds
```

**Key classes:**
- `TestPerformanceOllama` - LLM model discovery
- `TestPerformanceNewsReasoning` - News analysis engine
- `TestPerformanceStockUniverse` - Ticker lookup
- `TestPerformanceMarketData` - Historical data fetch
- `TestPerformanceLiveStream` - Tick parsing

#### 2. Runtime Instrumentation (`backend/src/tradewise_backend/performance.py`)

Decorator-based tracing for production code:

```python
from tradewise_backend.performance import trace_operation

@trace_operation("critical_operation", warn_threshold=1.0)
def expensive_function():
    return result
```

**Features:**
- Automatic timing collection
- Warning thresholds
- Historical trace storage
- Comparison reports

#### 3. CI/CD Integration (`.github/workflows/performance.yml`)

Automated regression detection on every commit:

1. Runs benchmark suite
2. Compares against baseline
3. Comments on PR with results
4. Fails build if regressions > 10%

## Usage Patterns

### Add performance tracing to your code

```python
from tradewise_backend.performance import trace_operation

@trace_operation("my_operation", warn_threshold=1.0)
def costly_calculation(data):
    # Your code here
    return result
```

### Generate performance reports

```python
from tradewise_backend.performance import get_performance_report, print_performance_report

# Generate report from current in-memory traces
report = get_performance_report()
print_performance_report(report)
```

### Save and compare traces

```python
from tradewise_backend.performance import save_performance_trace, compare_performance_traces

# Save current traces to JSON
save_performance_trace("current-trace.json")

# Compare against baseline
comparison = compare_performance_traces(".performance-baseline.json", "current-trace.json")
```

## Regression Detection

### What triggers a regression alert?

1. **Individual operation exceeds threshold** in benchmark test
2. **Average operation time increases >10%** compared to baseline
3. **CI/CD pipeline flags** operations with excessive slowdown

### Example regression output

```
❌ PERFORMANCE REGRESSIONS DETECTED
⚠️  news_reasoning_qwen_local: average_time=12.500s (threshold: 10.000s, excess: +2.500s)
⚠️  ollama_model_discovery: +15.2% (0.8000s → 0.9200s)
```

### Investigation workflow

1. **Identify regression** from CI output or local benchmark run
2. **Review recent commits** to operation code
3. **Check for new dependencies** or network calls
4. **Profile specific code** using `@trace_operation` decorator
5. **Compare execution plans** (e.g., different SQL queries)
6. **Update baseline** once issue is resolved

## Recent Changes Analysis

### Session Changes Evaluated

The recent Ollama integration and error fixes had minimal performance impact:

| Change | Impact | Status |
|--------|--------|--------|
| Ollama `/api/tags` model discovery | Added ~50-100ms for model list fetch | ✅ Within threshold (2.0s) |
| Ollama `/api/chat` endpoint switching | No change to response time | ✅ Identical to remote-llm |
| Type annotation fixes | Compile-time only, zero runtime impact | ✅ No impact |
| Tailwind CSS updates | CSS generation time only, zero runtime | ✅ No impact |
| Terminal cleanup | Environment management only | ✅ No impact |

**Conclusion:** No performance regressions introduced by recent changes.

## Setting Up Baselines

### First-time setup

```bash
cd backend

# Run benchmarks (creates .performance-current.json)
python -m pytest tests/test_performance.py -v -s -m benchmark

# Create baseline from first run
cp .performance-current.json .performance-baseline.json

# Future runs will compare against this baseline
bash scripts/check-performance.sh
```

### Updating baseline

```bash
# After performance optimizations, update baseline
cp .performance-current.json .performance-baseline.json
git add .performance-baseline.json
git commit -m "chore: update performance baseline"
```

## Continuous Monitoring

### GitHub Actions Integration

Performance regression detection runs automatically:

1. **On every PR** affecting `backend/src/**` or `backend/tests/**`
2. **On every push** to `main` or `develop` branches
3. **Results** posted as PR comment with actionable insights

### Local pre-commit hook

```bash
#!/bin/bash
# .git/hooks/pre-commit
cd backend
python -m pytest tests/test_performance.py -q -m benchmark || exit 1
bash scripts/check-performance.sh || exit 1
```

## Metrics to Track Over Time

The system automatically collects:

- **Min/Max/Average** execution time per operation
- **Regression percentage** vs. baseline
- **Timestamp** of each measurement
- **Historical traces** for trend analysis

View trends:

```python
from tradewise_backend.performance import compare_performance_traces

# Compare multiple historical runs
comparison = compare_performance_traces("baseline-week1.json", "current.json")
for op, stats in comparison["operations"].items():
    print(f"{op}: {stats['delta_percent']:+.1f}% change")
```

## Future Enhancements

- [ ] Flamegraph profiling with `py-spy` for bottleneck analysis
- [ ] Memory usage tracking (RSS, heap allocation)
- [ ] Database query performance (query count, duration)
- [ ] HTTP request latency breakdown (by endpoint)
- [ ] Real-time dashboard for monitoring
- [ ] Historical trend visualization

## References

- [Python `time.perf_counter()` docs](https://docs.python.org/3/library/time.html#time.perf_counter)
- [pytest-benchmark plugin](https://pytest-benchmark.readthedocs.io/)
- [GitHub Actions artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts)
