# Benchmark Setup Guide

## Quick Answer: Use Docker!

**TL;DR**: The benchmarks are designed to run in Docker with pre-configured dependencies.

```bash
cd tests/benchmarks
docker compose --profile validation up --build
```

## Why Docker?

The benchmark suite has complex Python dependencies (PyTorch, transformers, sentence-transformers, FAISS) that have version conflicts on different systems. Docker ensures:

✅ Consistent environment
✅ All dependencies pre-installed
✅ Works on any system (Mac/Windows/Linux)
✅ No local Python environment pollution

## Prerequisites

1. **Docker Desktop** installed
2. **KP server running** on `localhost:8081` (REST API) or `localhost:8080` (MCP)
3. **Environment variables** set (see below)

## Environment Setup

Create `.env` file in `tests/benchmarks/`:

```bash
# KP Server Connection
KP_API_URL=http://host.docker.internal:8081  # REST API
KP_WORKSPACE_ID=74be80db-d802-480b-b7f6-6891095ce0eb
KP_USER_ID=17ac0fa1-ff1d-417a-bf92-eb7a9ef50f04
KP_API_KEY=bench_4d4e2e4eebfa49a68ede6114

# Required for embeddings
OPENAI_API_KEY=sk-proj-...
```

**Note**: Use `host.docker.internal` in Docker to access host services (not `localhost`)

## Running Benchmarks

### Benchmark Modes

The benchmark supports two modes for different use cases:

**1. Cached Mode (`--mode cached`)**
- Uses deterministic namespace: `hotpotqa_validation_seed42`
- Reuses embeddings across runs (fast iteration on retrieval quality)
- First run: ingests facts + waits for embeddings (~5-10 min)
- Subsequent runs: detects cached embeddings + runs queries immediately (~1-2 min)
- Perfect for: Testing retrieval algorithms, tuning parameters, quick iterations

**2. Timestamped Mode (`--mode timestamped`)**
- Uses unique namespace: `hotpotqa_<timestamp>`
- Fresh pipeline on every run (full end-to-end benchmark)
- Every run: ingests + generates embeddings + queries (~2-4 hours for n=500)
- Perfect for: Production benchmarks, full pipeline testing, final results

### Phase 1: Validation (REQUIRED FIRST)

```bash
# Run 20-question validation with CACHED mode (~5-10 minutes first run, ~1-2 min after)
docker compose --profile validation up --build

# Check results
ls -lh output/
cat output/hotpotqa_summary.json
```

**Success criteria:**
- ✅ Container completes without errors
- ✅ Files exist: `hotpotqa_results.csv`, `hotpotqa_summary.json`
- ✅ At least 18/20 questions succeed
- ✅ Second run completes much faster (uses cached embeddings)

### Phase 2: Full Run (After validation passes)

```bash
# Run 500-question benchmark with TIMESTAMPED mode (~2-4 hours)
docker compose --profile full up

# Monitor progress (in another terminal)
watch -n 30 'wc -l output/hotpotqa_results.csv'
```

## Alternative: Local Python (Not Recommended)

If you must run locally without Docker:

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements-bench.txt

# Run benchmark
python bench_hotpotqa.py --dataset validation --num-questions 5 --mode kp
```

**Issues with local Python:**
- ❌ PyTorch version conflicts
- ❌ transformers compatibility issues
- ❌ Platform-specific problems
- ❌ Environment pollution

## Troubleshooting

### Docker container fails to start

```bash
# Check Docker is running
docker ps

# Rebuild from scratch
docker compose --profile validation build --no-cache
```

### Can't connect to KP server

```bash
# Test from host
curl http://localhost:8081/api/health

# Test from Docker container
docker run --rm curlimages/curl:latest curl http://host.docker.internal:8081/api/health
```

### Environment variables not loaded

```bash
# Verify .env file exists
cat .env

# Check values in container
docker compose --profile validation run benchmark env | grep KP_
```

## How Cached Mode Works

### Technical Details

**Why we need cached mode:**
- HotpotQA data is deterministic (seed=42)
- Embedding generation takes 5-10 minutes for validation set
- Without caching, every test run waits for embeddings
- Cached mode enables fast iteration on retrieval quality

**First run (cached mode):**
1. Creates namespace: `hotpotqa_validation_seed42`
2. Ingests 20 deterministic documents
3. Triggers embedding generation via background worker
4. Polls for embeddings to complete (~5-10 min)
5. Runs benchmark queries
6. Saves results

**Subsequent runs (cached mode):**
1. Detects existing namespace: `hotpotqa_validation_seed42`
2. Checks for facts with embeddings (>90% coverage required)
3. Skips ingestion and embedding wait
4. Runs benchmark queries immediately (~1-2 min)
5. Saves results

**Timestamped mode (full pipeline):**
1. Creates unique namespace: `hotpotqa_1771005432`
2. Full ingestion + embedding generation + queries
3. Every run is isolated (no caching)
4. Perfect for production benchmarks

### When to Use Each Mode

| Mode | Use Case | Run Time | Ideal For |
|------|----------|----------|-----------|
| `cached` | Development, tuning retrieval | ~1-2 min (after first run) | Testing ranking algorithms, parameter tuning, fast iteration |
| `timestamped` | Production benchmarks | ~2-4 hours (n=500) | Final results, full pipeline testing, CI/CD |

## What Got Fixed

### Embedding Caching System (2026-02-13)

**Issue**: Each benchmark run created fresh namespace with timestamp, making embeddings from previous runs unusable. This meant every run had to wait 5-10 minutes for embedding generation.

**Insight**: HotpotQA data is deterministic (seed=42), so we can safely cache embeddings across runs.

**Fix**: Implemented two-mode system:
- `--mode cached`: Uses fixed namespace for cached embeddings
- `--mode timestamped`: Creates unique namespace for full pipeline benchmarks

**Impact**: Development iteration speed increased 5-10x (from 5-10 min to 1-2 min per run).

### Critical Namespace Bug (2026-02-13)

**Issue**: Namespace filtering was disabled in `kp_adapter.py`, causing queries to return facts from ALL namespaces (data contamination).

**Fix**: Re-enabled filtering at `kp_adapter.py:348-354`

```python
# Before (BROKEN)
# if namespace:
#     hit_namespace = hit.get('metadata', {}).get('namespace')
#     if hit_namespace != namespace:
#         continue

# After (FIXED)
if namespace:
    hit_namespace = hit.get('metadata', {}).get('namespace')
    if hit_namespace != namespace:
        logger.debug(f"Filtered out fact {hit['id']}: namespace mismatch")
        continue
```

**Impact**: Benchmarks now correctly isolate facts by namespace, preventing cross-contamination.

## Next Steps After Validation

1. ✅ **Validation passes** → Run full benchmark (n=500)
2. ✅ **Full benchmark complete** → Run statistical analysis
3. ✅ **Results verified** → Migrate to type-safe `NamespaceId` (Phase 3)
4. ✅ **Type safety added** → Run final validation with new code

## Resources

- [README.md](README.md) - Full benchmark documentation
- [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md) - Docker usage guide
- [NAMESPACE_FIX_SUMMARY.md](docs/NAMESPACE_FIX_SUMMARY.md) - Type safety roadmap
- [EXECUTION_STRATEGY_COMPLETE.md](EXECUTION_STRATEGY_COMPLETE.md) - Execution plan

## Common Questions

**Q: Why not just fix the Python dependencies locally?**
A: Different Python versions (3.11, 3.14), PyTorch versions (2.2 vs 2.4), and platform-specific builds make local setup fragile. Docker eliminates all these issues.

**Q: Can I run individual benchmarks without Docker?**
A: Yes, but you'll need to manually resolve all dependency conflicts. Not recommended.

**Q: How long does the full benchmark take?**
A: ~2-4 hours for n=500 questions. Start with validation (n=20, ~5-10 min) first.

**Q: Can I use mock mode?**
A: Yes, add `--mock_kp` flag to skip real KP server, but you won't get real performance data.
