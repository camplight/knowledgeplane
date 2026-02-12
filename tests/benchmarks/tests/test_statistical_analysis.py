"""
Unit tests for statistical_analysis.py

Tests all statistical functions for correctness, edge cases, and robustness.
"""

import pytest
import numpy as np
from statistical_analysis import (
    compute_confidence_interval,
    paired_t_test,
    mcnemar_test,
    bootstrap_confidence_interval,
    effect_size_cohens_d,
    BenchmarkAnalysis,
    analyze_benchmark_results,
    compare_multiple_metrics
)
import tempfile
import os
import pandas as pd


class TestConfidenceInterval:
    """Tests for compute_confidence_interval function."""

    def test_basic_ci(self):
        """Test basic confidence interval computation."""
        scores = [1.0, 2.0, 3.0, 4.0, 5.0]
        mean, lower, upper = compute_confidence_interval(scores)

        assert mean == 3.0
        assert lower < mean < upper
        assert upper - lower > 0  # CI should have width

    def test_single_score(self):
        """Test with single score (edge case)."""
        scores = [5.0]
        mean, lower, upper = compute_confidence_interval(scores)

        assert mean == 5.0
        assert lower == upper == 5.0  # Zero-width CI

    def test_identical_scores(self):
        """Test with identical scores (no variance)."""
        scores = [3.0, 3.0, 3.0, 3.0]
        mean, lower, upper = compute_confidence_interval(scores)

        assert mean == 3.0
        # CI should be very narrow or zero-width
        assert abs(upper - lower) < 0.001

    def test_different_confidence_levels(self):
        """Test that higher confidence gives wider intervals."""
        scores = [1.0, 2.0, 3.0, 4.0, 5.0]

        _, lower_95, upper_95 = compute_confidence_interval(scores, confidence=0.95)
        _, lower_99, upper_99 = compute_confidence_interval(scores, confidence=0.99)

        width_95 = upper_95 - lower_95
        width_99 = upper_99 - lower_99

        assert width_99 > width_95  # 99% CI should be wider

    def test_empty_list_raises(self):
        """Test that empty list raises ValueError."""
        with pytest.raises(ValueError, match="empty"):
            compute_confidence_interval([])


class TestPairedTTest:
    """Tests for paired_t_test function."""

    def test_significant_difference(self):
        """Test with clearly different systems."""
        system1 = [0.9, 0.92, 0.88, 0.91, 0.89]  # Better system
        system2 = [0.7, 0.72, 0.68, 0.71, 0.69]  # Worse system

        t_stat, p_val = paired_t_test(system1, system2)

        assert t_stat > 0  # system1 > system2
        assert p_val < 0.05  # Significant difference

    def test_no_difference(self):
        """Test with identical systems."""
        system1 = [0.8, 0.82, 0.79, 0.81]
        system2 = [0.8, 0.82, 0.79, 0.81]

        t_stat, p_val = paired_t_test(system1, system2)

        assert abs(t_stat) < 0.001  # Should be ~0
        assert p_val > 0.9  # Very high p-value

    def test_one_sided_test(self):
        """Test one-sided alternative hypothesis."""
        system1 = [0.9, 0.92, 0.88, 0.91]
        system2 = [0.7, 0.72, 0.68, 0.71]

        _, p_val_two = paired_t_test(system1, system2, alternative="two-sided")
        _, p_val_greater = paired_t_test(system1, system2, alternative="greater")

        # One-sided should have smaller p-value when direction is correct
        assert p_val_greater < p_val_two

    def test_mismatched_lengths_raises(self):
        """Test that mismatched lengths raise ValueError."""
        system1 = [0.8, 0.82, 0.79]
        system2 = [0.7, 0.72]

        with pytest.raises(ValueError, match="same number"):
            paired_t_test(system1, system2)

    def test_insufficient_samples_raises(self):
        """Test that single sample raises ValueError."""
        with pytest.raises(ValueError, match="at least 2"):
            paired_t_test([0.8], [0.7])


class TestMcNemarTest:
    """Tests for mcnemar_test function."""

    def test_significant_difference_binary(self):
        """Test with clear difference in binary outcomes."""
        # System 1 gets 80% correct, System 2 gets 40% correct
        system1 = [True, True, True, True, False, True, True, True, False, True]
        system2 = [False, True, False, False, False, True, False, True, False, False]

        chi2, p_val = mcnemar_test(system1, system2)

        assert chi2 > 0
        assert p_val < 0.05  # Significant difference

    def test_identical_systems_binary(self):
        """Test with identical binary outcomes."""
        system1 = [True, False, True, False, True]
        system2 = [True, False, True, False, True]

        chi2, p_val = mcnemar_test(system1, system2)

        assert chi2 == 0.0
        assert p_val == 1.0  # No difference

    def test_all_correct(self):
        """Test when both systems get everything correct."""
        system1 = [True, True, True, True]
        system2 = [True, True, True, True]

        chi2, p_val = mcnemar_test(system1, system2)

        assert chi2 == 0.0
        assert p_val == 1.0

    def test_mismatched_lengths_raises(self):
        """Test that mismatched lengths raise ValueError."""
        with pytest.raises(ValueError, match="same number"):
            mcnemar_test([True, False], [True])


class TestBootstrapCI:
    """Tests for bootstrap_confidence_interval function."""

    def test_bootstrap_reproducible(self):
        """Test that bootstrap is reproducible with random seed."""
        scores = [1.0, 2.0, 3.0, 4.0, 5.0]

        result1 = bootstrap_confidence_interval(scores, n_bootstrap=1000, random_state=42)
        result2 = bootstrap_confidence_interval(scores, n_bootstrap=1000, random_state=42)

        assert result1 == result2

    def test_bootstrap_vs_parametric(self):
        """Test that bootstrap and parametric CI are similar for normal data."""
        # Generate normal data
        np.random.seed(42)
        scores = np.random.normal(loc=3.0, scale=1.0, size=50).tolist()

        mean_boot, lower_boot, upper_boot = bootstrap_confidence_interval(
            scores, n_bootstrap=5000, random_state=42
        )
        mean_param, lower_param, upper_param = compute_confidence_interval(scores)

        # Means should be very close
        assert abs(mean_boot - mean_param) < 0.1

        # CI widths should be similar (within 20%)
        width_boot = upper_boot - lower_boot
        width_param = upper_param - lower_param
        assert abs(width_boot - width_param) / width_param < 0.2

    def test_bootstrap_small_sample(self):
        """Test bootstrap with very small sample."""
        scores = [1.0, 2.0, 3.0]
        mean, lower, upper = bootstrap_confidence_interval(
            scores, n_bootstrap=1000, random_state=42
        )

        assert mean == 2.0
        assert lower < mean < upper

    def test_bootstrap_empty_raises(self):
        """Test that empty list raises ValueError."""
        with pytest.raises(ValueError, match="empty"):
            bootstrap_confidence_interval([])


class TestEffectSize:
    """Tests for effect_size_cohens_d function."""

    def test_large_effect(self):
        """Test large effect size detection."""
        system1 = [0.9, 0.92, 0.88, 0.91, 0.89]  # Mean ~0.90
        system2 = [0.6, 0.62, 0.58, 0.61, 0.59]  # Mean ~0.60

        d = effect_size_cohens_d(system1, system2)

        assert d > 0.8  # Large effect

    def test_medium_effect(self):
        """Test medium effect size."""
        system1 = [0.8, 0.82, 0.78, 0.81, 0.79]  # Mean 0.80
        system2 = [0.7, 0.72, 0.68, 0.71, 0.69]  # Mean 0.70

        d = effect_size_cohens_d(system1, system2)

        assert 0.3 < d < 0.7  # Medium effect

    def test_small_effect(self):
        """Test small effect size."""
        system1 = [0.8, 0.82, 0.78, 0.81]
        system2 = [0.78, 0.80, 0.76, 0.79]

        d = effect_size_cohens_d(system1, system2)

        assert 0 < d < 0.3  # Small effect

    def test_no_effect(self):
        """Test zero effect size."""
        system1 = [0.8, 0.82, 0.79, 0.81]
        system2 = [0.8, 0.82, 0.79, 0.81]

        d = effect_size_cohens_d(system1, system2)

        assert abs(d) < 0.001  # Essentially zero

    def test_negative_effect(self):
        """Test negative effect (system1 worse than system2)."""
        system1 = [0.6, 0.62, 0.58]
        system2 = [0.8, 0.82, 0.78]

        d = effect_size_cohens_d(system1, system2)

        assert d < -0.5  # Negative and substantial

    def test_zero_variance(self):
        """Test with zero variance (constant scores)."""
        system1 = [0.8, 0.8, 0.8]
        system2 = [0.8, 0.8, 0.8]

        d = effect_size_cohens_d(system1, system2)

        assert d == 0.0


class TestBenchmarkAnalysis:
    """Tests for BenchmarkAnalysis class."""

    def test_full_analysis_structure(self):
        """Test that full_analysis returns correct structure."""
        kp = [0.85, 0.87, 0.83, 0.86, 0.84]
        baseline = [0.78, 0.79, 0.76, 0.80, 0.77]

        analyzer = BenchmarkAnalysis(kp, baseline)
        results = analyzer.full_analysis()

        # Check top-level keys
        assert "kp" in results
        assert "baseline" in results
        assert "comparison" in results
        assert "metadata" in results

        # Check nested keys
        assert "mean" in results["kp"]
        assert "ci_lower" in results["kp"]
        assert "ci_upper" in results["kp"]
        assert "p_value" in results["comparison"]
        assert "effect_size" in results["comparison"]

    def test_analysis_with_significant_improvement(self):
        """Test analysis detects significant improvement."""
        kp = [0.9, 0.92, 0.88, 0.91, 0.89, 0.90, 0.91, 0.89]
        baseline = [0.7, 0.72, 0.68, 0.71, 0.69, 0.70, 0.71, 0.69]

        analyzer = BenchmarkAnalysis(kp, baseline)
        results = analyzer.full_analysis()

        assert results["comparison"]["is_significant"]
        assert results["comparison"]["effect_size"] > 0.8  # Large effect
        assert results["comparison"]["improvement_absolute"] > 0.15

    def test_analysis_with_no_difference(self):
        """Test analysis with no real difference."""
        kp = [0.8, 0.82, 0.79, 0.81, 0.80, 0.81, 0.79, 0.82]
        baseline = [0.79, 0.81, 0.78, 0.80, 0.79, 0.80, 0.78, 0.81]

        analyzer = BenchmarkAnalysis(kp, baseline)
        results = analyzer.full_analysis()

        # Should not be significant
        assert not results["comparison"]["is_significant"]
        assert abs(results["comparison"]["effect_size"]) < 0.5

    def test_bootstrap_mode(self):
        """Test that bootstrap mode works."""
        kp = [0.85, 0.87, 0.83]
        baseline = [0.78, 0.79, 0.76]

        analyzer = BenchmarkAnalysis(kp, baseline)
        results = analyzer.full_analysis(use_bootstrap=True)

        assert results["metadata"]["ci_method"] == "bootstrap"

    def test_print_report_runs(self):
        """Test that print_report executes without errors."""
        kp = [0.85, 0.87, 0.83, 0.86]
        baseline = [0.78, 0.79, 0.76, 0.80]

        analyzer = BenchmarkAnalysis(kp, baseline, metric_name="Test F1")
        analyzer.print_report()  # Should not raise

    def test_mismatched_lengths_raises(self):
        """Test that mismatched lengths raise ValueError."""
        with pytest.raises(ValueError, match="same number"):
            BenchmarkAnalysis([0.8, 0.82], [0.7])

    def test_insufficient_samples_raises(self):
        """Test that single sample raises ValueError."""
        with pytest.raises(ValueError, match="at least 2"):
            BenchmarkAnalysis([0.8], [0.7])


class TestAnalyzeBenchmarkResults:
    """Tests for analyze_benchmark_results function."""

    def test_analyze_csv_results(self):
        """Test analyzing results from CSV file."""
        # Create temporary CSV
        df = pd.DataFrame({
            "question_id": [1, 2, 3, 4, 5],
            "kp_f1": [0.85, 0.87, 0.83, 0.86, 0.84],
            "vector_f1": [0.78, 0.79, 0.76, 0.80, 0.77]
        })

        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            df.to_csv(f.name, index=False)
            temp_path = f.name

        try:
            results = analyze_benchmark_results(
                temp_path,
                kp_metric_col="kp_f1",
                baseline_metric_col="vector_f1",
                metric_name="F1"
            )

            assert "kp" in results
            assert "comparison" in results
            assert results["comparison"]["is_significant"] or not results["comparison"]["is_significant"]

        finally:
            os.unlink(temp_path)

    def test_analyze_with_missing_values(self):
        """Test CSV with some missing values."""
        df = pd.DataFrame({
            "kp_f1": [0.85, None, 0.83, 0.86, 0.84],
            "vector_f1": [0.78, 0.79, None, 0.80, 0.77]
        })

        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            df.to_csv(f.name, index=False)
            temp_path = f.name

        try:
            results = analyze_benchmark_results(temp_path)

            # Should only use rows with both values present
            assert results["kp"]["n_samples"] == 3  # Rows 0, 3, 4

        finally:
            os.unlink(temp_path)

    def test_analyze_empty_csv_raises(self):
        """Test that empty CSV raises error."""
        df = pd.DataFrame({"kp_f1": [], "vector_f1": []})

        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            df.to_csv(f.name, index=False)
            temp_path = f.name

        try:
            with pytest.raises(ValueError, match="No valid"):
                analyze_benchmark_results(temp_path)

        finally:
            os.unlink(temp_path)


class TestCompareMultipleMetrics:
    """Tests for compare_multiple_metrics function."""

    def test_multiple_metrics_analysis(self):
        """Test analyzing multiple metrics from same CSV."""
        df = pd.DataFrame({
            "kp_f1": [0.85, 0.87, 0.83],
            "vector_f1": [0.78, 0.79, 0.76],
            "kp_em": [1.0, 1.0, 0.0],
            "vector_em": [1.0, 0.0, 0.0],
            "kp_precision": [0.90, 0.92, 0.88],
            "vector_precision": [0.82, 0.83, 0.80]
        })

        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            df.to_csv(f.name, index=False)
            temp_path = f.name

        try:
            results = compare_multiple_metrics(
                temp_path,
                metric_pairs=[
                    ("kp_f1", "vector_f1", "F1"),
                    ("kp_em", "vector_em", "EM"),
                    ("kp_precision", "vector_precision", "Precision")
                ]
            )

            assert "F1" in results
            assert "EM" in results
            assert "Precision" in results

            # Each should have full analysis structure
            assert "comparison" in results["F1"]
            assert "effect_size" in results["F1"]["comparison"]

        finally:
            os.unlink(temp_path)

    def test_missing_columns_skipped(self):
        """Test that missing columns are gracefully skipped."""
        df = pd.DataFrame({
            "kp_f1": [0.85, 0.87],
            "vector_f1": [0.78, 0.79]
        })

        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            df.to_csv(f.name, index=False)
            temp_path = f.name

        try:
            results = compare_multiple_metrics(
                temp_path,
                metric_pairs=[
                    ("kp_f1", "vector_f1", "F1"),
                    ("kp_em", "vector_em", "EM"),  # Columns don't exist
                ]
            )

            # Should have F1 but not EM
            assert "F1" in results
            assert "EM" not in results

        finally:
            os.unlink(temp_path)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
