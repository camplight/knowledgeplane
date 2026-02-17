# Statistical Analysis Quick Reference

## One-Liner Commands

### Analyze Single Metric from CSV
```python
from statistical_analysis import analyze_benchmark_results

analyze_benchmark_results("output/results.csv", "kp_f1", "vector_f1", "F1")
```

### Analyze Multiple Metrics
```python
from statistical_analysis import compare_multiple_metrics

compare_multiple_metrics("output/results.csv", [
    ("kp_f1", "vector_f1", "F1"),
    ("kp_em", "vector_em", "EM")
])
```

### Create Custom Analyzer
```python
from statistical_analysis import BenchmarkAnalysis

analyzer = BenchmarkAnalysis(kp_scores, baseline_scores)
analyzer.print_report()
```

## Interpretation Cheatsheet

| P-value | Effect Size | Interpretation |
|---------|-------------|----------------|
| < 0.01  | > 0.8       | ✓✓ STRONG: Significant + Large effect |
| < 0.05  | > 0.5       | ✓ MODERATE: Significant + Medium effect |
| < 0.05  | < 0.2       | ~ WEAK: Significant but negligible effect |
| ≥ 0.05  | > 0.5       | ? PROMISING: Large effect, need more data |
| ≥ 0.05  | < 0.2       | ✗ NO EVIDENCE: No significant difference |

## Decision Tree

```
Is KnowledgePlane better?
│
├─ Check p-value
│  ├─ p < 0.01 → Highly significant ✓✓
│  ├─ p < 0.05 → Significant ✓
│  └─ p ≥ 0.05 → Not significant ✗
│
└─ Check effect size (Cohen's d)
   ├─ |d| ≥ 0.8 → Large practical improvement
   ├─ |d| ≥ 0.5 → Medium practical improvement
   ├─ |d| ≥ 0.2 → Small practical improvement
   └─ |d| < 0.2 → Negligible practical improvement
```

## Common Tests

| Metric Type | Test | Function |
|-------------|------|----------|
| F1, Precision, Recall | Paired t-test | `paired_t_test()` |
| Exact Match (EM) | McNemar's test | `mcnemar_test()` |
| Any continuous | Bootstrap CI | `bootstrap_confidence_interval()` |

## Effect Size Guidelines

```
Cohen's d interpretation:
  < 0.2  : Negligible (not meaningful)
  0.2-0.5: Small (minor improvement)
  0.5-0.8: Medium (notable improvement)
  ≥ 0.8  : Large (substantial improvement)
```

## When to Use Bootstrap

Use `use_bootstrap=True` when:
- Sample size < 30
- Data is skewed or has outliers
- T-test assumptions violated
- Want robust estimates

Trade-off: Slower but more reliable

## Reporting Template

```
KnowledgePlane F1: 0.85 [95% CI: 0.82, 0.88]
Vector Baseline:   0.78 [95% CI: 0.75, 0.81]
Improvement:       +0.07 (+9.0%)
Effect size:       d = 1.2 (large)
Significance:      p < 0.001 (highly significant)

Conclusion: KnowledgePlane significantly outperforms vector baseline
with large practical effect (n = 100).
```

## Red Flags

**Significant but tiny effect**:
```
p = 0.001, d = 0.05
→ Large sample detected tiny difference
→ Not practically meaningful
```

**Large effect but not significant**:
```
p = 0.12, d = 0.9
→ Promising but need more data
→ Increase sample size
```

**High variance**:
```
CI: [0.5, 0.9] (width = 0.4)
→ Results inconsistent
→ Reduce randomness or increase n
```

## Integration Example

```python
# In your benchmark script
from statistical_analysis import BenchmarkAnalysis

# Run benchmarks
kp_results = run_kp_benchmark(questions)
baseline_results = run_baseline_benchmark(questions)

# Extract F1 scores
kp_f1 = [r["f1"] for r in kp_results]
baseline_f1 = [r["f1"] for r in baseline_results]

# Statistical analysis
analyzer = BenchmarkAnalysis(kp_f1, baseline_f1, metric_name="F1")
analysis = analyzer.full_analysis()

# Report
analyzer.print_report()

# Programmatic checks
if analysis["comparison"]["is_significant"]:
    print("✓ KP significantly better")
    if analysis["comparison"]["effect_size"] > 0.5:
        print("✓ Practically meaningful improvement")
else:
    print("✗ No significant difference detected")
    print(f"  (May need more samples, current n={len(kp_f1)})")
```

## Common Pitfalls

1. **Only reporting p-value** → Also report effect size
2. **Using independent t-test** → Use paired t-test (same questions)
3. **Ignoring variance** → Report confidence intervals
4. **P-hacking** → Pre-register analysis plan
5. **Multiple testing** → Use Bonferroni correction
6. **Confusing significance and importance** → Check both p and d

## Further Reading

- Full documentation: `docs/STATISTICAL_ANALYSIS.md`
- Test examples: `tests/test_statistical_analysis.py`
- Demo script: `demos/demo_statistical_analysis.py`
- Run demo: `python demos/demo_statistical_analysis.py`
