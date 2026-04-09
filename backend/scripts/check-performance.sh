#!/bin/bash
# Performance regression detection script
# Usage: ./backend/scripts/check-performance.sh [baseline-file]
#
# This script:
# 1. Runs performance benchmarks
# 2. Compares against baseline (if provided)
# 3. Exits with error code if regressions detected
#
# CI/CD Integration:
#   - Add to GitHub Actions / pre-commit hooks
#   - Set baseline file path in CI environment
#   - Fail builds on performance regressions

set -e

BASELINE_FILE="${1:-.performance-baseline.json}"
CURRENT_FILE=".performance-current.json"
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
cd "$BACKEND_DIR"
export PYTHONPATH="src${PYTHONPATH:+:$PYTHONPATH}"

echo "🏃 Running performance benchmarks..."
"$PYTHON_BIN" -m pytest tests/test_performance.py -v -s --tb=short -m benchmark 2>&1 | tee benchmark.log

echo ""
echo "📊 Saving performance trace..."
"$PYTHON_BIN" -c "
from tradewise_backend.performance import save_performance_trace, get_performance_report
print(get_performance_report())
save_performance_trace('$CURRENT_FILE')
"

if [ ! -f "$BASELINE_FILE" ]; then
    echo ""
    echo "📈 No baseline found at $BASELINE_FILE"
    echo "   Creating baseline from current run..."
    cp "$CURRENT_FILE" "$BASELINE_FILE"
    echo "✅ Baseline created. Future runs will compare against this."
    exit 0
fi

echo ""
echo "🔍 Comparing with baseline..."
"$PYTHON_BIN" -c "
from tradewise_backend.performance import compare_performance_traces, print_comparison_report
comparison = compare_performance_traces('$BASELINE_FILE', '$CURRENT_FILE')
print_comparison_report(comparison)

# Exit with error if regressions detected
if comparison.get('regressions'):
    print('\n❌ PERFORMANCE REGRESSIONS DETECTED')
    for reg in comparison['regressions']:
        print(f\"  - {reg['operation']}: {reg['regression_percent']:+.1f}%\")
    exit(1)
else:
    print('\n✅ All operations within acceptable performance bounds')
    exit(0)
"
