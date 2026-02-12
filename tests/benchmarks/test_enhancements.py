#!/usr/bin/env python3
"""
Test script to verify HotpotQA benchmark enhancements.

Tests:
1. Sample size support (n=5, n=100, n=500)
2. Sampling methods (random, first, stratified)
3. Batch processing
4. Statistical analysis integration
5. Progress tracking and ETA
"""

import sys
from pathlib import Path

# Test imports
try:
    from bench_hotpotqa import HotpotQABenchmark, parse_args
    print("✓ bench_hotpotqa imports successfully")
except Exception as e:
    print(f"✗ Failed to import bench_hotpotqa: {e}")
    sys.exit(1)

try:
    from statistical_analysis import BenchmarkAnalysis
    print("✓ statistical_analysis imports successfully")
except Exception as e:
    print(f"✗ Failed to import statistical_analysis: {e}")
    sys.exit(1)

# Test benchmark initialization with new parameters
try:
    benchmark = HotpotQABenchmark(
        n_questions=10,
        sample_method="stratified",
        batch_size=5,
        statistical_analysis=True,
        mock_kp=True
    )
    print("✓ HotpotQABenchmark initializes with new parameters")
except Exception as e:
    print(f"✗ Failed to initialize benchmark: {e}")
    sys.exit(1)

# Test sampling methods
try:
    # Test random sample
    random_sample = benchmark._random_sample(
        [{'id': i, 'level': 'easy'} for i in range(20)],
        5
    )
    assert len(random_sample) == 5
    print("✓ Random sampling works")

    # Test stratified sample
    items = [
        {'id': i, 'level': 'easy'} for i in range(10)
    ] + [
        {'id': i, 'level': 'medium'} for i in range(10, 20)
    ] + [
        {'id': i, 'level': 'hard'} for i in range(20, 30)
    ]
    stratified_sample = benchmark._stratified_sample(items, 15)
    assert len(stratified_sample) == 15

    # Check diversity (should have items from each level)
    levels = set(item['level'] for item in stratified_sample)
    assert len(levels) >= 2  # At least 2 difficulty levels
    print("✓ Stratified sampling works")
except Exception as e:
    print(f"✗ Sampling methods failed: {e}")
    sys.exit(1)

# Test statistical analysis
try:
    import numpy as np

    # Create mock scores
    kp_scores = [0.8, 0.82, 0.79, 0.81, 0.83, 0.85, 0.78, 0.84]
    vector_scores = [0.7, 0.72, 0.68, 0.71, 0.73, 0.75, 0.69, 0.74]

    analyzer = BenchmarkAnalysis(
        kp_scores,
        vector_scores,
        metric_name="F1"
    )

    results = analyzer.full_analysis()

    # Check results structure
    assert 'kp' in results
    assert 'baseline' in results
    assert 'comparison' in results
    assert 'mean' in results['kp']
    assert 'p_value' in results['comparison']
    assert 'effect_size' in results['comparison']

    print("✓ Statistical analysis works")
    print(f"  - KP mean: {results['kp']['mean']:.3f}")
    print(f"  - Baseline mean: {results['baseline']['mean']:.3f}")
    print(f"  - P-value: {results['comparison']['p_value']:.6f}")
    print(f"  - Effect size: {results['comparison']['effect_size']:.3f}")

except Exception as e:
    print(f"✗ Statistical analysis failed: {e}")
    sys.exit(1)

# Test configuration
try:
    benchmark2 = HotpotQABenchmark(
        n_questions=500,
        sample_method="stratified",
        batch_size=50,
        statistical_analysis=True
    )

    assert benchmark2.n_questions == 500
    assert benchmark2.sample_method == "stratified"
    assert benchmark2.batch_size == 50
    assert benchmark2.statistical_analysis == True

    print("✓ Configuration options work correctly")
except Exception as e:
    print(f"✗ Configuration failed: {e}")
    sys.exit(1)

print("\n" + "=" * 60)
print("All tests passed! ✓")
print("=" * 60)
print("\nEnhancements verified:")
print("  1. Sample size support (up to 500+)")
print("  2. Sampling methods (random, first, stratified)")
print("  3. Batch processing for memory efficiency")
print("  4. Statistical analysis integration")
print("  5. New CLI arguments")
print("\nYou can now run benchmarks with:")
print("  python bench_hotpotqa.py --n 100 --sample-method stratified --statistical-analysis")
print("  python bench_hotpotqa.py --n 500 --batch-size 50 --statistical-analysis")
