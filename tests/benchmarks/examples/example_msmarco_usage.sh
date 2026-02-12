#!/bin/bash
# Example MS MARCO Benchmark Usage Script
#
# This script demonstrates various ways to run the MS MARCO benchmark
# with different configurations and use cases.

set -e  # Exit on error

echo "=========================================="
echo "MS MARCO Benchmark - Example Usage"
echo "=========================================="
echo ""

# Configuration
BENCHMARK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BENCHMARK_DIR"

echo "Working directory: $BENCHMARK_DIR"
echo ""

# ==========================================
# Example 1: Quick test with mock KP
# ==========================================
echo "Example 1: Quick Test (Mock KP)"
echo "----------------------------------------"
echo "Running small benchmark with mock KP (no server needed)"
echo "This is useful for testing the benchmark itself."
echo ""

python bench_msmarco.py \
    --n 10 \
    --k 5 \
    --mock_kp \
    --output_dir output/example1

echo ""
echo "Results saved to: output/example1/"
echo ""

# ==========================================
# Example 2: Small real benchmark
# ==========================================
echo "Example 2: Small Real Benchmark"
echo "----------------------------------------"
echo "Running benchmark with 50 queries on real KP server"
echo ""

# Check if KP environment variables are set
if [ -z "$KP_API_URL" ]; then
    echo "⚠️  KP_API_URL not set. Skipping real benchmark."
    echo "   To run this example, set:"
    echo "   export KP_API_URL=http://localhost:8080/mcp"
    echo "   export KP_API_KEY=your-api-key"
    echo "   export KP_WORKSPACE_ID=your-workspace"
    echo "   export KP_USER_ID=your-user"
else
    python bench_msmarco.py \
        --n 50 \
        --k 10 \
        --run_kp true \
        --run_vector true \
        --output_dir output/example2

    echo ""
    echo "Results saved to: output/example2/"
    echo ""
fi

# ==========================================
# Example 3: KP only (faster)
# ==========================================
echo "Example 3: KP Only (Faster)"
echo "----------------------------------------"
echo "Skip vector baseline to test KP performance only"
echo ""

if [ -z "$KP_API_URL" ]; then
    echo "⚠️  Skipping (KP not configured)"
else
    python bench_msmarco.py \
        --n 100 \
        --k 10 \
        --run_kp true \
        --run_vector false \
        --output_dir output/example3

    echo ""
    echo "Results saved to: output/example3/"
    echo ""
fi

# ==========================================
# Example 4: Vector only
# ==========================================
echo "Example 4: Vector Baseline Only"
echo "----------------------------------------"
echo "Test vector baseline independently"
echo ""

python bench_msmarco.py \
    --n 50 \
    --k 10 \
    --run_kp false \
    --run_vector true \
    --output_dir output/example4

echo ""
echo "Results saved to: output/example4/"
echo ""

# ==========================================
# Example 5: Different k values
# ==========================================
echo "Example 5: K-Value Comparison"
echo "----------------------------------------"
echo "Test different k values to see ranking consistency"
echo ""

for k in 5 10 20; do
    echo "Running with k=$k..."
    python bench_msmarco.py \
        --n 30 \
        --k $k \
        --mock_kp \
        --output_dir "output/example5_k${k}"
done

echo ""
echo "Results saved to: output/example5_k*/"
echo ""

# ==========================================
# Example 6: Statistical significance test
# ==========================================
echo "Example 6: Statistical Significance"
echo "----------------------------------------"
echo "Run multiple seeds to compute mean ± std"
echo ""

for seed in 42 43 44 45 46; do
    echo "Running with seed=$seed..."
    python bench_msmarco.py \
        --n 50 \
        --k 10 \
        --seed $seed \
        --mock_kp \
        --output_dir "output/example6_seed${seed}"
done

# Compute aggregate statistics
echo ""
echo "Computing aggregate statistics..."
python -c "
import json
from pathlib import Path
import numpy as np

results = []
for p in Path('output').glob('example6_seed*/msmarco_summary.json'):
    with open(p) as f:
        results.append(json.load(f))

if results:
    kp_mrrs = [r['kp']['avg_mrr'] for r in results if r.get('kp')]
    kp_recalls = [r['kp']['avg_recall_at_k'] for r in results if r.get('kp')]
    kp_ndcgs = [r['kp']['avg_ndcg_at_k'] for r in results if r.get('kp')]

    vector_mrrs = [r['vector']['avg_mrr'] for r in results if r.get('vector')]
    vector_recalls = [r['vector']['avg_recall_at_k'] for r in results if r.get('vector')]
    vector_ndcgs = [r['vector']['avg_ndcg_at_k'] for r in results if r.get('vector')]

    print('\\nAggregate Results (n=5 seeds):')
    print('=' * 50)
    if kp_mrrs:
        print(f'KP MRR:        {np.mean(kp_mrrs):.4f} ± {np.std(kp_mrrs):.4f}')
        print(f'KP Recall@10:  {np.mean(kp_recalls):.4f} ± {np.std(kp_recalls):.4f}')
        print(f'KP NDCG@10:    {np.mean(kp_ndcgs):.4f} ± {np.std(kp_ndcgs):.4f}')
    if vector_mrrs:
        print(f'Vector MRR:    {np.mean(vector_mrrs):.4f} ± {np.std(vector_mrrs):.4f}')
        print(f'Vector Recall: {np.mean(vector_recalls):.4f} ± {np.std(vector_recalls):.4f}')
        print(f'Vector NDCG:   {np.mean(vector_ndcgs):.4f} ± {np.std(vector_ndcgs):.4f}')
"

echo ""
echo "Results saved to: output/example6_seed*/"
echo ""

# ==========================================
# Example 7: Run metric tests
# ==========================================
echo "Example 7: Unit Tests"
echo "----------------------------------------"
echo "Running metric unit tests to verify correctness"
echo ""

python tests/test_msmarco_metrics.py

echo ""
echo "Tests complete!"
echo ""

# ==========================================
# Example 8: Interactive demo
# ==========================================
echo "Example 8: Interactive Demo"
echo "----------------------------------------"
echo "Run the interactive demo to explore metrics"
echo ""
echo "To run interactively:"
echo "  python demos/demo_msmarco.py"
echo ""

# ==========================================
# Summary
# ==========================================
echo "=========================================="
echo "All Examples Complete!"
echo "=========================================="
echo ""
echo "Results have been saved to:"
echo "  output/example1/ - Mock KP quick test"
echo "  output/example2/ - Real benchmark (if KP configured)"
echo "  output/example3/ - KP only (if KP configured)"
echo "  output/example4/ - Vector only"
echo "  output/example5_k*/ - Different k values"
echo "  output/example6_seed*/ - Statistical significance"
echo ""
echo "View detailed results:"
echo "  cat output/example1/msmarco_summary.json | jq"
echo ""
echo "Compare KP vs Vector:"
echo "  python -c \"import json; r=json.load(open('output/example1/msmarco_summary.json')); print(f'MRR improvement: {r[\\\"improvement\\\"][\\\"mrr_delta\\\"]:.4f}')\""
echo ""
echo "For more information:"
echo "  - Full guide: docs/MSMARCO_USAGE.md"
echo "  - Quick ref: docs/MSMARCO_QUICKREF.md"
echo "  - Demo: python demos/demo_msmarco.py"
echo ""
