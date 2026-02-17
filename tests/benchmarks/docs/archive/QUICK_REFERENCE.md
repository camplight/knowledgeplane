# HotpotQA Benchmark - Quick Reference

## Common Commands

### Quick Test (Development)
```bash
python bench_hotpotqa.py --n 20 --mock_kp
```
⏱️ Time: 2-5 minutes | 💪 Power: Low | 🎯 Use: Quick iteration

### Validation Test (Feature Testing)
```bash
python bench_hotpotqa.py --n 100 --statistical-analysis
```
⏱️ Time: 15-30 minutes | 💪 Power: Good | 🎯 Use: Feature validation

### Publication Benchmark (Research)
```bash
python bench_hotpotqa.py --n 500 --sample-method stratified --statistical-analysis
```
⏱️ Time: 1-3 hours | 💪 Power: High | 🎯 Use: Publications, claims

### Memory-Efficient Large Run
```bash
python bench_hotpotqa.py --n 500 --batch-size 50 --statistical-analysis
```
⏱️ Time: 1-3 hours | 💾 Memory: ~3GB (vs ~5GB) | 🎯 Use: Limited RAM

## All Options

```
--n                      Number of questions (default: 20)
--top_k                  Documents to retrieve (default: 5)
--seed                   Random seed (default: 42)
--sample-method          random|first|stratified (default: random)
--batch-size             Batch size for processing (default: None)
--statistical-analysis   Enable statistical analysis (flag)
--run_kp                 Run KP system: true|false (default: true)
--run_vector             Run vector baseline: true|false (default: true)
--mock_kp                Use mock KP (flag)
--output_dir             Output directory (default: output)
```

## Sample Size Guide

| N | Time | Memory | Use Case | Statistical Power |
|---|------|--------|----------|-------------------|
| 20 | 5 min | 500 MB | Quick test | Low (exploratory) |
| 50 | 15 min | 800 MB | Dev validation | Moderate (large effects) |
| 100 | 30 min | 1.2 GB | Feature validation | Good (medium+ effects) |
| 500 | 2-3 hrs | 5 GB (3 GB batched) | Publication | High (small effects) |

## Sampling Methods

### Random (Default)
```bash
--sample-method random
```
- Shuffles and samples randomly
- Good general-purpose choice
- Reproducible with seed

### Stratified (Recommended for N≥100)
```bash
--sample-method stratified
```
- Balances easy/medium/hard questions
- Better distribution representation
- Recommended for large benchmarks

### First N (Fastest)
```bash
--sample-method first
```
- Takes first N sequentially
- No shuffling overhead
- May have ordering bias

## Output Files

```
output/
├── hotpotqa_results.csv       # Per-question results
├── hotpotqa_summary.json      # Aggregate metrics + statistical analysis
└── hotpotqa_partial_N.csv     # Intermediate results (if batched)
```

## Interpreting Results

### Quick Interpretation

**Basic Metrics:**
- F1 > 0.6: Good performance
- EM > 0.4: Good exact match rate
- Improvement > 10pp: Meaningful difference

**Statistical Analysis:**
```
P-value < 0.05 + Effect size > 0.5
→ Strong evidence of improvement

P-value < 0.05 + Effect size < 0.3
→ Significant but small improvement

P-value > 0.05 + Effect size > 0.7
→ Promising, need more samples
```

### Effect Size (Cohen's d)

| d | Interpretation |
|---|----------------|
| < 0.2 | Negligible |
| 0.2-0.5 | Small |
| 0.5-0.8 | Medium |
| > 0.8 | Large |

### P-value

| p | Interpretation |
|---|----------------|
| < 0.01 | Highly significant (99% confident) |
| 0.01-0.05 | Significant (95% confident) |
| > 0.05 | Not significant (insufficient evidence) |

## Example Workflows

### Workflow 1: Feature Development
```bash
# 1. Quick test during development
python bench_hotpotqa.py --n 20 --mock_kp

# 2. Validation before merge
python bench_hotpotqa.py --n 100 --statistical-analysis

# 3. Final validation
python bench_hotpotqa.py --n 100 --seed 43 --statistical-analysis
```

### Workflow 2: Publication
```bash
# 1. Pilot test
python bench_hotpotqa.py --n 50 --sample-method stratified

# 2. Full benchmark
python bench_hotpotqa.py --n 500 --sample-method stratified \
    --batch-size 50 --statistical-analysis

# 3. Cross-validation
bash examples/cross_validation.sh
```

### Workflow 3: A/B Testing
```bash
# Test configuration A
python bench_hotpotqa.py --n 100 --top_k 5 \
    --statistical-analysis --output_dir output_k5

# Test configuration B
python bench_hotpotqa.py --n 100 --top_k 10 \
    --statistical-analysis --output_dir output_k10

# Compare results
python -c "
import json
with open('output_k5/hotpotqa_summary.json') as f:
    a = json.load(f)
with open('output_k10/hotpotqa_summary.json') as f:
    b = json.load(f)
print(f'k=5:  F1={a[\"kp\"][\"avg_f1\"]:.3f}')
print(f'k=10: F1={b[\"kp\"][\"avg_f1\"]:.3f}')
"
```

## Troubleshooting

### "Not enough samples for statistical analysis"
**Solution**: Use `--n 10` or higher (minimum 2 required, 10+ recommended)

### "Memory error"
**Solution**: Use `--batch-size 50` to process in chunks

### "Very wide confidence intervals"
**Solution**: Increase `--n` to 100 or 500 for narrower intervals

### "Not significant despite large effect"
**Solution**: Increase sample size for more statistical power

### "Mock KP gives unrealistic results"
**Solution**: Use real KP server (remove `--mock_kp` flag)

## Performance Tips

### Speed Optimization
1. Use `--mock_kp` for testing (10x faster)
2. Use `--run_kp false` or `--run_vector false` to run only one system
3. Reduce `--top_k` for faster retrieval
4. Use local embeddings (don't set OPENAI_API_KEY)

### Memory Optimization
1. Use `--batch-size 50` for runs with N > 200
2. Process in smaller chunks with multiple runs
3. Clear output directory between runs

### Cost Optimization
1. Start with small N (20-50) during development
2. Use mock KP for testing
3. Run large benchmarks (500+) only when needed
4. Use local embeddings instead of OpenAI

## Resources

- **Full Guide**: `docs/HOTPOTQA_USAGE.md`
- **Statistical Guide**: `docs/STATISTICAL_ANALYSIS_GUIDE.md`
- **Enhancements Summary**: `ENHANCEMENTS_SUMMARY.md`
- **Test Script**: `test_enhancements.py`
- **Examples**: `examples/run_statistical_benchmark.sh`, `examples/cross_validation.sh`

## Support

```bash
# Show help
python bench_hotpotqa.py --help

# Test installation
python test_enhancements.py

# Run example
bash examples/run_statistical_benchmark.sh
```

## Citation

When citing in publications:

```
We evaluated using the HotpotQA multi-hop reasoning benchmark (Yang et al., 2018)
with N=500 questions sampled using stratified sampling. Statistical significance
was assessed using paired t-tests with α=0.05.
```

---

**Quick decision matrix:**

- Need quick feedback? → `--n 20 --mock_kp`
- Testing a feature? → `--n 100 --statistical-analysis`
- Publishing results? → `--n 500 --sample-method stratified --statistical-analysis`
- Limited memory? → Add `--batch-size 50`
- Want robustness? → Run `examples/cross_validation.sh`
