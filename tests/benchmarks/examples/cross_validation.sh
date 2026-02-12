#!/bin/bash
#
# Cross-Validation: Run benchmark with multiple seeds
#
# This script runs the benchmark multiple times with different random seeds
# to ensure results are robust and not dependent on a particular sample.
#

set -e

# Configuration
N_QUESTIONS=100
SAMPLE_METHOD="stratified"
SEEDS=(42 43 44 45 46)  # 5 different seeds
BASE_OUTPUT_DIR="output_cv_$(date +%Y%m%d_%H%M%S)"

echo "========================================================================"
echo "Cross-Validation: Multiple Seed Benchmark"
echo "========================================================================"
echo ""
echo "Configuration:"
echo "  Sample size: $N_QUESTIONS per run"
echo "  Number of runs: ${#SEEDS[@]}"
echo "  Seeds: ${SEEDS[@]}"
echo "  Sampling: $SAMPLE_METHOD"
echo ""

# Create base output directory
mkdir -p "$BASE_OUTPUT_DIR"

# Run benchmark for each seed
for seed in "${SEEDS[@]}"; do
    output_dir="$BASE_OUTPUT_DIR/seed_$seed"
    echo "========================================================================"
    echo "Running with seed $seed..."
    echo "========================================================================"
    echo ""

    python bench_hotpotqa.py \
        --n "$N_QUESTIONS" \
        --seed "$seed" \
        --sample-method "$SAMPLE_METHOD" \
        --statistical-analysis \
        --mock_kp \
        --output_dir "$output_dir"

    echo ""
    echo "✓ Seed $seed complete. Results in: $output_dir"
    echo ""
done

# Aggregate results
echo "========================================================================"
echo "Aggregating results across all seeds..."
echo "========================================================================"
echo ""

python -c "
import json
import numpy as np
from pathlib import Path

# Load all results
results = []
base_dir = Path('$BASE_OUTPUT_DIR')

for seed_dir in sorted(base_dir.glob('seed_*')):
    summary_file = seed_dir / 'hotpotqa_summary.json'
    if summary_file.exists():
        with open(summary_file) as f:
            results.append(json.load(f))

if not results:
    print('No results found!')
    exit(1)

print(f'Loaded {len(results)} runs\\n')

# Extract metrics
kp_f1s = [r['kp']['avg_f1'] for r in results if r.get('kp')]
kp_ems = [r['kp']['avg_em'] for r in results if r.get('kp')]
vector_f1s = [r['vector']['avg_f1'] for r in results if r.get('vector')]
vector_ems = [r['vector']['avg_em'] for r in results if r.get('vector')]

# Compute statistics
def stats(values, name):
    mean = np.mean(values)
    std = np.std(values, ddof=1)
    ci_margin = 1.96 * std / np.sqrt(len(values))  # 95% CI
    print(f'{name}:')
    print(f'  Mean: {mean:.4f}')
    print(f'  Std:  {std:.4f}')
    print(f'  95% CI: [{mean - ci_margin:.4f}, {mean + ci_margin:.4f}]')
    print(f'  Range: [{min(values):.4f}, {max(values):.4f}]')
    print()

print('KnowledgePlane F1:')
stats(kp_f1s, 'F1')

print('KnowledgePlane EM:')
stats(kp_ems, 'EM')

print('Vector Baseline F1:')
stats(vector_f1s, 'F1')

print('Vector Baseline EM:')
stats(vector_ems, 'EM')

# Compute improvement statistics
f1_improvements = [kp - vec for kp, vec in zip(kp_f1s, vector_f1s)]
em_improvements = [kp - vec for kp, vec in zip(kp_ems, vector_ems)]

print('Improvements (KP - Baseline):')
print(f'F1 improvement: {np.mean(f1_improvements):.4f} ± {np.std(f1_improvements, ddof=1):.4f}')
print(f'EM improvement: {np.mean(em_improvements):.4f} ± {np.std(em_improvements, ddof=1):.4f}')
print()

# Check consistency
print('Consistency Check:')
consistent_f1 = all(imp > 0 for imp in f1_improvements)
consistent_em = all(imp > 0 for imp in em_improvements)

if consistent_f1:
    print('  ✓ KP consistently outperforms baseline on F1 across all seeds')
else:
    print('  ⚠ KP does not consistently outperform baseline on F1')

if consistent_em:
    print('  ✓ KP consistently outperforms baseline on EM across all seeds')
else:
    print('  ⚠ KP does not consistently outperform baseline on EM')
print()

# Save aggregated results
output = {
    'n_runs': len(results),
    'n_questions_per_run': $N_QUESTIONS,
    'total_questions': $N_QUESTIONS * len(results),
    'kp': {
        'f1_mean': float(np.mean(kp_f1s)),
        'f1_std': float(np.std(kp_f1s, ddof=1)),
        'em_mean': float(np.mean(kp_ems)),
        'em_std': float(np.std(kp_ems, ddof=1))
    },
    'vector': {
        'f1_mean': float(np.mean(vector_f1s)),
        'f1_std': float(np.std(vector_f1s, ddof=1)),
        'em_mean': float(np.mean(vector_ems)),
        'em_std': float(np.std(vector_ems, ddof=1))
    },
    'improvement': {
        'f1_mean': float(np.mean(f1_improvements)),
        'f1_std': float(np.std(f1_improvements, ddof=1)),
        'em_mean': float(np.mean(em_improvements)),
        'em_std': float(np.std(em_improvements, ddof=1)),
        'f1_consistent': consistent_f1,
        'em_consistent': consistent_em
    }
}

with open('$BASE_OUTPUT_DIR/aggregated_results.json', 'w') as f:
    json.dump(output, f, indent=2)

print(f'Aggregated results saved to: $BASE_OUTPUT_DIR/aggregated_results.json')
"

echo ""
echo "========================================================================"
echo "Cross-validation complete!"
echo "========================================================================"
echo ""
echo "Results directory: $BASE_OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "1. Review aggregated_results.json for summary"
echo "2. Check individual seed results for details"
echo "3. If results are consistent, you have robust findings!"
echo ""
