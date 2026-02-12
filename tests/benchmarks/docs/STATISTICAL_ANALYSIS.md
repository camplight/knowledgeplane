# Statistical Analysis for KnowledgePlane Benchmarks

## Why Statistical Significance Matters

When comparing KnowledgePlane against vector baseline, we observe differences in metrics like F1, EM, and Precision. But are these differences **real improvements** or just **random chance**?

**Statistical significance testing** answers this question by quantifying the probability that observed differences could occur by chance alone.

### The Problem

Consider these F1 scores:
- KnowledgePlane: 0.85
- Vector Baseline: 0.78

Is 0.07 improvement significant? It depends on:
1. **Sample size**: 5 questions vs 1000 questions
2. **Variance**: Consistent scores vs highly variable
3. **Effect size**: Small improvements may not be practically meaningful even if significant

### Our Approach

We use rigorous statistical methods to:
1. Quantify uncertainty with **confidence intervals**
2. Test hypotheses with **p-values** (paired t-tests)
3. Measure practical importance with **effect sizes** (Cohen's d)
4. Use appropriate tests for different metrics (t-test for F1, McNemar for EM)

## Statistical Tests We Use

### 1. Confidence Intervals (CI)

**What it is**: Range of plausible values for the true mean performance

**When to use**: Always report CIs with means

**Interpretation**:
```
KnowledgePlane F1: 0.85 [95% CI: 0.82, 0.88]
```
- We're 95% confident the true KP F1 is between 0.82 and 0.88
- Narrower CI = more precise estimate (usually from larger samples)
- If KP and baseline CIs don't overlap, strong evidence of difference

**Methods**:
- **Parametric CI**: Fast, assumes normal distribution, good for n > 30
- **Bootstrap CI**: Slower, no distribution assumptions, better for small n

### 2. Paired T-Test

**What it is**: Tests if the mean difference between paired samples is zero

**When to use**: Comparing continuous metrics (F1, Precision, Recall) on same test set

**Null hypothesis**: KnowledgePlane and baseline have identical mean performance

**Interpretation**:
```python
t_statistic = 3.45
p_value = 0.003
```

- **p < 0.05**: Statistically significant (reject null, difference is real)
- **p < 0.01**: Highly significant (strong evidence)
- **p ≥ 0.05**: Not significant (cannot reject null, difference may be chance)

**Why paired?** Each question is answered by both systems, so we compare on same data (more powerful than independent t-test)

### 3. McNemar's Test

**What it is**: Tests difference in binary outcomes (correct/incorrect)

**When to use**: Comparing Exact Match (EM) scores where each answer is either right (1) or wrong (0)

**Why not t-test?** Binary data violates t-test assumptions (need normality for continuous data)

**Contingency table**:
```
                  Baseline Correct    Baseline Wrong
KP Correct              50                 20
KP Wrong                10                 20
```

McNemar focuses on **disagreements** (20 vs 10):
- If KP gets 20 right that baseline missed, but baseline only gets 10 right that KP missed
- Strong evidence KP is better

### 4. Effect Size (Cohen's d)

**What it is**: Standardized measure of difference magnitude

**Why it matters**:
- p-value tells if difference is **real**
- Effect size tells if difference is **important**

**Interpretation**:
- |d| < 0.2: Negligible effect
- |d| ≈ 0.2-0.5: Small effect
- |d| ≈ 0.5-0.8: Medium effect
- |d| ≥ 0.8: Large effect

**Example**:
```python
d = 1.2  # Large effect
p = 0.001  # Highly significant
```
→ KnowledgePlane has both **statistically significant** AND **practically meaningful** improvement

**Warning**: With large samples, tiny differences can be significant but not meaningful:
```python
d = 0.05  # Negligible effect
p = 0.001  # Significant due to large n
```
→ Significant but not practically important

### 5. Bootstrap Confidence Intervals

**What it is**: Resampling method to estimate CI without assuming normal distribution

**When to use**:
- Small samples (n < 30)
- Non-normal data (skewed, outliers)
- Robustness check

**How it works**:
1. Resample data 10,000 times with replacement
2. Calculate mean for each resample
3. Use percentiles as CI bounds

**Trade-off**: More robust but computationally slower

## Usage Guide

### Basic Usage

```python
from statistical_analysis import BenchmarkAnalysis

# Your benchmark results
kp_f1_scores = [0.85, 0.87, 0.83, 0.86, 0.84]
baseline_f1_scores = [0.78, 0.79, 0.76, 0.80, 0.77]

# Create analyzer
analyzer = BenchmarkAnalysis(kp_f1_scores, baseline_f1_scores, metric_name="F1")

# Print full report
analyzer.print_report()

# Get results as dictionary
results = analyzer.full_analysis()
print(f"P-value: {results['comparison']['p_value']:.4f}")
print(f"Effect size: {results['comparison']['effect_size']:.2f}")
```

### Analyzing CSV Results

```python
from statistical_analysis import analyze_benchmark_results

# Analyze results from benchmark CSV
results = analyze_benchmark_results(
    "output/hotpotqa_results.csv",
    kp_metric_col="kp_f1",
    baseline_metric_col="vector_f1",
    metric_name="F1 Score"
)

# Prints full report and returns results dict
if results['comparison']['is_significant']:
    print("KnowledgePlane significantly outperforms baseline!")
```

### Multiple Metrics

```python
from statistical_analysis import compare_multiple_metrics

# Analyze F1, EM, Precision in one call
all_results = compare_multiple_metrics(
    "output/hotpotqa_results.csv",
    metric_pairs=[
        ("kp_f1", "vector_f1", "F1"),
        ("kp_em", "vector_em", "EM"),
        ("kp_precision", "vector_precision", "Precision")
    ]
)

for metric_name, results in all_results.items():
    print(f"\n{metric_name}:")
    print(f"  P-value: {results['comparison']['p_value']:.4f}")
    print(f"  Effect size: {results['comparison']['effect_size']:.2f}")
```

### Binary Outcomes (EM)

```python
from statistical_analysis import mcnemar_test

# For Exact Match scores (binary: correct or incorrect)
kp_em = [True, True, False, True, True, False, True]
baseline_em = [False, True, False, True, False, False, False]

chi2, p_val = mcnemar_test(kp_em, baseline_em)
print(f"McNemar's test: χ² = {chi2:.2f}, p = {p_val:.4f}")

if p_val < 0.05:
    print("Significant difference in correctness rates")
```

### Bootstrap for Small Samples

```python
# Use bootstrap when you have few samples (n < 30)
analyzer = BenchmarkAnalysis(kp_scores, baseline_scores)

# Bootstrap CI (slower but more robust)
results = analyzer.full_analysis(use_bootstrap=True)
analyzer.print_report(use_bootstrap=True)
```

### Individual Statistical Functions

```python
from statistical_analysis import (
    compute_confidence_interval,
    paired_t_test,
    effect_size_cohens_d,
    bootstrap_confidence_interval
)

# Confidence interval
scores = [0.85, 0.87, 0.83, 0.86, 0.84]
mean, lower, upper = compute_confidence_interval(scores)
print(f"Mean: {mean:.3f}, 95% CI: [{lower:.3f}, {upper:.3f}]")

# T-test
t_stat, p_val = paired_t_test(kp_scores, baseline_scores)
print(f"T-test: t = {t_stat:.2f}, p = {p_val:.4f}")

# Effect size
d = effect_size_cohens_d(kp_scores, baseline_scores)
print(f"Cohen's d = {d:.2f}")

# Bootstrap
mean, lower, upper = bootstrap_confidence_interval(scores, n_bootstrap=10000)
print(f"Bootstrap CI: [{lower:.3f}, {upper:.3f}]")
```

## Interpreting Results

### Report Structure

The `BenchmarkAnalysis.print_report()` outputs:

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

### Decision Tree

**Question**: Is KnowledgePlane better than baseline?

```
1. Check p-value:
   ├─ p < 0.01 → Highly significant ✓✓
   ├─ p < 0.05 → Significant ✓
   └─ p ≥ 0.05 → Not significant ✗

2. Check effect size (Cohen's d):
   ├─ |d| ≥ 0.8 → Large practical improvement
   ├─ |d| ≥ 0.5 → Medium practical improvement
   ├─ |d| ≥ 0.2 → Small practical improvement
   └─ |d| < 0.2 → Negligible practical improvement

3. Decision:
   ├─ Significant + Large effect → STRONG EVIDENCE of improvement
   ├─ Significant + Medium effect → MODERATE EVIDENCE of improvement
   ├─ Significant + Small effect → WEAK EVIDENCE (may not be meaningful)
   ├─ Not significant + Large effect → Need more data
   └─ Not significant + Small effect → No evidence of difference
```

### Common Scenarios

#### Scenario 1: Clear Win
```
P-value: 0.001 (highly significant)
Effect size: 1.2 (large)
→ KnowledgePlane clearly better, publish results!
```

#### Scenario 2: Borderline
```
P-value: 0.048 (barely significant)
Effect size: 0.25 (small)
→ Weak evidence, collect more data or consider practical significance
```

#### Scenario 3: Large Effect, Not Significant
```
P-value: 0.12 (not significant)
Effect size: 0.9 (large)
→ Promising trend but need more samples (increase test set size)
```

#### Scenario 4: Significant but Tiny
```
P-value: 0.001 (highly significant)
Effect size: 0.05 (negligible)
→ Statistically significant but not practically meaningful
```

## Best Practices

### 1. Report Everything

Always report:
- Mean ± confidence interval
- P-value
- Effect size
- Sample size

**Good**: "KP F1 = 0.85 [0.82, 0.88], baseline = 0.78 [0.75, 0.81], p < 0.001, d = 1.2, n = 100"

**Bad**: "KP is better (p < 0.05)"

### 2. Use Paired Tests

Since both systems answer same questions, **always use paired tests** (paired t-test, McNemar).

**Wrong**: Independent t-test (ignores pairing)
**Right**: Paired t-test (more powerful)

### 3. Choose Right Test for Metric Type

| Metric | Type | Test |
|--------|------|------|
| F1, Precision, Recall | Continuous | Paired t-test |
| Exact Match (EM) | Binary | McNemar's test |
| Multiple metrics | Mixed | Both tests |

### 4. Bootstrap for Small Samples

If n < 30, use bootstrap CI:
```python
results = analyzer.full_analysis(use_bootstrap=True)
```

### 5. Check Both Significance AND Effect Size

**Both matter**:
- Significance: Is difference real?
- Effect size: Is difference important?

Don't just chase p < 0.05!

### 6. Pre-register Hypotheses

Decide analysis plan **before** running benchmarks to avoid p-hacking:
- Which metrics to test
- Significance threshold (α = 0.05)
- Minimum sample size

### 7. Correct for Multiple Comparisons

If testing many metrics (F1, EM, Precision, Recall), use Bonferroni correction:
```python
# Testing 4 metrics
alpha_corrected = 0.05 / 4 = 0.0125

# Now require p < 0.0125 instead of p < 0.05
```

### 8. Report Negative Results

If KnowledgePlane is **not** significantly better, report it honestly:
- Maybe systems are equivalent
- Maybe you need more data
- Maybe baseline is actually good

## Integration with Benchmarks

### In run_all.py

```python
from statistical_analysis import analyze_benchmark_results

# After running benchmarks
print("\n" + "=" * 70)
print("STATISTICAL ANALYSIS")
print("=" * 70)

# Analyze each metric
for metric in ["f1", "em", "precision", "recall"]:
    print(f"\n\nAnalyzing {metric.upper()}...")
    analyze_benchmark_results(
        "output/hotpotqa_results.csv",
        kp_metric_col=f"kp_{metric}",
        baseline_metric_col=f"vector_{metric}",
        metric_name=metric.upper()
    )
```

### In Benchmark Scripts

```python
# At end of bench_hotpotqa.py
if __name__ == "__main__":
    # Run benchmarks...

    # Statistical analysis
    from statistical_analysis import BenchmarkAnalysis

    kp_f1 = [result["kp_f1"] for result in all_results]
    baseline_f1 = [result["vector_f1"] for result in all_results]

    analyzer = BenchmarkAnalysis(kp_f1, baseline_f1)
    analyzer.print_report()
```

## References

### Statistical Tests
- **Paired T-Test**: Compares means of paired samples
- **McNemar's Test**: Compares proportions in paired binary data
- **Bootstrap**: Resampling for robust inference

### Effect Sizes
- Cohen, J. (1988). Statistical Power Analysis for the Behavioral Sciences (2nd ed.)
- **Cohen's d**: Standardized mean difference
  - Small: 0.2
  - Medium: 0.5
  - Large: 0.8

### Multiple Comparisons
- **Bonferroni Correction**: Adjust α when testing multiple hypotheses
- α_corrected = α / number_of_tests

### Software
- **SciPy**: Python library for statistical tests
  - `scipy.stats.ttest_rel`: Paired t-test
  - `scipy.stats.chi2`: Chi-square distribution for McNemar
- **NumPy**: Numerical operations for bootstrap

## Troubleshooting

### "Not significant but I know it's better!"

Possible reasons:
1. **Small sample size**: Increase test set (need more statistical power)
2. **High variance**: Results inconsistent, try different questions or reduce randomness
3. **Tiny effect**: Difference is real but too small to detect reliably

### "Significant but effect size is tiny"

This happens with large samples:
- Large n → more power → detect tiny differences
- Check if improvement is practically meaningful (> 0.5% ?)
- Consider cost/benefit (is 0.3% F1 improvement worth complexity?)

### "Bootstrap and parametric CI differ a lot"

Bootstrap is more robust:
- Use bootstrap when data is non-normal (skewed, outliers)
- Use parametric when n > 30 and data looks normal (faster)
- Large differences suggest violations of t-test assumptions

### "Different results on different runs"

- Set random seed for reproducibility
- Bootstrap uses random sampling → set `random_state=42`
- Results should be stable if n is large enough

## Examples

See `tests/test_statistical_analysis.py` for comprehensive examples of all functions and edge cases.

Run tests:
```bash
cd /Users/altras/home/dev/knowledgeplane/tests/benchmarks
pytest tests/test_statistical_analysis.py -v
```

## Summary

**Golden Rule**: Report both **statistical significance** (p-value) AND **practical significance** (effect size).

**Quick Checklist**:
- ✓ Report mean ± 95% CI
- ✓ Use paired t-test for continuous metrics
- ✓ Use McNemar for binary (EM) metrics
- ✓ Calculate Cohen's d effect size
- ✓ Consider bootstrap for n < 30
- ✓ Check both p-value and effect size
- ✓ Report honestly even if not significant

**Goal**: Provide rigorous evidence that KnowledgePlane improvements are real and meaningful, not just random noise.
