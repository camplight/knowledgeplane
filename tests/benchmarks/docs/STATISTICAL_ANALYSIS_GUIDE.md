# Statistical Analysis Guide for HotpotQA Benchmark

## Overview

The enhanced HotpotQA benchmark now includes rigorous statistical analysis to determine if KnowledgePlane improvements over the vector baseline are statistically significant, not just random chance.

## Quick Start

```bash
# Run benchmark with statistical analysis
python bench_hotpotqa.py --n 100 --statistical-analysis

# For publication-ready results
python bench_hotpotqa.py --n 500 --sample-method stratified --statistical-analysis
```

## What Statistical Analysis Provides

### 1. Confidence Intervals (95% CI)

Shows the range where the true mean performance likely falls:

```
KnowledgePlane F1: 0.672 [0.634, 0.710]
Vector Baseline F1: 0.521 [0.489, 0.553]
```

**Interpretation:**
- Narrower intervals = more precise estimates
- Non-overlapping intervals = strong evidence of difference
- Wider intervals = need more samples

### 2. Hypothesis Testing (P-value)

Tests the null hypothesis that both systems perform identically:

- **p < 0.01**: Highly significant (99% confident systems differ)
- **p < 0.05**: Significant (95% confident systems differ)
- **p ≥ 0.05**: Not significant (insufficient evidence)

**Example:**
```
P-value: 0.000003
→ Extremely strong evidence that KP outperforms baseline
```

### 3. Effect Size (Cohen's d)

Measures the magnitude of the difference:

| Cohen's d | Interpretation |
|-----------|----------------|
| < 0.2 | Negligible effect |
| 0.2 - 0.5 | Small effect |
| 0.5 - 0.8 | Medium effect |
| > 0.8 | Large effect |

**Example:**
```
Effect size: 1.312
→ Large, meaningful improvement (not just statistically significant)
```

## Sample Size Guidelines

### Quick Reference

| N | Purpose | Time | Statistical Power |
|---|---------|------|-------------------|
| 20 | Quick test | 5 min | Low (exploratory only) |
| 50 | Development | 15 min | Moderate (detect large effects) |
| 100 | Validation | 30 min | Good (detect medium effects) |
| 500+ | Publication | 2-3 hrs | High (detect small effects) |

### Detailed Recommendations

**N = 20 (Quick Test)**
- Use for: Rapid prototyping, bug checking
- Can detect: Only very large effects (d > 1.5)
- Risk: High false negatives (missing real improvements)
- When to use: Development iteration, not for claims

**N = 100 (Validation)**
- Use for: Feature validation, A/B testing
- Can detect: Medium to large effects (d > 0.5)
- Risk: Moderate false negatives for small effects
- When to use: Internal benchmarks, development milestones

**N = 500+ (Publication)**
- Use for: Research papers, public claims
- Can detect: Small to large effects (d > 0.2)
- Risk: Low false negatives
- When to use: Publication, marketing claims, comparative studies

## Understanding Statistical Output

### Example Output

```
======================================================================
Statistical Analysis Report: F1
======================================================================

KnowledgePlane:
  Mean:       0.6720
  95% CI:     [0.6342, 0.7098]
  Std Dev:    0.1234
  Median:     0.6850
  Range:      [0.4200, 0.8900]

Vector Baseline:
  Mean:       0.5210
  95% CI:     [0.4892, 0.5528]
  Std Dev:    0.1089
  Median:     0.5150
  Range:      [0.3100, 0.7500]

Statistical Comparison:
  Absolute Improvement:  +0.1510
  Relative Improvement:  +28.98%
  Effect Size (Cohen's d): 1.312 (large)
  T-statistic:           8.456
  P-value:               0.000003

Significance:
  ✓✓ HIGHLY SIGNIFICANT (p < 0.01)
  Strong evidence that KnowledgePlane outperforms baseline

Interpretation:
  KnowledgePlane shows both statistically significant AND
  practically meaningful improvement over vector baseline.
```

### Breaking Down the Metrics

**Mean**: Average performance across all questions
- Higher is better for F1/EM
- Compare KP vs Baseline

**95% CI**: Range of plausible values
- 95% confident true mean falls in this range
- Narrower = more precise
- Non-overlapping = significant difference

**Std Dev**: Variability in performance
- Lower = more consistent
- Higher = more variance across questions

**T-statistic**: Standardized difference
- Larger absolute value = stronger evidence
- |t| > 2 typically significant

**P-value**: Probability of results if no real difference
- Lower = stronger evidence of difference
- p < 0.05 is standard threshold

**Effect Size**: Standardized difference magnitude
- Independent of sample size
- Measures practical significance

## Common Scenarios

### Scenario 1: Clear Winner

```
P-value: 0.0001, Effect size: 1.2
CI (KP): [0.65, 0.71], CI (Baseline): [0.48, 0.54]
```

**Interpretation**: KP is definitively better. High confidence, large effect.

**Action**: Publish results, deploy KP

### Scenario 2: Marginal Improvement

```
P-value: 0.03, Effect size: 0.3
CI (KP): [0.58, 0.64], CI (Baseline): [0.54, 0.60]
```

**Interpretation**: KP is likely better, but improvement is small.

**Action**: Consider if improvement justifies cost/complexity

### Scenario 3: Promising but Uncertain

```
P-value: 0.15, Effect size: 0.7
CI (KP): [0.52, 0.72], CI (Baseline): [0.45, 0.65]
```

**Interpretation**: Large effect observed, but wide CIs overlap.

**Action**: Collect more samples (increase N) to gain confidence

### Scenario 4: No Difference

```
P-value: 0.60, Effect size: 0.1
CI (KP): [0.52, 0.58], CI (Baseline): [0.51, 0.57]
```

**Interpretation**: Systems perform equivalently.

**Action**: Choose based on other factors (cost, latency, complexity)

## Advanced: Power Analysis

The statistical analysis includes sample size recommendations:

```
Sample Size Recommendation:
  Current N:         100
  Current Power:     0.823
  Target Power:      0.800
  Recommended N:     95
  Additional Needed: 0
```

**Power**: Probability of detecting a real effect if it exists
- 0.80 (80%) is standard target
- Higher N = higher power
- Helps plan future experiments

## Sampling Methods

### Random Sampling
```bash
python bench_hotpotqa.py --n 100 --sample-method random
```

- Default method
- Shuffles dataset, takes first N
- Good for general testing
- Reproducible with seed

### Stratified Sampling
```bash
python bench_hotpotqa.py --n 500 --sample-method stratified
```

- Samples proportionally by difficulty (easy/medium/hard)
- Ensures diverse question coverage
- **Recommended for large benchmarks**
- Better represents dataset distribution

### First N
```bash
python bench_hotpotqa.py --n 100 --sample-method first
```

- Takes first N questions sequentially
- Fastest (no shuffling)
- May have bias if dataset is ordered
- Use for consistent quick tests

## Best Practices

### 1. Choose Appropriate Sample Size

```python
# Quick test during development
python bench_hotpotqa.py --n 20 --mock_kp

# Validation during feature development
python bench_hotpotqa.py --n 100 --statistical-analysis

# Publication or public claims
python bench_hotpotqa.py --n 500 --sample-method stratified --statistical-analysis
```

### 2. Use Stratified Sampling for Large N

```bash
# Ensures balanced coverage of easy/medium/hard questions
python bench_hotpotqa.py --n 500 --sample-method stratified
```

### 3. Multiple Runs for Robustness

```bash
# Run with different seeds
for seed in 42 43 44 45 46; do
    python bench_hotpotqa.py --n 100 --seed $seed --statistical-analysis \
        --output_dir output_seed_$seed
done

# Results should be consistent across seeds
```

### 4. Report Both Statistical and Practical Significance

Always report:
1. Mean performance (KP and baseline)
2. P-value (statistical significance)
3. Effect size (practical significance)
4. Confidence intervals (precision)
5. Sample size (context)

Example:
```
"KnowledgePlane achieved F1=0.672 (95% CI: [0.634, 0.710]) compared to
baseline F1=0.521 (95% CI: [0.489, 0.553]), showing a large effect size
(d=1.31) that was highly significant (p<0.001, n=500)."
```

## Troubleshooting

### "Not enough samples for statistical analysis"

**Problem**: Need at least 2 paired samples

**Solution**: Increase --n to at least 5-10

### "Wide confidence intervals"

**Problem**: High variance or small sample

**Solution**:
1. Increase sample size (--n)
2. Use stratified sampling for consistency

### "Large effect but not significant"

**Problem**: True difference exists but sample too small

**Solution**: Increase --n until power reaches 0.80+

### "Significant but small effect"

**Problem**: Real but tiny improvement

**Solution**: Consider if improvement is worth the cost

## References

### Statistical Tests Used

1. **Paired t-test**: Compares paired observations (same questions)
2. **Cohen's d**: Effect size calculation
3. **Bootstrap CI**: Non-parametric confidence intervals
4. **Power analysis**: Sample size recommendations

### Further Reading

- Cohen, J. (1988). Statistical Power Analysis
- Efron, B. & Tibshirani, R. (1993). Bootstrap Methods
- Demšar, J. (2006). Statistical Comparisons of Classifiers
- Dror et al. (2017). Statistical Significance Tests for NLP

## Citation

If using this statistical analysis in publications:

```bibtex
@software{knowledgeplane_statistical_2024,
  title={Statistical Analysis Module for KnowledgePlane Benchmarks},
  author={KnowledgePlane Team},
  year={2024},
  note={Implements paired t-tests, effect sizes, and confidence intervals}
}
```
