"""
Statistical Analysis Module for KnowledgePlane Benchmarks

Provides rigorous statistical testing to determine if KnowledgePlane improvements
over vector baseline are statistically significant, not just random chance.

Includes:
- Confidence intervals (parametric and bootstrap)
- Paired t-tests for continuous metrics
- McNemar's test for binary outcomes (EM scores)
- Effect size calculations (Cohen's d)
- Comprehensive reporting
"""

from typing import List, Tuple, Dict, Optional
import numpy as np
from scipy import stats
import warnings


def compute_confidence_interval(
    scores: List[float],
    confidence: float = 0.95
) -> Tuple[float, float, float]:
    """
    Compute mean and confidence interval using t-distribution.

    Args:
        scores: List of metric scores
        confidence: Confidence level (default 0.95 for 95% CI)

    Returns:
        Tuple of (mean, lower_bound, upper_bound)

    Example:
        >>> scores = [0.8, 0.82, 0.79, 0.81, 0.83]
        >>> mean, lower, upper = compute_confidence_interval(scores)
        >>> print(f"Mean: {mean:.3f}, 95% CI: [{lower:.3f}, {upper:.3f}]")
    """
    if len(scores) == 0:
        raise ValueError("Cannot compute confidence interval on empty list")

    if len(scores) == 1:
        warnings.warn("Only one score provided, confidence interval will be zero-width")
        return scores[0], scores[0], scores[0]

    mean = np.mean(scores)
    std_error = stats.sem(scores)

    # Use t-distribution for small samples
    degrees_freedom = len(scores) - 1
    t_critical = stats.t.ppf((1 + confidence) / 2, degrees_freedom)
    margin_error = std_error * t_critical

    return mean, mean - margin_error, mean + margin_error


def paired_t_test(
    system1_scores: List[float],
    system2_scores: List[float],
    alternative: str = "two-sided"
) -> Tuple[float, float]:
    """
    Perform paired t-test to compare two systems on same test set.

    Tests null hypothesis that the paired differences have mean = 0.

    Args:
        system1_scores: Scores from first system (e.g., KnowledgePlane)
        system2_scores: Scores from second system (e.g., vector baseline)
        alternative: "two-sided", "greater", or "less"

    Returns:
        Tuple of (t_statistic, p_value)

    Example:
        >>> kp_scores = [0.85, 0.87, 0.83, 0.88]
        >>> baseline_scores = [0.78, 0.79, 0.76, 0.80]
        >>> t_stat, p_val = paired_t_test(kp_scores, baseline_scores)
        >>> if p_val < 0.05:
        ...     print("Statistically significant improvement!")
    """
    if len(system1_scores) != len(system2_scores):
        raise ValueError("Both systems must have same number of scores (paired data)")

    if len(system1_scores) < 2:
        raise ValueError("Need at least 2 paired samples for t-test")

    t_stat, p_val = stats.ttest_rel(
        system1_scores,
        system2_scores,
        alternative=alternative
    )

    return float(t_stat), float(p_val)


def mcnemar_test(
    system1_correct: List[bool],
    system2_correct: List[bool]
) -> Tuple[float, float]:
    """
    McNemar's test for paired binary outcomes (e.g., EM scores: correct/incorrect).

    Tests whether the two systems have the same error rate.
    More appropriate than t-test for binary success/failure outcomes.

    Args:
        system1_correct: Boolean list of correctness for system 1
        system2_correct: Boolean list of correctness for system 2

    Returns:
        Tuple of (chi2_statistic, p_value)

    Example:
        >>> kp_correct = [True, True, False, True, False]
        >>> baseline_correct = [False, True, False, True, True]
        >>> chi2, p_val = mcnemar_test(kp_correct, baseline_correct)
    """
    if len(system1_correct) != len(system2_correct):
        raise ValueError("Both systems must have same number of outcomes (paired data)")

    # Build 2x2 contingency table
    both_correct = sum(s1 and s2 for s1, s2 in zip(system1_correct, system2_correct))
    s1_only = sum(s1 and not s2 for s1, s2 in zip(system1_correct, system2_correct))
    s2_only = sum(not s1 and s2 for s1, s2 in zip(system1_correct, system2_correct))
    both_wrong = sum(not s1 and not s2 for s1, s2 in zip(system1_correct, system2_correct))

    # McNemar test uses only discordant pairs (b and c in contingency table)
    # If no disagreement, systems are identical
    if s1_only + s2_only == 0:
        return 0.0, 1.0

    # Use continuity correction for small samples
    chi2 = (abs(s1_only - s2_only) - 1) ** 2 / (s1_only + s2_only)
    p_val = 1 - stats.chi2.cdf(chi2, df=1)

    return float(chi2), float(p_val)


def bootstrap_confidence_interval(
    scores: List[float],
    n_bootstrap: int = 10000,
    confidence: float = 0.95,
    random_state: Optional[int] = None
) -> Tuple[float, float, float]:
    """
    Bootstrap confidence interval for more robust estimates.

    Uses resampling to estimate the sampling distribution without
    assuming normality. More reliable for small samples or non-normal data.

    Args:
        scores: List of metric scores
        n_bootstrap: Number of bootstrap samples
        confidence: Confidence level (default 0.95)
        random_state: Random seed for reproducibility

    Returns:
        Tuple of (mean, lower_bound, upper_bound)

    Example:
        >>> scores = [0.75, 0.78, 0.82, 0.79, 0.81]
        >>> mean, lower, upper = bootstrap_confidence_interval(scores, n_bootstrap=5000)
    """
    if len(scores) == 0:
        raise ValueError("Cannot bootstrap empty list")

    if random_state is not None:
        np.random.seed(random_state)

    scores_array = np.array(scores)
    bootstrap_means = []

    for _ in range(n_bootstrap):
        sample = np.random.choice(scores_array, size=len(scores_array), replace=True)
        bootstrap_means.append(np.mean(sample))

    mean = float(np.mean(scores_array))
    alpha = 1 - confidence
    lower = float(np.percentile(bootstrap_means, alpha / 2 * 100))
    upper = float(np.percentile(bootstrap_means, (1 - alpha / 2) * 100))

    return mean, lower, upper


def effect_size_cohens_d(
    system1_scores: List[float],
    system2_scores: List[float]
) -> float:
    """
    Cohen's d effect size for difference between two systems.

    Measures standardized mean difference:
    - Small effect: d ~ 0.2
    - Medium effect: d ~ 0.5
    - Large effect: d ~ 0.8

    Args:
        system1_scores: Scores from first system
        system2_scores: Scores from second system

    Returns:
        Cohen's d value (positive means system1 > system2)

    Example:
        >>> kp_scores = [0.85, 0.87, 0.83]
        >>> baseline_scores = [0.75, 0.78, 0.73]
        >>> d = effect_size_cohens_d(kp_scores, baseline_scores)
        >>> print(f"Effect size: {d:.2f} (large)" if d > 0.8 else f"Effect size: {d:.2f}")
    """
    mean1 = np.mean(system1_scores)
    mean2 = np.mean(system2_scores)

    # Pooled standard deviation
    var1 = np.var(system1_scores, ddof=1)
    var2 = np.var(system2_scores, ddof=1)
    pooled_std = np.sqrt((var1 + var2) / 2)

    if pooled_std == 0:
        # If no variance, systems are identical or constant
        return 0.0

    return float((mean1 - mean2) / pooled_std)


class BenchmarkAnalysis:
    """
    Comprehensive statistical analysis of benchmark results.

    Compares KnowledgePlane against vector baseline with:
    - Descriptive statistics
    - Confidence intervals
    - Hypothesis testing
    - Effect size estimation

    Example:
        >>> kp_f1 = [0.85, 0.87, 0.83, 0.86, 0.84]
        >>> baseline_f1 = [0.78, 0.79, 0.76, 0.80, 0.77]
        >>> analyzer = BenchmarkAnalysis(kp_f1, baseline_f1)
        >>> results = analyzer.full_analysis()
        >>> analyzer.print_report()
    """

    def __init__(
        self,
        kp_scores: List[float],
        baseline_scores: List[float],
        metric_name: str = "F1"
    ):
        """
        Initialize analyzer with paired scores.

        Args:
            kp_scores: KnowledgePlane scores
            baseline_scores: Vector baseline scores
            metric_name: Name of metric being compared (for reporting)
        """
        if len(kp_scores) != len(baseline_scores):
            raise ValueError("KP and baseline must have same number of scores")

        if len(kp_scores) < 2:
            raise ValueError("Need at least 2 samples for statistical analysis")

        self.kp_scores = np.array(kp_scores)
        self.baseline_scores = np.array(baseline_scores)
        self.metric_name = metric_name

    def full_analysis(self, use_bootstrap: bool = False) -> Dict:
        """
        Perform complete statistical analysis.

        Args:
            use_bootstrap: Use bootstrap CI instead of parametric (more robust)

        Returns:
            Dictionary with all statistical results
        """
        # Descriptive statistics with confidence intervals
        if use_bootstrap:
            kp_mean, kp_lower, kp_upper = bootstrap_confidence_interval(
                self.kp_scores.tolist()
            )
            base_mean, base_lower, base_upper = bootstrap_confidence_interval(
                self.baseline_scores.tolist()
            )
        else:
            kp_mean, kp_lower, kp_upper = compute_confidence_interval(
                self.kp_scores.tolist()
            )
            base_mean, base_lower, base_upper = compute_confidence_interval(
                self.baseline_scores.tolist()
            )

        # Hypothesis testing (paired t-test)
        t_stat, p_val = paired_t_test(
            self.kp_scores.tolist(),
            self.baseline_scores.tolist()
        )

        # Effect size
        effect_size = effect_size_cohens_d(
            self.kp_scores.tolist(),
            self.baseline_scores.tolist()
        )

        # Determine significance level
        is_significant = p_val < 0.05
        is_highly_significant = p_val < 0.01

        # Effect size interpretation
        if abs(effect_size) < 0.2:
            effect_interpretation = "negligible"
        elif abs(effect_size) < 0.5:
            effect_interpretation = "small"
        elif abs(effect_size) < 0.8:
            effect_interpretation = "medium"
        else:
            effect_interpretation = "large"

        return {
            "kp": {
                "mean": float(kp_mean),
                "ci_lower": float(kp_lower),
                "ci_upper": float(kp_upper),
                "std": float(np.std(self.kp_scores)),
                "median": float(np.median(self.kp_scores)),
                "min": float(np.min(self.kp_scores)),
                "max": float(np.max(self.kp_scores)),
                "n_samples": len(self.kp_scores)
            },
            "baseline": {
                "mean": float(base_mean),
                "ci_lower": float(base_lower),
                "ci_upper": float(base_upper),
                "std": float(np.std(self.baseline_scores)),
                "median": float(np.median(self.baseline_scores)),
                "min": float(np.min(self.baseline_scores)),
                "max": float(np.max(self.baseline_scores)),
                "n_samples": len(self.baseline_scores)
            },
            "comparison": {
                "t_statistic": float(t_stat),
                "p_value": float(p_val),
                "is_significant": is_significant,
                "is_highly_significant": is_highly_significant,
                "effect_size": float(effect_size),
                "effect_interpretation": effect_interpretation,
                "improvement_absolute": float(kp_mean - base_mean),
                "improvement_relative": float((kp_mean - base_mean) / base_mean * 100) if base_mean != 0 else 0.0
            },
            "metadata": {
                "metric_name": self.metric_name,
                "ci_method": "bootstrap" if use_bootstrap else "parametric",
                "test_type": "paired_t_test"
            }
        }

    def print_report(self, use_bootstrap: bool = False):
        """
        Print human-readable analysis report.

        Args:
            use_bootstrap: Use bootstrap CI instead of parametric
        """
        analysis = self.full_analysis(use_bootstrap=use_bootstrap)

        print("\n" + "=" * 70)
        print(f"Statistical Analysis Report: {self.metric_name}")
        print("=" * 70)

        print("\nKnowledgePlane:")
        print(f"  Mean:       {analysis['kp']['mean']:.4f}")
        print(f"  95% CI:     [{analysis['kp']['ci_lower']:.4f}, {analysis['kp']['ci_upper']:.4f}]")
        print(f"  Std Dev:    {analysis['kp']['std']:.4f}")
        print(f"  Median:     {analysis['kp']['median']:.4f}")
        print(f"  Range:      [{analysis['kp']['min']:.4f}, {analysis['kp']['max']:.4f}]")

        print("\nVector Baseline:")
        print(f"  Mean:       {analysis['baseline']['mean']:.4f}")
        print(f"  95% CI:     [{analysis['baseline']['ci_lower']:.4f}, {analysis['baseline']['ci_upper']:.4f}]")
        print(f"  Std Dev:    {analysis['baseline']['std']:.4f}")
        print(f"  Median:     {analysis['baseline']['median']:.4f}")
        print(f"  Range:      [{analysis['baseline']['min']:.4f}, {analysis['baseline']['max']:.4f}]")

        print("\nStatistical Comparison:")
        print(f"  Absolute Improvement:  {analysis['comparison']['improvement_absolute']:+.4f}")
        print(f"  Relative Improvement:  {analysis['comparison']['improvement_relative']:+.2f}%")
        print(f"  Effect Size (Cohen's d): {analysis['comparison']['effect_size']:.3f} ({analysis['comparison']['effect_interpretation']})")
        print(f"  T-statistic:           {analysis['comparison']['t_statistic']:.3f}")
        print(f"  P-value:               {analysis['comparison']['p_value']:.6f}")

        print("\nSignificance:")
        if analysis['comparison']['is_highly_significant']:
            print("  ✓✓ HIGHLY SIGNIFICANT (p < 0.01)")
            print("  Strong evidence that KnowledgePlane outperforms baseline")
        elif analysis['comparison']['is_significant']:
            print("  ✓ SIGNIFICANT (p < 0.05)")
            print("  Evidence that KnowledgePlane outperforms baseline")
        else:
            print("  ✗ NOT SIGNIFICANT (p >= 0.05)")
            print("  Insufficient evidence of difference between systems")

        print("\nInterpretation:")
        comp = analysis['comparison']
        if comp['is_significant'] and comp['effect_size'] > 0.5:
            print("  KnowledgePlane shows both statistically significant AND")
            print("  practically meaningful improvement over vector baseline.")
        elif comp['is_significant']:
            print("  KnowledgePlane shows statistically significant improvement,")
            print("  but effect size is small. Consider practical significance.")
        elif comp['effect_size'] > 0.5:
            print("  Effect size is medium/large but not statistically significant.")
            print("  May need more samples to detect the effect reliably.")
        else:
            print("  No strong evidence of improvement. Systems perform similarly.")

        print("\n" + "=" * 70 + "\n")


def analyze_benchmark_results(
    results_csv_path: str,
    kp_metric_col: str = "kp_f1",
    baseline_metric_col: str = "vector_f1",
    metric_name: str = "F1",
    use_bootstrap: bool = False
) -> Dict:
    """
    Load benchmark results CSV and perform statistical analysis.

    Args:
        results_csv_path: Path to results CSV file
        kp_metric_col: Column name for KP scores
        baseline_metric_col: Column name for baseline scores
        metric_name: Display name for metric
        use_bootstrap: Use bootstrap CI (more robust for small samples)

    Returns:
        Statistical analysis dictionary

    Example:
        >>> results = analyze_benchmark_results(
        ...     "output/hotpotqa_results.csv",
        ...     kp_metric_col="kp_f1",
        ...     baseline_metric_col="vector_f1"
        ... )
        >>> print(f"P-value: {results['comparison']['p_value']:.4f}")
    """
    import pandas as pd

    df = pd.read_csv(results_csv_path)

    # Extract scores, drop NaN values
    kp_scores = df[kp_metric_col].dropna().tolist()
    baseline_scores = df[baseline_metric_col].dropna().tolist()

    if len(kp_scores) != len(baseline_scores):
        # Try to align by index if lengths differ
        valid_indices = df[kp_metric_col].notna() & df[baseline_metric_col].notna()
        kp_scores = df.loc[valid_indices, kp_metric_col].tolist()
        baseline_scores = df.loc[valid_indices, baseline_metric_col].tolist()

    if len(kp_scores) == 0:
        raise ValueError(f"No valid paired data found in {results_csv_path}")

    analyzer = BenchmarkAnalysis(kp_scores, baseline_scores, metric_name=metric_name)
    analyzer.print_report(use_bootstrap=use_bootstrap)

    return analyzer.full_analysis(use_bootstrap=use_bootstrap)


def compare_multiple_metrics(
    results_csv_path: str,
    metric_pairs: List[Tuple[str, str, str]],
    use_bootstrap: bool = False
) -> Dict[str, Dict]:
    """
    Analyze multiple metrics from same benchmark results.

    Args:
        results_csv_path: Path to results CSV
        metric_pairs: List of (kp_col, baseline_col, metric_name) tuples
        use_bootstrap: Use bootstrap CI

    Returns:
        Dictionary mapping metric names to their analysis results

    Example:
        >>> results = compare_multiple_metrics(
        ...     "output/hotpotqa_results.csv",
        ...     metric_pairs=[
        ...         ("kp_f1", "vector_f1", "F1"),
        ...         ("kp_em", "vector_em", "EM"),
        ...         ("kp_precision", "vector_precision", "Precision")
        ...     ]
        ... )
    """
    import pandas as pd

    df = pd.read_csv(results_csv_path)
    results = {}

    for kp_col, baseline_col, metric_name in metric_pairs:
        if kp_col not in df.columns or baseline_col not in df.columns:
            print(f"Warning: Skipping {metric_name} - columns not found")
            continue

        try:
            # Extract and align scores
            valid_indices = df[kp_col].notna() & df[baseline_col].notna()
            kp_scores = df.loc[valid_indices, kp_col].tolist()
            baseline_scores = df.loc[valid_indices, baseline_col].tolist()

            if len(kp_scores) < 2:
                print(f"Warning: Skipping {metric_name} - insufficient data")
                continue

            analyzer = BenchmarkAnalysis(kp_scores, baseline_scores, metric_name=metric_name)
            results[metric_name] = analyzer.full_analysis(use_bootstrap=use_bootstrap)

        except Exception as e:
            print(f"Warning: Failed to analyze {metric_name}: {e}")
            continue

    return results


if __name__ == "__main__":
    # Example usage
    print("Statistical Analysis Module for KnowledgePlane Benchmarks")
    print("\nExample: Comparing KP vs Baseline")

    # Simulated benchmark results
    kp_f1_scores = [0.85, 0.87, 0.83, 0.86, 0.84, 0.88, 0.82, 0.86]
    baseline_f1_scores = [0.78, 0.79, 0.76, 0.80, 0.77, 0.81, 0.75, 0.79]

    analyzer = BenchmarkAnalysis(kp_f1_scores, baseline_f1_scores, metric_name="F1 Score")
    analyzer.print_report()

    # JSON output for programmatic use
    results = analyzer.full_analysis()
    print("\nJSON Output (for programmatic use):")
    import json
    print(json.dumps(results, indent=2))
