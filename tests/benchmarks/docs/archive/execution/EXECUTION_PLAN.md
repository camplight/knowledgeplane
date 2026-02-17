# Benchmark Execution Plan

## Overview

This document outlines the complete strategy for running benchmarks in Docker and collecting **real, verifiable results** from the KnowledgePlane server.

## Execution Philosophy

**Critical Principle**: We run in phases with increasing sample sizes to:
1. Validate the setup quickly (n=20, ~5-10 minutes)
2. Detect issues early before committing to long runs
3. Collect full statistical data only after validation (n=500, ~2-4 hours)

## Phase 1: Validation Run (REQUIRED FIRST)

### Objective
Verify that:
- Docker container can reach KP server on host
- Benchmarks execute correctly
- Results are saved to mounted volume
- Results are **real** (not mock data)

### Configuration
```bash
n = 20 questions
time = ~5-10 minutes
purpose = smoke test + setup validation
```

### Commands

```bash
# Build the Docker image
cd /Users/altras/home/dev/knowledgeplane/tests/benchmarks
docker build -t kp-benchmarks:latest .

# Run validation with KP server on host
docker run --rm \
  --name kp-bench-validation \
  -v "$(pwd)/output:/app/output" \
  -e KP_API_URL=http://host.docker.internal:8080 \
  -e KP_WORKSPACE_ID="${KP_WORKSPACE_ID}" \
  -e KP_USER_ID="${KP_USER_ID}" \
  -e KP_API_KEY="${KP_API_KEY}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  kp-benchmarks:latest \
  python3 bench_hotpotqa.py --n 20 --run_kp true --run_vector false

# Verify results immediately
python3 verify_real_results.py --phase validation
```

### Success Criteria

**MUST CHECK ALL BEFORE PROCEEDING:**

1. ✅ Container completes without errors (exit code 0)
2. ✅ Output files exist in `output/` directory
   - `hotpotqa_results.csv`
   - `hotpotqa_summary.json`
3. ✅ Results contain **real data** (not mock):
   - Check for actual latency values (not random)
   - Check for valid fact IDs from KP
   - Check that scores vary naturally
4. ✅ Network connectivity confirmed:
   - Log shows successful KP API calls
   - No connection timeout errors
5. ✅ Results pass statistical sanity checks:
   - EM scores between 0-1
   - F1 scores between 0-1
   - Latency > 0ms and < 30000ms (30s)
   - At least 18/20 questions processed (90% success rate)

### What to Check in Logs

```bash
# Good signs:
✓ "Query '[question]' returned X results in Y.Zms"
✓ "Ingested [filename]: X facts, Y relations in Z.Wms"
✓ HTTP 200 responses from KP server

# Bad signs:
✗ "Connection refused"
✗ "Mock adapter initialized"
✗ "Using mock results"
✗ Timeout errors
✗ All latencies exactly the same
```

### Common Issues and Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| **Network unreachable** | Connection refused to host.docker.internal | Use `--network host` on Linux, or check Docker Desktop settings on Mac |
| **Authentication failed** | HTTP 401/403 errors | Verify KP_API_KEY is correct and user has workspace access |
| **Mock data detected** | All results identical, no latency variation | Check that `--mock_kp` flag is NOT present |
| **Missing output files** | No CSV/JSON in output/ | Check volume mount path, ensure container has write permissions |
| **Import errors** | Module not found | Rebuild Docker image with `--no-cache` |

### If Validation Fails

**DO NOT PROCEED TO PHASE 2** until all issues are resolved:

1. Check Docker logs: `docker logs kp-bench-validation`
2. Test KP connectivity manually:
   ```bash
   docker run --rm kp-benchmarks:latest \
     curl http://host.docker.internal:8080/health
   ```
3. Verify environment variables are set correctly
4. Run verification script: `python3 verify_real_results.py --phase validation`
5. Check that KP server is actually running on host: `curl localhost:8080/health`

## Phase 2: Full Run (After Validation Passes)

### Objective
Collect statistically significant data for publication-quality results.

### Configuration
```bash
n = 500 questions
time = ~2-4 hours (depends on KP server performance)
purpose = final benchmark results
```

### Commands

```bash
# Full HotpotQA run with both systems
docker run --rm \
  --name kp-bench-full \
  -v "$(pwd)/output:/app/output" \
  -e KP_API_URL=http://host.docker.internal:8080 \
  -e KP_WORKSPACE_ID="${KP_WORKSPACE_ID}" \
  -e KP_USER_ID="${KP_USER_ID}" \
  -e KP_API_KEY="${KP_API_KEY}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  kp-benchmarks:latest \
  python3 bench_hotpotqa.py --n 500 --run_kp true --run_vector true

# Verify results
python3 verify_real_results.py --phase full --n 500

# Run statistical analysis
python3 statistical_analysis.py \
  --results output/hotpotqa_results.csv \
  --output output/statistical_report.json
```

### Monitoring Progress

```bash
# In another terminal, watch the output directory
watch -n 10 'ls -lh output/ && tail -5 output/hotpotqa_results.csv'

# Check Docker logs
docker logs -f kp-bench-full

# Check resource usage
docker stats kp-bench-full
```

### Success Criteria

1. ✅ All 500 questions processed (or >95% success rate)
2. ✅ Results file size >500KB (indicates real data)
3. ✅ Statistical analysis passes all checks
4. ✅ KP shows significant improvement over baseline:
   - EM improvement >10 percentage points
   - F1 improvement >5 percentage points
5. ✅ Results are reproducible (run twice, compare)

### Intermediate Checkpoints

The benchmark saves results incrementally, so you can check progress:

```bash
# Check how many questions completed
wc -l output/hotpotqa_results.csv

# Quick stats on what's done so far
python3 -c "
import pandas as pd
df = pd.read_csv('output/hotpotqa_results.csv')
print(f'Questions processed: {len(df)}')
print(f'Avg EM (KP): {df[df.system==\"kp\"].em.mean():.2%}')
print(f'Avg F1 (KP): {df[df.system==\"kp\"].f1.mean():.2%}')
"
```

## Network Architecture

### Docker to Host Communication on Mac

```
┌─────────────────────────────────────┐
│  Docker Container                   │
│  - kp-benchmarks:latest             │
│  - Python benchmark scripts         │
│  - Sends HTTP requests to:          │
│    http://host.docker.internal:8080 │
└─────────────┬───────────────────────┘
              │
              │ (Docker's special DNS)
              │
              ▼
┌─────────────────────────────────────┐
│  Mac Host Machine                   │
│  - KP Server running on localhost   │
│  - Listening on 0.0.0.0:8080        │
│  - Accessible via host.docker.internal │
└─────────────────────────────────────┘
```

**Key Point**: `host.docker.internal` is Docker Desktop's special hostname that resolves to the host machine's IP. This is the **standard way** to connect from container to host on Mac/Windows.

### Alternative Approaches (If host.docker.internal fails)

#### Option 1: Use --network host (Linux only)
```bash
docker run --network host \
  -e KP_API_URL=http://localhost:8080 \
  ...
```
**Note**: Not supported on Mac/Windows Docker Desktop

#### Option 2: Use Host's IP Address
```bash
# Get host IP
HOST_IP=$(ipconfig getifaddr en0)  # Mac
# HOST_IP=$(hostname -I | awk '{print $1}')  # Linux

docker run \
  -e KP_API_URL=http://${HOST_IP}:8080 \
  ...
```

#### Option 3: Use Docker Bridge Network
```bash
# Create custom network
docker network create kp-net

# Run KP server in same network
docker run --network kp-net --name kp-server ...

# Run benchmarks in same network
docker run --network kp-net \
  -e KP_API_URL=http://kp-server:8080 \
  ...
```

### Testing Network Connectivity

```bash
# Test 1: Can container resolve host.docker.internal?
docker run --rm kp-benchmarks:latest \
  ping -c 3 host.docker.internal

# Test 2: Can container reach KP server?
docker run --rm kp-benchmarks:latest \
  curl -v http://host.docker.internal:8080/health

# Test 3: Can container authenticate with KP?
docker run --rm \
  -e KP_API_URL=http://host.docker.internal:8080 \
  -e KP_API_KEY="${KP_API_KEY}" \
  kp-benchmarks:latest \
  curl -H "Authorization: Bearer ${KP_API_KEY}" \
    http://host.docker.internal:8080/mcp
```

## Volume Mounting Strategy

### Mount Paths

```bash
Host Path:      /Users/altras/home/dev/knowledgeplane/tests/benchmarks/output
Container Path: /app/output
```

### What Gets Written

```
output/
├── hotpotqa_results.csv      # Per-question results (incremental)
├── hotpotqa_summary.json     # Final aggregate metrics
├── msmarco_results.csv       # MS MARCO per-query results
├── msmarco_summary.json      # MS MARCO aggregate metrics
├── freshness_run.json        # Freshness benchmark timing
├── faiss_index.bin           # Vector baseline index (cached)
└── benchmark_report_*.json   # Combined report with timestamp
```

### Ensuring Results Persist

1. **Volume mount** makes output/ shared between host and container
2. **Incremental writes** ensure partial results survive crashes
3. **JSON + CSV** format ensures human-readable and machine-parsable
4. **Timestamps** prevent overwriting previous runs

### Permissions Handling

```bash
# If you get permission errors, fix ownership:
sudo chown -R $(id -u):$(id -g) output/

# Or run container as current user:
docker run --user $(id -u):$(id -g) \
  -v "$(pwd)/output:/app/output" \
  ...
```

## Error Recovery

### What If Benchmark Crashes Mid-Run?

The benchmarks are designed to be resumable:

#### Automatic Recovery (Built-in)
- Results are written **incrementally** after each question
- If container crashes at question 250/500, you have results for first 250
- Summary JSON is written at the end, but CSV is always valid

#### Manual Resume (For Future Enhancement)
```bash
# Check how many completed
COMPLETED=$(wc -l < output/hotpotqa_results.csv)

# Resume from checkpoint
docker run --rm \
  -v "$(pwd)/output:/app/output" \
  -e KP_API_URL=http://host.docker.internal:8080 \
  ... \
  kp-benchmarks:latest \
  python3 bench_hotpotqa.py --n 500 --offset $COMPLETED
```
**Note**: `--offset` flag not yet implemented, but data structure supports it

### Batch Processing Benefits

Running in batches (e.g., 5x100 instead of 1x500):

**Advantages:**
- Can stop and resume between batches
- Lower memory footprint
- Easier to spot issues early
- Can adjust parameters mid-run

**Disadvantages:**
- More manual steps
- Need to combine results afterward
- Slightly more overhead

**Recommendation**: Start with full run (500), use batches only if you encounter stability issues.

### Intermediate Result Saving

Results are saved after **every question**, so even if Docker crashes:

```bash
# Check partial results
python3 -c "
import pandas as pd
df = pd.read_csv('output/hotpotqa_results.csv')
print(f'✓ Completed {len(df)} questions before crash')
print(f'✓ Avg EM so far: {df[df.system==\"kp\"].em.mean():.2%}')
"
```

## Verification Strategy

### How to Verify Results Are NOT Mock Data

Run the verification script after each phase:

```bash
python3 verify_real_results.py --phase validation  # After Phase 1
python3 verify_real_results.py --phase full --n 500  # After Phase 2
```

The script checks:

1. **File Existence**
   - hotpotqa_results.csv exists
   - hotpotqa_summary.json exists
   - Files are non-empty

2. **Format Validation**
   - CSV has expected columns: question_id, system, em, f1, latency_ms
   - JSON has expected keys: kp, vector, improvement
   - All required fields are present

3. **Data Sanity**
   - EM scores in [0, 1] range
   - F1 scores in [0, 1] range
   - Latency > 0 and < 30000ms
   - At least 90% of questions succeeded

4. **Anti-Mock Checks**
   - Latency values are **not all identical** (mock has random but clustered values)
   - Score distribution is **natural** (not uniform random)
   - Standard deviation of latency > 10ms (real queries vary)
   - Presence of **actual KP fact IDs** in logs (if available)

5. **Statistical Tests**
   - Check for outliers (Z-score > 3)
   - Check for impossible values (EM > 1, negative latency)
   - Check for duplicate results (same answer for all questions)

### Check That KP Server Was Actually Queried

**Method 1: Inspect Docker Logs**
```bash
docker logs kp-bench-validation 2>&1 | grep "Query.*returned"
# Should see lines like: "Query 'What is...' returned 5 results in 234.56ms"
```

**Method 2: Check KP Server Logs**
```bash
# On host, check KP server logs for incoming requests
# Should see POST requests to /mcp endpoint during benchmark run
tail -f /path/to/kp/server/logs/*.log | grep "facts_search"
```

**Method 3: Verify Fact IDs Format**
```bash
# KP fact IDs follow a specific pattern (UUID-based)
# Mock fact IDs are simple: "fact_0", "fact_1", etc.
python3 -c "
import pandas as pd
df = pd.read_csv('output/hotpotqa_results.csv')
# Real KP should have metadata with UUIDs, not 'fact_N'
print('Sample results:', df.head())
"
```

### Validate Result Format

```bash
# Check CSV structure
head -3 output/hotpotqa_results.csv
# Expected columns: question_id,question,answer,system,predicted_answer,em,f1,latency_ms,retrieved_docs

# Check JSON structure
jq . output/hotpotqa_summary.json
# Expected keys: kp, vector, improvement, metadata

# Check data types
python3 -c "
import pandas as pd
df = pd.read_csv('output/hotpotqa_results.csv')
print(df.dtypes)
print('\\nNull values:', df.isnull().sum())
"
```

### Statistical Sanity Checks

```bash
# Run full verification
python3 verify_real_results.py --phase full --n 500

# Manual checks
python3 statistical_analysis.py \
  --results output/hotpotqa_results.csv \
  --output output/statistical_report.json

# Check for anomalies
python3 -c "
import pandas as pd
df = pd.read_csv('output/hotpotqa_results.csv')

# Check EM distribution
print('EM distribution:')
print(df[df.system=='kp'].em.value_counts())

# Check latency stats
print('\\nLatency stats (ms):')
print(df[df.system=='kp'].latency_ms.describe())

# Check for outliers
from scipy import stats
z_scores = stats.zscore(df[df.system=='kp'].latency_ms)
outliers = (abs(z_scores) > 3).sum()
print(f'\\nLatency outliers (|Z| > 3): {outliers}')
"
```

### Compare n=20 vs n=500 Results

After both phases complete:

```bash
python3 -c "
import pandas as pd

# Load validation results
df_val = pd.read_csv('output/hotpotqa_results_validation.csv')
df_full = pd.read_csv('output/hotpotqa_results.csv')

# Compare EM scores
em_val = df_val[df_val.system=='kp'].em.mean()
em_full = df_full[df_full.system=='kp'].em.mean()

print(f'Validation EM (n=20): {em_val:.2%}')
print(f'Full EM (n=500): {em_full:.2%}')
print(f'Difference: {abs(em_val - em_full):.2%}')

if abs(em_val - em_full) > 0.10:
    print('⚠️  WARNING: Large difference suggests one set may be biased')
else:
    print('✓ Results are consistent across sample sizes')
"
```

## Success Criteria Summary

### Phase 1 (Validation)
- ✅ Container runs to completion (exit 0)
- ✅ Output files created in mounted volume
- ✅ Results pass all verification checks
- ✅ Network connectivity confirmed
- ✅ At least 18/20 questions succeed (90%)

### Phase 2 (Full Run)
- ✅ At least 475/500 questions succeed (95%)
- ✅ KP shows >10pp EM improvement over baseline
- ✅ Results pass statistical significance tests (p < 0.05)
- ✅ Latency within acceptable range (<5s per query)
- ✅ Results are reproducible (±5% on second run)

## Commands Quick Reference

```bash
# Phase 1: Validation (ALWAYS RUN FIRST)
docker build -t kp-benchmarks:latest .
docker run --rm \
  --name kp-bench-validation \
  -v "$(pwd)/output:/app/output" \
  -e KP_API_URL=http://host.docker.internal:8080 \
  -e KP_WORKSPACE_ID="${KP_WORKSPACE_ID}" \
  -e KP_USER_ID="${KP_USER_ID}" \
  -e KP_API_KEY="${KP_API_KEY}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  kp-benchmarks:latest \
  python3 bench_hotpotqa.py --n 20 --run_kp true --run_vector false

python3 verify_real_results.py --phase validation

# Phase 2: Full Run (ONLY after validation passes)
docker run --rm \
  --name kp-bench-full \
  -v "$(pwd)/output:/app/output" \
  -e KP_API_URL=http://host.docker.internal:8080 \
  -e KP_WORKSPACE_ID="${KP_WORKSPACE_ID}" \
  -e KP_USER_ID="${KP_USER_ID}" \
  -e KP_API_KEY="${KP_API_KEY}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  kp-benchmarks:latest \
  python3 bench_hotpotqa.py --n 500 --run_kp true --run_vector true

python3 verify_real_results.py --phase full --n 500

# Statistical Analysis
python3 statistical_analysis.py \
  --results output/hotpotqa_results.csv \
  --output output/statistical_report.json
```

## Next Steps After Results Collection

1. **Verify Results**: Run `verify_real_results.py`
2. **Statistical Analysis**: Run `statistical_analysis.py`
3. **Generate Report**: Results are in JSON/CSV format
4. **Publish**: Use results in blog post, paper, or docs
5. **Archive**: Save results with git tag for reproducibility

## Troubleshooting Checklist

- [ ] Docker image builds without errors
- [ ] KP server is running on host (curl localhost:8080/health)
- [ ] Environment variables are set correctly
- [ ] host.docker.internal resolves from container
- [ ] Volume mount path is correct
- [ ] Output directory has write permissions
- [ ] No firewall blocking port 8080
- [ ] No proxy interfering with connections
- [ ] Sufficient disk space for results (~100MB)
- [ ] Sufficient memory (4GB+ recommended)

## Conclusion

By following this two-phase execution plan:
1. We validate setup quickly (5-10 min)
2. We catch issues early before long runs
3. We collect verifiable, real results from KP server
4. We have statistical confidence in the data (n=500)

**Always run Phase 1 first. Never skip validation.**
