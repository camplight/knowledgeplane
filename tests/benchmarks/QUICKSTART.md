# KnowledgePlane Benchmarking Suite - Quick Start

## 5-Minute Quick Start

### 1. Install Dependencies

```bash
cd tests/benchmarks
pip install -r requirements-bench.txt
```

### 2. Quick Test (No Server Needed)

Test the suite with mock data:

```bash
python run_all.py --n-hotpot 10 --mock_kp --freshness-mode skip
```

This will:
- Run 10 HotpotQA questions with mock KP and vector baseline
- Skip freshness test (requires real server)
- Generate results in `output/` directory

### 3. View Results

```bash
# View summary
cat output/hotpotqa_summary.json

# View per-question results
cat output/hotpotqa_results.csv

# View combined report
cat output/benchmark_report_*.json
```

## Full Run (With KP Server)

### 1. Start KnowledgePlane

```bash
# Start the KP server (from repo root)
cd /path/to/knowledgeplane
npm start
```

### 2. Set Environment Variables

```bash
export KP_API_URL=http://localhost:8080/mcp
export KP_API_KEY=your-api-key
export KP_WORKSPACE_ID=benchmark-workspace
export KP_USER_ID=benchmark-user
export OPENAI_API_KEY=sk-...  # For embeddings
```

### 3. Run Full Suite

```bash
cd tests/benchmarks

# Run with manual freshness test
python run_all.py \
  --n-hotpot 20 \
  --freshness-mode manual

# Or run with API freshness test (fully automated)
python run_all.py \
  --n-hotpot 50 \
  --freshness-mode api
```

## Common Commands

### Quick Tests

```bash
# Smallest test (5 questions, mock KP)
python run_all.py --n-hotpot 5 --mock_kp --freshness-mode skip

# KP only (no vector baseline comparison)
python run_all.py --n-hotpot 20 --run_vector=false --freshness-mode skip

# Vector only (no KP)
python run_all.py --n-hotpot 20 --run_kp=false --freshness-mode skip
```

### Production Runs

```bash
# Medium-scale (100 questions)
python run_all.py --n-hotpot 100 --freshness-mode api

# Large-scale (1000 questions, may take hours)
python run_all.py --n-hotpot 1000 --freshness-mode skip

# With custom retrieval parameters
python run_all.py --n-hotpot 50 --top_k 10 --freshness-mode api
```

### Individual Benchmarks

```bash
# Just HotpotQA
python bench_hotpotqa.py --n 20 --run_kp true --run_vector true

# Just Freshness (manual mode)
python bench_freshness.py --mode manual

# Just Freshness (API mode)
python bench_freshness.py --mode api
```

## Understanding Results

### HotpotQA Metrics

- **Exact Match (EM)**: 1.0 = perfect match, 0.0 = no match
- **F1 Score**: Token-level overlap (0-1), accounts for partial matches
- **Success Criteria**: KP should achieve >10% higher EM than vector baseline

### Freshness Metrics

- **Time-to-Truth**: Seconds from fact update to retrieval
- **Rating Scale**:
  - EXCELLENT: < 1 minute
  - GOOD: < 3 minutes
  - TARGET: < 5 minutes
  - SLOW: > 5 minutes

## Troubleshooting

### "Module not found" errors

```bash
pip install -r requirements-bench.txt --force-reinstall
```

### KP connection errors

```bash
# Check if KP is running
curl http://localhost:8080/health

# Verify environment variables
echo $KP_API_URL
echo $KP_WORKSPACE_ID
```

### Slow performance

```bash
# Reduce dataset size
python run_all.py --n-hotpot 10

# Use mock KP
python run_all.py --n-hotpot 20 --mock_kp
```

### Out of memory

```bash
# Vector baseline can be memory-intensive
# Run with smaller datasets or skip vector baseline
python run_all.py --n-hotpot 20 --run_vector=false
```

## Next Steps

After successful run:

1. Review `output/benchmark_report_*.json` for complete results
2. Compare KP vs Vector metrics in `output/hotpotqa_summary.json`
3. Scale up to larger datasets (100-1000 questions)
4. Integrate with CI/CD for continuous benchmarking
5. Add competitor systems for comparison

## File Outputs

```
output/
├── hotpotqa_results.csv              # Per-question results
├── hotpotqa_summary.json             # Aggregate HotpotQA metrics
├── freshness_run.json                # Freshness test results
└── benchmark_report_YYYYMMDD_HHMMSS.json  # Combined report
```

## Getting Help

- See `README.md` for comprehensive documentation
- See `HOTPOTQA_USAGE.md` for HotpotQA details
- See `spec.md` for implementation details
- File issues at: https://github.com/yourusername/knowledgeplane/issues
