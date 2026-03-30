#!/bin/bash
#
# Example: Running HotpotQA benchmark with statistical analysis
#
# This script demonstrates how to run a publication-ready benchmark
# with stratified sampling and comprehensive statistical analysis.
#

set -e  # Exit on error

# Configuration
N_QUESTIONS=100  # Use 500 for publication, 100 for testing
SAMPLE_METHOD="stratified"
BATCH_SIZE=50
OUTPUT_DIR="output_statistical_$(date +%Y%m%d_%H%M%S)"

echo "========================================================================"
echo "HotpotQA Benchmark with Statistical Analysis"
echo "========================================================================"
echo ""
echo "Configuration:"
echo "  Sample size: $N_QUESTIONS"
echo "  Sampling: $SAMPLE_METHOD"
echo "  Batch size: $BATCH_SIZE"
echo "  Output: $OUTPUT_DIR"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check if KP server is running (optional, for real KP tests)
# echo "Checking KP server..."
# curl -s http://localhost:8080/health > /dev/null && echo "  ✓ KP server is running" || echo "  ✗ KP server not found, using mock"

# Run benchmark
echo "========================================================================"
echo "Running benchmark..."
echo "========================================================================"
echo ""

python bench_hotpotqa.py \
    --n "$N_QUESTIONS" \
    --sample-method "$SAMPLE_METHOD" \
    --batch-size "$BATCH_SIZE" \
    --statistical-analysis \
    --mock_kp \
    --output_dir "$OUTPUT_DIR"

# Check results
echo ""
echo "========================================================================"
echo "Results saved to: $OUTPUT_DIR"
echo "========================================================================"
echo ""

# Display summary
if [ -f "$OUTPUT_DIR/hotpotqa_summary.json" ]; then
    echo "Summary preview:"
    echo ""
    python -c "
import json
import sys

with open('$OUTPUT_DIR/hotpotqa_summary.json') as f:
    summary = json.load(f)

# Print key metrics
if summary.get('kp'):
    print('KnowledgePlane:')
    print(f\"  F1: {summary['kp']['avg_f1']:.3f}\")
    print(f\"  EM: {summary['kp']['avg_em']:.3f}\")
    print()

if summary.get('vector'):
    print('Vector Baseline:')
    print(f\"  F1: {summary['vector']['avg_f1']:.3f}\")
    print(f\"  EM: {summary['vector']['avg_em']:.3f}\")
    print()

if summary.get('improvement'):
    print('Improvement:')
    print(f\"  F1 delta: {summary['improvement']['f1_delta']:+.3f}\")
    print(f\"  EM delta: {summary['improvement']['em_delta']:+.3f}\")
    print()

if summary.get('statistical_analysis'):
    stats = summary['statistical_analysis']
    comp = stats.get('comparison', {})
    print('Statistical Analysis:')
    print(f\"  P-value: {comp.get('p_value', 'N/A')}\")
    print(f\"  Effect size: {comp.get('effect_size', 'N/A'):.3f}\")
    print(f\"  Significant: {comp.get('is_significant', False)}\")
    print()

if summary.get('timing'):
    print('Timing:')
    print(f\"  Total: {summary['timing']['total_seconds']:.1f}s\")
    print(f\"  Avg/question: {summary['timing']['avg_per_question']:.2f}s\")
"
fi

echo ""
echo "Files generated:"
ls -lh "$OUTPUT_DIR"

echo ""
echo "========================================================================"
echo "Next steps:"
echo "========================================================================"
echo "1. Review results in $OUTPUT_DIR/hotpotqa_summary.json"
echo "2. Check detailed CSV: $OUTPUT_DIR/hotpotqa_results.csv"
echo "3. For publication, run with --n 500 (takes 1-3 hours)"
echo ""
