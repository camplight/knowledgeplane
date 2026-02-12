#!/usr/bin/env python3
"""
Verification Script: Statistical Analysis Module

Quick smoke test to verify all components are working correctly.
"""

import sys
sys.path.insert(0, '/Users/altras/home/dev/knowledgeplane/tests/benchmarks')

try:
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
    print("✓ All imports successful")
except ImportError as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)

def verify_basic_functions():
    """Verify basic statistical functions work."""
    print("\n" + "=" * 60)
    print("Testing Basic Functions")
    print("=" * 60)

    # Test data
    kp = [0.85, 0.87, 0.83, 0.86, 0.84]
    baseline = [0.78, 0.79, 0.76, 0.80, 0.77]

    try:
        # Confidence interval
        mean, lower, upper = compute_confidence_interval(kp)
        assert 0.80 < mean < 0.90
        assert lower < mean < upper
        print("✓ compute_confidence_interval works")

        # Paired t-test
        t_stat, p_val = paired_t_test(kp, baseline)
        assert -10 < t_stat < 10
        assert 0 <= p_val <= 1
        print("✓ paired_t_test works")

        # McNemar test
        kp_correct = [True, True, False, True, False]
        baseline_correct = [False, True, False, True, True]
        chi2, p_val = mcnemar_test(kp_correct, baseline_correct)
        assert chi2 >= 0
        assert 0 <= p_val <= 1
        print("✓ mcnemar_test works")

        # Bootstrap
        mean, lower, upper = bootstrap_confidence_interval(kp, n_bootstrap=100, random_state=42)
        assert lower <= mean <= upper
        print("✓ bootstrap_confidence_interval works")

        # Effect size
        d = effect_size_cohens_d(kp, baseline)
        assert -5 < d < 5
        print("✓ effect_size_cohens_d works")

    except Exception as e:
        print(f"✗ Function test failed: {e}")
        return False

    return True


def verify_benchmark_analysis():
    """Verify BenchmarkAnalysis class works."""
    print("\n" + "=" * 60)
    print("Testing BenchmarkAnalysis Class")
    print("=" * 60)

    kp = [0.85, 0.87, 0.83, 0.86, 0.84]
    baseline = [0.78, 0.79, 0.76, 0.80, 0.77]

    try:
        analyzer = BenchmarkAnalysis(kp, baseline, metric_name="Test F1")
        print("✓ BenchmarkAnalysis created")

        results = analyzer.full_analysis()
        assert 'kp' in results
        assert 'baseline' in results
        assert 'comparison' in results
        assert 'metadata' in results
        print("✓ full_analysis works")

        assert 'mean' in results['kp']
        assert 'ci_lower' in results['kp']
        assert 'p_value' in results['comparison']
        assert 'effect_size' in results['comparison']
        print("✓ Results structure correct")

        # Test print_report doesn't crash
        print("\n" + "-" * 60)
        analyzer.print_report()
        print("-" * 60)
        print("✓ print_report works")

        # Test bootstrap mode
        results_bootstrap = analyzer.full_analysis(use_bootstrap=True)
        assert results_bootstrap['metadata']['ci_method'] == 'bootstrap'
        print("✓ Bootstrap mode works")

    except Exception as e:
        print(f"✗ BenchmarkAnalysis test failed: {e}")
        return False

    return True


def verify_csv_functions():
    """Verify CSV analysis functions work."""
    print("\n" + "=" * 60)
    print("Testing CSV Analysis Functions")
    print("=" * 60)

    import pandas as pd
    import tempfile
    import os

    # Create test CSV
    df = pd.DataFrame({
        'kp_f1': [0.85, 0.87, 0.83, 0.86, 0.84],
        'vector_f1': [0.78, 0.79, 0.76, 0.80, 0.77],
        'kp_em': [1.0, 1.0, 0.0, 1.0, 0.0],
        'vector_em': [0.0, 1.0, 0.0, 1.0, 1.0]
    })

    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        df.to_csv(f.name, index=False)
        temp_csv = f.name

    try:
        # Test analyze_benchmark_results
        print("\n" + "-" * 60)
        print("Testing analyze_benchmark_results:")
        print("-" * 60)
        results = analyze_benchmark_results(
            temp_csv,
            kp_metric_col='kp_f1',
            baseline_metric_col='vector_f1',
            metric_name='F1'
        )
        assert 'comparison' in results
        print("✓ analyze_benchmark_results works")

        # Test compare_multiple_metrics
        print("\n" + "-" * 60)
        print("Testing compare_multiple_metrics:")
        print("-" * 60)
        all_results = compare_multiple_metrics(
            temp_csv,
            metric_pairs=[
                ('kp_f1', 'vector_f1', 'F1'),
                ('kp_em', 'vector_em', 'EM')
            ]
        )
        assert 'F1' in all_results
        assert 'EM' in all_results
        print("✓ compare_multiple_metrics works")

    except Exception as e:
        print(f"✗ CSV function test failed: {e}")
        return False
    finally:
        os.unlink(temp_csv)

    return True


def verify_edge_cases():
    """Verify edge cases are handled correctly."""
    print("\n" + "=" * 60)
    print("Testing Edge Cases")
    print("=" * 60)

    try:
        # Identical scores
        identical = [0.8, 0.8, 0.8]
        mean, lower, upper = compute_confidence_interval(identical)
        assert abs(upper - lower) < 0.001
        print("✓ Identical scores handled")

        # Very different scores
        kp = [0.9, 0.92, 0.88]
        baseline = [0.3, 0.32, 0.28]
        t_stat, p_val = paired_t_test(kp, baseline)
        assert p_val < 0.05  # Should be significant
        print("✓ Large differences detected")

        # No difference
        same1 = [0.8, 0.82, 0.79]
        same2 = [0.8, 0.82, 0.79]
        t_stat, p_val = paired_t_test(same1, same2)
        assert p_val > 0.9  # Should not be significant
        print("✓ No difference detected correctly")

        # Small sample
        small_kp = [0.85, 0.87]
        small_baseline = [0.78, 0.79]
        analyzer = BenchmarkAnalysis(small_kp, small_baseline)
        results = analyzer.full_analysis()
        assert results['kp']['n_samples'] == 2
        print("✓ Small samples handled")

    except Exception as e:
        print(f"✗ Edge case test failed: {e}")
        return False

    return True


def verify_dependencies():
    """Check that all required dependencies are available."""
    print("\n" + "=" * 60)
    print("Checking Dependencies")
    print("=" * 60)

    required = ['numpy', 'scipy', 'pandas']
    missing = []

    for pkg in required:
        try:
            __import__(pkg)
            print(f"✓ {pkg} available")
        except ImportError:
            print(f"✗ {pkg} missing")
            missing.append(pkg)

    if missing:
        print(f"\n✗ Missing dependencies: {', '.join(missing)}")
        print("Install with: pip install scipy>=1.11.0")
        return False

    return True


def main():
    """Run all verification tests."""
    print("\n" + "=" * 60)
    print("STATISTICAL ANALYSIS MODULE VERIFICATION")
    print("=" * 60)

    tests = [
        ("Dependencies", verify_dependencies),
        ("Basic Functions", verify_basic_functions),
        ("BenchmarkAnalysis Class", verify_benchmark_analysis),
        ("CSV Functions", verify_csv_functions),
        ("Edge Cases", verify_edge_cases)
    ]

    results = []
    for name, test_func in tests:
        try:
            success = test_func()
            results.append((name, success))
        except Exception as e:
            print(f"\n✗ {name} test crashed: {e}")
            results.append((name, False))

    # Summary
    print("\n" + "=" * 60)
    print("VERIFICATION SUMMARY")
    print("=" * 60)

    for name, success in results:
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"{status:<8} {name}")

    all_passed = all(success for _, success in results)

    print("\n" + "=" * 60)
    if all_passed:
        print("✓✓ ALL TESTS PASSED")
        print("Statistical analysis module is ready to use!")
    else:
        print("✗✗ SOME TESTS FAILED")
        print("Please fix issues before using module.")
    print("=" * 60 + "\n")

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
