#!/usr/bin/env python3
"""
Integration Example: Adding Statistical Analysis to Benchmarks

Shows how to integrate statistical_analysis.py into existing benchmark scripts
like bench_hotpotqa.py or bench_freshness.py.
"""

import sys
sys.path.insert(0, '/Users/altras/home/dev/knowledgeplane/tests/benchmarks')

import pandas as pd
import numpy as np
from statistical_analysis import (
    BenchmarkAnalysis,
    analyze_benchmark_results,
    compare_multiple_metrics
)


# ============================================================================
# EXAMPLE 1: Integration at end of benchmark script
# ============================================================================

def example_inline_analysis():
    """
    Add statistical analysis directly in benchmark script after running tests.
    """
    print("\n" + "=" * 70)
    print("EXAMPLE 1: Inline Analysis in Benchmark Script")
    print("=" * 70)

    # Simulate benchmark results (normally you'd run actual benchmarks)
    np.random.seed(42)
    n_questions = 50

    # KP performs better on average
    kp_f1_scores = np.random.beta(8, 2, n_questions).tolist()  # Mean ~0.8
    baseline_f1_scores = np.random.beta(7, 3, n_questions).tolist()  # Mean ~0.7

    print(f"\nSimulated benchmark on {n_questions} questions")
    print(f"KP F1 range: [{min(kp_f1_scores):.3f}, {max(kp_f1_scores):.3f}]")
    print(f"Baseline F1 range: [{min(baseline_f1_scores):.3f}, {max(baseline_f1_scores):.3f}]")

    # Perform statistical analysis
    print("\n" + "-" * 70)
    print("Statistical Analysis:")
    print("-" * 70)

    analyzer = BenchmarkAnalysis(
        kp_f1_scores,
        baseline_f1_scores,
        metric_name="F1 Score"
    )
    analyzer.print_report()

    # Get results for programmatic use
    results = analyzer.full_analysis()

    # Make decisions based on results
    print("\nDecision:")
    if results['comparison']['is_significant'] and results['comparison']['effect_size'] > 0.5:
        print("✓ Strong evidence: KP significantly better with meaningful effect")
        print("  → Recommend deploying KnowledgePlane")
    elif results['comparison']['is_significant']:
        print("✓ Weak evidence: Significant but small effect")
        print("  → Consider cost/benefit of improvement")
    else:
        print("✗ No significant difference detected")
        print("  → May need larger sample size")


# ============================================================================
# EXAMPLE 2: Analyze existing CSV results
# ============================================================================

def example_analyze_csv():
    """
    Analyze results from previously saved CSV file.
    """
    print("\n" + "=" * 70)
    print("EXAMPLE 2: Analyze Existing CSV Results")
    print("=" * 70)

    # Create sample CSV (normally you'd load actual results)
    np.random.seed(42)
    n = 30

    df = pd.DataFrame({
        'question_id': range(n),
        'kp_f1': np.random.beta(8, 2, n),
        'vector_f1': np.random.beta(7, 3, n),
        'kp_em': np.random.binomial(1, 0.7, n),
        'vector_em': np.random.binomial(1, 0.5, n),
        'kp_precision': np.random.beta(9, 2, n),
        'vector_precision': np.random.beta(7, 2, n)
    })

    # Save to temporary CSV
    csv_path = '/tmp/benchmark_results.csv'
    df.to_csv(csv_path, index=False)
    print(f"\nCreated sample CSV: {csv_path}")
    print(f"Rows: {len(df)}")

    # Analyze single metric
    print("\n" + "-" * 70)
    print("Analyzing F1 Score:")
    print("-" * 70)

    f1_results = analyze_benchmark_results(
        csv_path,
        kp_metric_col='kp_f1',
        baseline_metric_col='vector_f1',
        metric_name='F1 Score'
    )

    # Analyze multiple metrics
    print("\n" + "-" * 70)
    print("Analyzing All Metrics:")
    print("-" * 70)

    all_results = compare_multiple_metrics(
        csv_path,
        metric_pairs=[
            ('kp_f1', 'vector_f1', 'F1'),
            ('kp_em', 'vector_em', 'EM'),
            ('kp_precision', 'vector_precision', 'Precision')
        ]
    )

    # Summary table
    print("\n" + "=" * 70)
    print("SUMMARY TABLE")
    print("=" * 70)
    print(f"{'Metric':<12} {'KP Mean':<10} {'Base Mean':<10} {'Improve':<10} {'P-value':<10} {'Effect':<8} {'Sig?'}")
    print("-" * 70)

    for metric_name, results in all_results.items():
        kp_mean = results['kp']['mean']
        base_mean = results['baseline']['mean']
        improve = results['comparison']['improvement_absolute']
        p_val = results['comparison']['p_value']
        effect = results['comparison']['effect_size']
        sig = '✓' if results['comparison']['is_significant'] else '✗'

        print(f"{metric_name:<12} {kp_mean:<10.4f} {base_mean:<10.4f} {improve:+<10.4f} {p_val:<10.6f} {effect:<8.2f} {sig}")


# ============================================================================
# EXAMPLE 3: Integration with run_all.py
# ============================================================================

def example_run_all_integration():
    """
    Show how to add statistical analysis to run_all.py.
    """
    print("\n" + "=" * 70)
    print("EXAMPLE 3: Integration with run_all.py")
    print("=" * 70)

    print("\nAdd this code to run_all.py after running benchmarks:\n")

    code = '''
# At the end of run_all.py, after all benchmarks complete

print("\\n" + "=" * 70)
print("STATISTICAL SIGNIFICANCE ANALYSIS")
print("=" * 70)

from statistical_analysis import analyze_benchmark_results, compare_multiple_metrics

# Analyze HotpotQA results
if os.path.exists("output/hotpotqa_results.csv"):
    print("\\n" + "-" * 70)
    print("HotpotQA Results:")
    print("-" * 70)

    hotpotqa_results = compare_multiple_metrics(
        "output/hotpotqa_results.csv",
        metric_pairs=[
            ("kp_f1", "vector_f1", "F1"),
            ("kp_em", "vector_em", "EM"),
            ("kp_precision", "vector_precision", "Precision"),
            ("kp_recall", "vector_recall", "Recall")
        ]
    )

    # Summary
    for metric, results in hotpotqa_results.items():
        if results['comparison']['is_significant']:
            improve = results['comparison']['improvement_relative']
            print(f"✓ {metric}: KP better by {improve:.1f}% (p={results['comparison']['p_value']:.4f})")

# Analyze Freshness results
if os.path.exists("output/freshness_results.csv"):
    print("\\n" + "-" * 70)
    print("Freshness Results:")
    print("-" * 70)

    freshness_results = analyze_benchmark_results(
        "output/freshness_results.csv",
        kp_metric_col="kp_staleness_rate",
        baseline_metric_col="baseline_staleness_rate",
        metric_name="Staleness Rate"
    )

    if freshness_results['comparison']['is_significant']:
        print("✓ KP has significantly lower staleness rate")

print("\\n" + "=" * 70)
print("Statistical analysis complete!")
print("=" * 70)
'''

    print(code)


# ============================================================================
# EXAMPLE 4: Custom analysis with filtering
# ============================================================================

def example_custom_filtering():
    """
    Perform statistical analysis on subset of data (e.g., hard questions only).
    """
    print("\n" + "=" * 70)
    print("EXAMPLE 4: Custom Analysis with Filtering")
    print("=" * 70)

    # Create sample data with difficulty levels
    np.random.seed(42)
    n = 100

    df = pd.DataFrame({
        'question_id': range(n),
        'difficulty': np.random.choice(['easy', 'medium', 'hard'], n),
        'kp_f1': np.random.beta(8, 2, n),
        'vector_f1': np.random.beta(7, 3, n)
    })

    print(f"\nTotal questions: {len(df)}")
    print(f"Difficulty breakdown: {df['difficulty'].value_counts().to_dict()}")

    # Analyze by difficulty
    for difficulty in ['easy', 'medium', 'hard']:
        subset = df[df['difficulty'] == difficulty]

        if len(subset) < 2:
            continue

        print("\n" + "-" * 70)
        print(f"Analysis: {difficulty.upper()} Questions (n={len(subset)})")
        print("-" * 70)

        kp_scores = subset['kp_f1'].tolist()
        baseline_scores = subset['vector_f1'].tolist()

        analyzer = BenchmarkAnalysis(
            kp_scores,
            baseline_scores,
            metric_name=f"F1 ({difficulty})"
        )

        results = analyzer.full_analysis()

        # Compact summary
        print(f"\nKP:       {results['kp']['mean']:.3f} [{results['kp']['ci_lower']:.3f}, {results['kp']['ci_upper']:.3f}]")
        print(f"Baseline: {results['baseline']['mean']:.3f} [{results['baseline']['ci_lower']:.3f}, {results['baseline']['ci_upper']:.3f}]")
        print(f"P-value:  {results['comparison']['p_value']:.4f} {'(significant)' if results['comparison']['is_significant'] else '(not significant)'}")
        print(f"Effect:   {results['comparison']['effect_size']:.2f} ({results['comparison']['effect_interpretation']})")


# ============================================================================
# EXAMPLE 5: Comparing across multiple benchmark datasets
# ============================================================================

def example_cross_dataset_comparison():
    """
    Compare KP vs baseline across multiple datasets (HotpotQA, NQ, etc.).
    """
    print("\n" + "=" * 70)
    print("EXAMPLE 5: Cross-Dataset Comparison")
    print("=" * 70)

    # Simulate results from different datasets
    datasets = {
        'HotpotQA': {
            'kp': [0.85, 0.87, 0.83, 0.86, 0.84],
            'baseline': [0.78, 0.79, 0.76, 0.80, 0.77]
        },
        'Natural Questions': {
            'kp': [0.82, 0.84, 0.80, 0.83, 0.81],
            'baseline': [0.75, 0.76, 0.73, 0.77, 0.74]
        },
        'SQuAD': {
            'kp': [0.88, 0.90, 0.86, 0.89, 0.87],
            'baseline': [0.82, 0.83, 0.80, 0.84, 0.81]
        }
    }

    print("\nComparing KP vs Baseline across multiple datasets:\n")

    results_summary = []

    for dataset_name, scores in datasets.items():
        analyzer = BenchmarkAnalysis(
            scores['kp'],
            scores['baseline'],
            metric_name=dataset_name
        )

        results = analyzer.full_analysis()
        results_summary.append({
            'dataset': dataset_name,
            'kp_mean': results['kp']['mean'],
            'baseline_mean': results['baseline']['mean'],
            'improvement': results['comparison']['improvement_absolute'],
            'p_value': results['comparison']['p_value'],
            'effect_size': results['comparison']['effect_size'],
            'significant': results['comparison']['is_significant']
        })

    # Print summary table
    print(f"{'Dataset':<20} {'KP':<8} {'Base':<8} {'Δ':<8} {'P-val':<10} {'Effect':<8} {'Sig?'}")
    print("-" * 75)

    for r in results_summary:
        sig = '✓' if r['significant'] else '✗'
        print(f"{r['dataset']:<20} {r['kp_mean']:<8.3f} {r['baseline_mean']:<8.3f} "
              f"{r['improvement']:+<8.3f} {r['p_value']:<10.4f} {r['effect_size']:<8.2f} {sig}")

    print("\n" + "=" * 70)
    print("Conclusion:")
    all_significant = all(r['significant'] for r in results_summary)
    if all_significant:
        print("✓ KP significantly outperforms baseline across ALL datasets")
        print("  Strong evidence of consistent improvement")
    else:
        n_sig = sum(r['significant'] for r in results_summary)
        print(f"✓ KP significantly better on {n_sig}/{len(results_summary)} datasets")
        print("  Mixed evidence, investigate dataset differences")


# ============================================================================
# Main
# ============================================================================

def main():
    """Run all integration examples."""
    print("\n" + "=" * 70)
    print("STATISTICAL ANALYSIS INTEGRATION EXAMPLES")
    print("KnowledgePlane Benchmarking Suite")
    print("=" * 70)

    example_inline_analysis()
    example_analyze_csv()
    example_run_all_integration()
    example_custom_filtering()
    example_cross_dataset_comparison()

    print("\n" + "=" * 70)
    print("INTEGRATION COMPLETE")
    print("=" * 70)
    print("\nNext steps:")
    print("1. Add statistical_analysis imports to benchmark scripts")
    print("2. Call BenchmarkAnalysis after running benchmarks")
    print("3. Report both p-values and effect sizes")
    print("4. Make data-driven decisions based on statistical evidence")
    print("\nSee docs/STATISTICAL_ANALYSIS.md for full documentation")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
