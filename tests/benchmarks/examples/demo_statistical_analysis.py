#!/usr/bin/env python3
"""
Demo: Statistical Analysis for KnowledgePlane Benchmarks

Demonstrates all statistical analysis features with example data.
"""

import sys
sys.path.insert(0, '/Users/altras/home/dev/knowledgeplane/tests/benchmarks')

from statistical_analysis import (
    compute_confidence_interval,
    paired_t_test,
    mcnemar_test,
    bootstrap_confidence_interval,
    effect_size_cohens_d,
    BenchmarkAnalysis
)


def demo_confidence_intervals():
    """Demo confidence interval computation."""
    print("\n" + "=" * 70)
    print("1. CONFIDENCE INTERVALS")
    print("=" * 70)

    scores = [0.85, 0.87, 0.83, 0.86, 0.84, 0.88, 0.82, 0.86]

    # Parametric CI
    mean, lower, upper = compute_confidence_interval(scores)
    print(f"\nParametric 95% CI:")
    print(f"  Mean: {mean:.4f}")
    print(f"  CI: [{lower:.4f}, {upper:.4f}]")
    print(f"  Width: {upper - lower:.4f}")

    # Bootstrap CI
    mean_boot, lower_boot, upper_boot = bootstrap_confidence_interval(
        scores, n_bootstrap=5000, random_state=42
    )
    print(f"\nBootstrap 95% CI (5000 samples):")
    print(f"  Mean: {mean_boot:.4f}")
    print(f"  CI: [{lower_boot:.4f}, {upper_boot:.4f}]")
    print(f"  Width: {upper_boot - lower_boot:.4f}")

    print("\nInterpretation:")
    print("  We're 95% confident the true mean F1 is in this range.")
    print("  Narrower CI = more precise estimate (usually larger sample size).")


def demo_hypothesis_testing():
    """Demo paired t-test."""
    print("\n" + "=" * 70)
    print("2. HYPOTHESIS TESTING (Paired T-Test)")
    print("=" * 70)

    # Clear difference
    kp_scores = [0.90, 0.92, 0.88, 0.91, 0.89, 0.90, 0.91, 0.89]
    baseline_scores = [0.70, 0.72, 0.68, 0.71, 0.69, 0.70, 0.71, 0.69]

    t_stat, p_val = paired_t_test(kp_scores, baseline_scores)

    print(f"\nKnowledgePlane scores: {kp_scores}")
    print(f"Baseline scores:       {baseline_scores}")
    print(f"\nT-statistic: {t_stat:.3f}")
    print(f"P-value:     {p_val:.6f}")

    if p_val < 0.01:
        print("\n✓✓ HIGHLY SIGNIFICANT (p < 0.01)")
        print("   Strong evidence that KnowledgePlane is better!")
    elif p_val < 0.05:
        print("\n✓ SIGNIFICANT (p < 0.05)")
        print("   Evidence that KnowledgePlane is better.")
    else:
        print("\n✗ NOT SIGNIFICANT (p >= 0.05)")
        print("   No strong evidence of difference.")

    # No difference
    print("\n" + "-" * 70)
    print("Testing systems with NO difference:")

    kp_same = [0.80, 0.82, 0.79, 0.81]
    baseline_same = [0.80, 0.82, 0.79, 0.81]

    t_stat2, p_val2 = paired_t_test(kp_same, baseline_same)

    print(f"\nT-statistic: {t_stat2:.3f}")
    print(f"P-value:     {p_val2:.6f}")
    print("\n✗ NOT SIGNIFICANT - systems perform identically")


def demo_mcnemar_test():
    """Demo McNemar's test for binary outcomes."""
    print("\n" + "=" * 70)
    print("3. McNEMAR'S TEST (Binary Outcomes)")
    print("=" * 70)

    # KP gets more questions correct
    kp_correct = [
        True, True, True, True, False,  # 80% correct
        True, True, True, False, True,
    ]
    baseline_correct = [
        False, True, False, False, False,  # 40% correct
        True, False, True, False, False,
    ]

    print("\nScenario: Exact Match scores (correct/incorrect)")
    print(f"KP correct:       {sum(kp_correct)}/10 = {sum(kp_correct)/10:.1%}")
    print(f"Baseline correct: {sum(baseline_correct)}/10 = {sum(baseline_correct)/10:.1%}")

    chi2, p_val = mcnemar_test(kp_correct, baseline_correct)

    print(f"\nχ² statistic: {chi2:.3f}")
    print(f"P-value:      {p_val:.6f}")

    if p_val < 0.05:
        print("\n✓ SIGNIFICANT difference in correctness rates")
        print("  KnowledgePlane answers more questions correctly.")
    else:
        print("\n✗ NOT SIGNIFICANT")

    # Build contingency table for interpretation
    both_correct = sum(k and b for k, b in zip(kp_correct, baseline_correct))
    kp_only = sum(k and not b for k, b in zip(kp_correct, baseline_correct))
    baseline_only = sum(not k and b for k, b in zip(kp_correct, baseline_correct))
    both_wrong = sum(not k and not b for k, b in zip(kp_correct, baseline_correct))

    print("\nContingency Table:")
    print(f"  Both correct:        {both_correct}")
    print(f"  KP only correct:     {kp_only}")
    print(f"  Baseline only:       {baseline_only}")
    print(f"  Both wrong:          {both_wrong}")
    print(f"\nMcNemar focuses on disagreements: {kp_only} vs {baseline_only}")


def demo_effect_size():
    """Demo effect size calculation."""
    print("\n" + "=" * 70)
    print("4. EFFECT SIZE (Cohen's d)")
    print("=" * 70)

    # Large effect
    kp_large = [0.9, 0.92, 0.88, 0.91, 0.89]
    baseline_large = [0.6, 0.62, 0.58, 0.61, 0.59]

    d_large = effect_size_cohens_d(kp_large, baseline_large)

    print("\nScenario 1: Large improvement")
    print(f"KP mean:       {sum(kp_large)/len(kp_large):.3f}")
    print(f"Baseline mean: {sum(baseline_large)/len(baseline_large):.3f}")
    print(f"Cohen's d:     {d_large:.3f}")
    print(f"Interpretation: LARGE effect (d > 0.8)")

    # Medium effect
    kp_medium = [0.8, 0.82, 0.78, 0.81, 0.79]
    baseline_medium = [0.7, 0.72, 0.68, 0.71, 0.69]

    d_medium = effect_size_cohens_d(kp_medium, baseline_medium)

    print("\nScenario 2: Medium improvement")
    print(f"KP mean:       {sum(kp_medium)/len(kp_medium):.3f}")
    print(f"Baseline mean: {sum(baseline_medium)/len(baseline_medium):.3f}")
    print(f"Cohen's d:     {d_medium:.3f}")
    print(f"Interpretation: MEDIUM effect (0.5 < d < 0.8)")

    # Small effect
    kp_small = [0.80, 0.82, 0.78, 0.81]
    baseline_small = [0.78, 0.80, 0.76, 0.79]

    d_small = effect_size_cohens_d(kp_small, baseline_small)

    print("\nScenario 3: Small improvement")
    print(f"KP mean:       {sum(kp_small)/len(kp_small):.3f}")
    print(f"Baseline mean: {sum(baseline_small)/len(baseline_small):.3f}")
    print(f"Cohen's d:     {d_small:.3f}")
    print(f"Interpretation: SMALL effect (0.2 < d < 0.5)")

    print("\n" + "-" * 70)
    print("Effect Size Guidelines:")
    print("  |d| < 0.2  : Negligible")
    print("  |d| ≈ 0.2-0.5 : Small")
    print("  |d| ≈ 0.5-0.8 : Medium")
    print("  |d| ≥ 0.8  : Large")


def demo_full_analysis():
    """Demo comprehensive benchmark analysis."""
    print("\n" + "=" * 70)
    print("5. COMPREHENSIVE BENCHMARK ANALYSIS")
    print("=" * 70)

    # Realistic benchmark scores
    kp_f1 = [0.85, 0.87, 0.83, 0.86, 0.84, 0.88, 0.82, 0.86, 0.85, 0.87]
    baseline_f1 = [0.78, 0.79, 0.76, 0.80, 0.77, 0.81, 0.75, 0.79, 0.78, 0.80]

    print("\nSimulated HotpotQA benchmark results (n=10):")
    print(f"KP F1 scores:       {[f'{x:.2f}' for x in kp_f1]}")
    print(f"Baseline F1 scores: {[f'{x:.2f}' for x in baseline_f1]}")

    # Full analysis
    analyzer = BenchmarkAnalysis(kp_f1, baseline_f1, metric_name="F1 Score")
    analyzer.print_report()

    # Get results programmatically
    results = analyzer.full_analysis()

    print("\nProgrammatic Access:")
    print(f"  KP mean: {results['kp']['mean']:.4f}")
    print(f"  Baseline mean: {results['baseline']['mean']:.4f}")
    print(f"  Improvement: {results['comparison']['improvement_absolute']:.4f} ({results['comparison']['improvement_relative']:.1f}%)")
    print(f"  P-value: {results['comparison']['p_value']:.6f}")
    print(f"  Effect size: {results['comparison']['effect_size']:.2f} ({results['comparison']['effect_interpretation']})")
    print(f"  Significant: {results['comparison']['is_significant']}")


def demo_interpretation_scenarios():
    """Demo different interpretation scenarios."""
    print("\n" + "=" * 70)
    print("6. INTERPRETATION SCENARIOS")
    print("=" * 70)

    # Scenario 1: Clear win
    print("\n" + "-" * 70)
    print("SCENARIO 1: Clear Win (significant + large effect)")
    kp1 = [0.90, 0.92, 0.88, 0.91, 0.89, 0.90]
    base1 = [0.70, 0.72, 0.68, 0.71, 0.69, 0.70]

    t1, p1 = paired_t_test(kp1, base1)
    d1 = effect_size_cohens_d(kp1, base1)

    print(f"P-value: {p1:.4f} (highly significant)")
    print(f"Effect size: {d1:.2f} (large)")
    print("→ STRONG EVIDENCE: KnowledgePlane clearly better, publish results!")

    # Scenario 2: Borderline
    print("\n" + "-" * 70)
    print("SCENARIO 2: Borderline (barely significant + small effect)")
    kp2 = [0.810, 0.815, 0.805, 0.812, 0.808, 0.814, 0.807, 0.813]
    base2 = [0.795, 0.800, 0.790, 0.797, 0.793, 0.799, 0.792, 0.798]

    t2, p2 = paired_t_test(kp2, base2)
    d2 = effect_size_cohens_d(kp2, base2)

    print(f"P-value: {p2:.4f} ({'significant' if p2 < 0.05 else 'not significant'})")
    print(f"Effect size: {d2:.2f} (small)")
    print("→ WEAK EVIDENCE: Collect more data or consider practical significance")

    # Scenario 3: Promising but not significant
    print("\n" + "-" * 70)
    print("SCENARIO 3: Large Effect but Not Significant (small sample)")
    kp3 = [0.90, 0.85, 0.92]
    base3 = [0.70, 0.68, 0.72]

    t3, p3 = paired_t_test(kp3, base3)
    d3 = effect_size_cohens_d(kp3, base3)

    print(f"P-value: {p3:.4f} ({'significant' if p3 < 0.05 else 'not significant'})")
    print(f"Effect size: {d3:.2f} (large)")
    print("→ PROMISING: Large effect visible, need more samples for significance")

    # Scenario 4: Significant but meaningless
    print("\n" + "-" * 70)
    print("SCENARIO 4: Significant but Negligible Effect (large sample)")

    # Large sample with tiny difference
    import numpy as np
    np.random.seed(42)
    kp4 = np.random.normal(0.800, 0.02, 100).tolist()
    base4 = np.random.normal(0.798, 0.02, 100).tolist()

    t4, p4 = paired_t_test(kp4, base4)
    d4 = effect_size_cohens_d(kp4, base4)

    print(f"P-value: {p4:.4f} ({'significant' if p4 < 0.05 else 'not significant'})")
    print(f"Effect size: {d4:.2f} (negligible)")
    print("→ STATISTICALLY SIGNIFICANT but not practically meaningful")
    print("  (Large sample detects tiny difference)")


def main():
    """Run all demos."""
    print("\n" + "=" * 70)
    print("STATISTICAL ANALYSIS DEMO")
    print("KnowledgePlane Benchmarking Suite")
    print("=" * 70)

    demo_confidence_intervals()
    demo_hypothesis_testing()
    demo_mcnemar_test()
    demo_effect_size()
    demo_full_analysis()
    demo_interpretation_scenarios()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print("\nStatistical analysis provides rigorous evidence that KnowledgePlane")
    print("improvements are real and meaningful, not just random chance.")
    print("\nAlways report:")
    print("  1. Mean ± Confidence Interval")
    print("  2. P-value (statistical significance)")
    print("  3. Effect size (practical significance)")
    print("  4. Sample size")
    print("\nBoth p-value AND effect size matter!")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
