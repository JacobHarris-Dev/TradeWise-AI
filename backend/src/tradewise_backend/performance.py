"""
Performance tracing and regression detection utilities.

Usage:
  from tradewise_backend.performance import trace_operation, get_performance_report
  
  @trace_operation("my_operation")
  def expensive_function():
      return result
      
  report = get_performance_report()
"""

import functools
import json
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])

# In-memory trace storage
_traces: dict[str, list[dict[str, Any]]] = defaultdict(list)

# Performance baselines (populate from test_performance.py results)
PERFORMANCE_BASELINES = {
    "ollama_model_discovery": {"threshold": 2.0, "unit": "seconds"},
    "news_reasoning_qwen_local": {"threshold": 10.0, "unit": "seconds"},
    "news_reasoning_template": {"threshold": 0.5, "unit": "seconds"},
    "market_data_alpaca_fetch": {"threshold": 5.0, "unit": "seconds"},
    "stock_universe_lookup": {"threshold": 1.0, "unit": "seconds"},
    "live_stream_tick_parse": {"threshold": 0.1, "unit": "milliseconds", "divisor": 0.001},
}


def trace_operation(operation_name: str, warn_threshold: float | None = None) -> Callable[[F], F]:
    """
    Decorator to trace execution time of an operation.
    
    Args:
        operation_name: Name of the operation (will be used in reports)
        warn_threshold: Optional threshold in seconds to warn if exceeded
    
    Example:
        @trace_operation("expensive_query", warn_threshold=1.0)
        def my_function():
            return result
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                elapsed = time.perf_counter() - start
                _traces[operation_name].append(
                    {
                        "timestamp": datetime.now().isoformat(),
                        "elapsed_seconds": elapsed,
                        "function": func.__name__,
                    }
                )

                if warn_threshold and elapsed > warn_threshold:
                    baseline = PERFORMANCE_BASELINES.get(operation_name)
                    if baseline:
                        print(
                            f"⚠️  PERFORMANCE WARNING: {operation_name} took {elapsed:.3f}s "
                            f"(threshold: {baseline['threshold']}s)"
                        )

        return wrapper  # type: ignore

    return decorator


def get_performance_report() -> dict[str, Any]:
    """
    Generate a performance report with statistics for all traced operations.
    
    Returns:
        Dictionary with operation names and statistics (min, max, avg, count)
    """
    report: dict[str, Any] = {
        "timestamp": datetime.now().isoformat(),
        "operations": {},
        "regressions": [],
    }

    for operation_name, traces in _traces.items():
        if not traces:
            continue

        times = [t["elapsed_seconds"] for t in traces]
        baseline = PERFORMANCE_BASELINES.get(operation_name)

        stats = {
            "count": len(times),
            "min_seconds": min(times),
            "max_seconds": max(times),
            "avg_seconds": sum(times) / len(times),
            "latest_seconds": times[-1],
        }

        if baseline:
            stats["threshold_seconds"] = baseline["threshold"]
            is_regression = stats["avg_seconds"] > baseline["threshold"]
            stats["is_regression"] = is_regression

            if is_regression:
                report["regressions"].append(
                    {
                        "operation": operation_name,
                        "average_time": stats["avg_seconds"],
                        "threshold": baseline["threshold"],
                        "excess": stats["avg_seconds"] - baseline["threshold"],
                    }
                )

        report["operations"][operation_name] = stats

    return report


def print_performance_report(report: dict[str, Any] | None = None) -> None:
    """
    Pretty-print performance report to console.
    
    Args:
        report: Optional pre-generated report; if None, generates from current traces
    """
    if report is None:
        report = get_performance_report()

    print("\n" + "=" * 80)
    print("PERFORMANCE REPORT")
    print("=" * 80)
    print(f"Generated: {report['timestamp']}\n")

    # Operations table
    print(f"{'Operation':<30} {'Count':<8} {'Avg (s)':<12} {'Min (s)':<12} {'Max (s)':<12}")
    print("-" * 80)

    for op_name, stats in sorted(report["operations"].items()):
        regression_marker = "⚠️ " if stats.get("is_regression") else "  "
        print(
            f"{regression_marker}{op_name:<28} {stats['count']:<8} "
            f"{stats['avg_seconds']:<12.4f} {stats['min_seconds']:<12.4f} {stats['max_seconds']:<12.4f}"
        )

    # Regressions summary
    if report["regressions"]:
        print("\n" + "=" * 80)
        print("PERFORMANCE REGRESSIONS DETECTED")
        print("=" * 80)

        for regression in report["regressions"]:
            print(
                f"❌ {regression['operation']}: "
                f"{regression['average_time']:.3f}s (threshold: {regression['threshold']:.3f}s, "
                f"excess: +{regression['excess']:.3f}s)"
            )
    else:
        print("\n✅ No performance regressions detected.")

    print("\n" + "=" * 80)


def save_performance_trace(filepath: str | Path = ".performance-trace.json") -> None:
    """
    Save performance traces to JSON file for historical comparison.
    
    Args:
        filepath: Path to save trace file
    """
    report = get_performance_report()
    filepath = Path(filepath)

    # Load existing traces if present
    existing = []
    if filepath.exists():
        try:
            with open(filepath) as f:
                data = json.load(f)
                existing = data if isinstance(data, list) else [data]
        except (json.JSONDecodeError, IOError):
            existing = []

    # Append new report
    existing.append(report)

    with open(filepath, "w") as f:
        json.dump(existing, f, indent=2)

    print(f"✅ Performance trace saved to {filepath}")


def compare_performance_traces(
    baseline_file: str | Path, current_file: str | Path
) -> dict[str, Any]:
    """
    Compare two performance trace files and flag regressions.
    
    Args:
        baseline_file: Path to baseline trace JSON
        current_file: Path to current trace JSON
    
    Returns:
        Comparison report with regression analysis
    """
    baseline_file = Path(baseline_file)
    current_file = Path(current_file)

    if not baseline_file.exists() or not current_file.exists():
        return {"error": "One or both trace files not found"}

    with open(baseline_file) as f:
        baseline_reports = json.load(f)
    baseline = baseline_reports[-1] if isinstance(baseline_reports, list) else baseline_reports

    with open(current_file) as f:
        current_reports = json.load(f)
    current = current_reports[-1] if isinstance(current_reports, list) else current_reports

    comparison = {
        "baseline_timestamp": baseline["timestamp"],
        "current_timestamp": current["timestamp"],
        "operations": {},
        "regressions": [],
    }

    for op_name in set(baseline["operations"].keys()) | set(current["operations"].keys()):
        baseline_stats = baseline["operations"].get(op_name)
        current_stats = current["operations"].get(op_name)

        if not baseline_stats or not current_stats:
            continue

        baseline_avg = baseline_stats["avg_seconds"]
        current_avg = current_stats["avg_seconds"]
        delta = current_avg - baseline_avg
        delta_percent = (delta / baseline_avg * 100) if baseline_avg > 0 else 0

        comparison["operations"][op_name] = {
            "baseline_avg": baseline_avg,
            "current_avg": current_avg,
            "delta_seconds": delta,
            "delta_percent": delta_percent,
        }

        # Flag regressions (>10% slowdown)
        if delta_percent > 10:
            comparison["regressions"].append(
                {
                    "operation": op_name,
                    "baseline": baseline_avg,
                    "current": current_avg,
                    "regression_percent": delta_percent,
                }
            )

    return comparison


def print_comparison_report(comparison: dict[str, Any]) -> None:
    """
    Pretty-print performance comparison report.
    
    Args:
        comparison: Comparison report from compare_performance_traces()
    """
    print("\n" + "=" * 90)
    print("PERFORMANCE COMPARISON REPORT")
    print("=" * 90)
    print(f"Baseline: {comparison['baseline_timestamp']}")
    print(f"Current:  {comparison['current_timestamp']}\n")

    print(
        f"{'Operation':<30} {'Baseline (s)':<15} {'Current (s)':<15} {'Delta %':<12}"
    )
    print("-" * 90)

    for op_name, stats in sorted(comparison["operations"].items()):
        delta_display = f"{stats['delta_percent']:+.1f}%"
        marker = "⚠️ " if stats["delta_percent"] > 10 else "  "
        print(
            f"{marker}{op_name:<28} {stats['baseline_avg']:<15.4f} "
            f"{stats['current_avg']:<15.4f} {delta_display:<12}"
        )

    if comparison["regressions"]:
        print("\n" + "=" * 90)
        print("REGRESSIONS DETECTED")
        print("=" * 90)

        for regression in comparison["regressions"]:
            print(
                f"❌ {regression['operation']}: {regression['regression_percent']:+.1f}% "
                f"({regression['baseline']:.4f}s → {regression['current']:.4f}s)"
            )
    else:
        print("✅ No significant regressions detected (>10% threshold)")

    print("\n" + "=" * 90)


if __name__ == "__main__":
    # Example usage
    print("Performance tracing utilities loaded.")
    print("Import and use @trace_operation decorator in your code.")
    print("Call get_performance_report() to view current traces.")
