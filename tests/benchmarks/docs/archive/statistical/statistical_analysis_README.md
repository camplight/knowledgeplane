# Statistical Analysis Module - README

## Quick Integration Guide

### 1. Install Dependencies
```bash
pip install scipy>=1.11.0
```

### 2. Add to Existing Benchmark Scripts

#### For bench_hotpotqa.py
Add at the end of the file, after collecting all results:

```python
# Statistical Analysis
print("\n" + "=" * 70)
print("STATISTICAL SIGNIFICANCE ANALYSIS")
print("=" * 70)

from statistical_analysis import BenchmarkAnalysis

# Extract scores
kp_f1_scores = [r["kp_f1"] for r in all_results]
baseline_f1_scores = [r["vector_f1"] for r in all_results]

# Analyze
analyzer = BenchmarkAnalysis(kp_f1_scores, baseline_f1_scores, metric_name="F1 Score")
analyzer.print_report()

# Get results programmatically
analysis = analyzer.full_analysis()
if analysis['comparison']['is_significant']:
    print(f"\n✓ KnowledgePlane significantly outperforms baseline")
    print(f"  Improvement: {analysis['comparison']['improvement_relative']:.1f}%")
    print(f"  Effect size: {analysis['comparison']['effect_size']:.2f} ({analysis['comparison']['effect_interpretation']})")
```

#### For bench_freshness.py
Similar integration:

```python
from statistical_analysis import BenchmarkAnalysis

# Assuming you have staleness rates
kp_staleness = [r["kp_staleness_rate"] for r in results]
baseline_staleness = [r["baseline_staleness_rate"] for r in results]

analyzer = BenchmarkAnalysis(kp_staleness, baseline_staleness, metric_name="Staleness Rate")
analyzer.print_report()
```

#### For run_all.py
Add after all benchmarks complete:

```python
print("\n" + "=" * 70)
print("STATISTICAL ANALYSIS OF BENCHMARK RESULTS")
print("=" * 70)

from statistical_analysis import analyze_benchmark_results, compare_multiple_metrics

# Analyze HotpotQA results if available
if os.path.exists("output/hotpotqa_results.csv"):
    print("\n" + "-" * 70)
    print("HotpotQA Analysis:")
    print("-" * 70)

    compare_multiple_metrics(
        "output/hotpotqa_results.csv",
        metric_pairs=[
            ("kp_f1", "vector_f1", "F1"),
            ("kp_em", "vector_em", "EM"),
            ("kp_precision", "vector_precision", "Precision"),
            ("kp_recall", "vector_recall", "Recall")
        ]
    )

# Analyze Freshness results if available
if os.path.exists("output/freshness_results.csv"):
    print("\n" + "-" * 70)
    print("Freshness Analysis:")
    print("-" * 70)

    analyze_benchmark_results(
        "output/freshness_results.csv",
        kp_metric_col="kp_staleness_rate",
        baseline_metric_col="baseline_staleness_rate",
        metric_name="Staleness Rate"
    )
```

### 3. Standalone Analysis

If you've already run benchmarks and have CSV files:

```bash
cd /Users/altras/home/dev/knowledgeplane/tests/benchmarks
python
```

```python
from statistical_analysis import analyze_benchmark_results

# Analyze your results
analyze_benchmark_results(
    "output/hotpotqa_results.csv",
    kp_metric_col="kp_f1",
    baseline_metric_col="vector_f1",
    metric_name="F1 Score"
)
```

## Verification

Test that everything works:

```bash
cd /Users/altras/home/dev/knowledgeplane/tests/benchmarks
python demos/verify_statistical_analysis.py
```

Expected output:
```
✓ ALL TESTS PASSED
Statistical analysis module is ready to use!
```

## Run Demos

See all features in action:

```bash
# Feature demonstrations
python demos/demo_statistical_analysis.py

# Integration examples
python demos/integration_example.py
```

## Run Tests

```bash
pytest tests/test_statistical_analysis.py -v
```

## Files Created

All files in `/Users/altras/home/dev/knowledgeplane/tests/benchmarks/`:

### Core Module
- `statistical_analysis.py` (19K) - Main module with all statistical functions

### Tests
- `tests/test_statistical_analysis.py` (16K) - Comprehensive test suite

### Documentation
- `docs/STATISTICAL_ANALYSIS.md` (15K) - Complete guide
- `docs/STATISTICAL_QUICK_REFERENCE.md` (4.4K) - Quick reference
- `docs/statistical_analysis_README.md` - This file
- `STATISTICAL_ANALYSIS_SUMMARY.md` (9.6K) - Implementation summary

### Demos
- `demos/demo_statistical_analysis.py` (11K) - Feature demos
- `demos/integration_example.py` (12K) - Integration examples
- `demos/verify_statistical_analysis.py` (8.2K) - Verification script

### Updated
- `requirements-bench.txt` - Added scipy>=1.11.0

## Quick Reference

### Common Functions

```python
from statistical_analysis import (
    BenchmarkAnalysis,           # Main analysis class
    analyze_benchmark_results,   # Analyze CSV file
    compare_multiple_metrics,    # Compare multiple metrics
    paired_t_test,              # T-test
    mcnemar_test,               # Binary outcomes
    effect_size_cohens_d,       # Effect size
    compute_confidence_interval, # CI
    bootstrap_confidence_interval # Bootstrap CI
)
```

### Interpreting Results

| P-value | Effect Size | Meaning |
|---------|-------------|---------|
| < 0.01 | > 0.8 | ✓✓ Strong evidence, large effect |
| < 0.05 | > 0.5 | ✓ Moderate evidence, medium effect |
| < 0.05 | < 0.2 | ~ Weak evidence, small effect |
| ≥ 0.05 | Any | ✗ Not significant |

### Effect Size Guide

- **Large (d ≥ 0.8)**: Substantial practical improvement
- **Medium (d ≥ 0.5)**: Notable practical improvement
- **Small (d ≥ 0.2)**: Minor practical improvement
- **Negligible (d < 0.2)**: Not practically meaningful

## Help

- **Quick start**: This file
- **Full guide**: `docs/STATISTICAL_ANALYSIS.md`
- **Cheatsheet**: `docs/STATISTICAL_QUICK_REFERENCE.md`
- **Examples**: `demos/demo_statistical_analysis.py`
- **Integration**: `demos/integration_example.py`
- **Summary**: `STATISTICAL_ANALYSIS_SUMMARY.md`

## Example Output

When you run the analysis, you'll see:

```
======================================================================
Statistical Analysis Report: F1 Score
======================================================================

KnowledgePlane:
  Mean:       0.8540
  95% CI:     [0.8312, 0.8768]
  Std Dev:    0.0158
  Median:     0.8500
  Range:      [0.8300, 0.8700]

Vector Baseline:
  Mean:       0.7780
  95% CI:     [0.7552, 0.8008]
  Std Dev:    0.0158
  Median:     0.7800
  Range:      [0.7600, 0.8000]

Statistical Comparison:
  Absolute Improvement:  +0.0760
  Relative Improvement:  +9.77%
  Effect Size (Cohen's d): 4.807 (large)
  T-statistic:           10.750
  P-value:               0.000432

Significance:
  ✓✓ HIGHLY SIGNIFICANT (p < 0.01)
  Strong evidence that KnowledgePlane outperforms baseline

Interpretation:
  KnowledgePlane shows both statistically significant AND
  practically meaningful improvement over vector baseline.
```

## Next Steps

1. Install scipy: `pip install scipy>=1.11.0`
2. Run verification: `python demos/verify_statistical_analysis.py`
3. Try demos: `python demos/demo_statistical_analysis.py`
4. Integrate into your benchmarks (see examples above)
5. Report results with statistical evidence!

---

**Ready to use!** 🎯 All tests pass, comprehensive documentation included.
