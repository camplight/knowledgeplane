# Benchmark Playbook

Quick reference for running KnowledgePlane benchmarks.

## TL;DR

```bash
cd tests/benchmarks

# 1. Preflight (automates all setup checks + cleanup)
./scripts/preflight.sh --fix

# 2. Run benchmarks
docker compose --profile freshness-batch up   # Freshness (5-10 min)
docker compose --profile validation up        # HotpotQA quick (10 min)
docker compose --profile msmarco up           # MS MARCO (15 min)
```

---

## Preflight Script

The `preflight.sh` script checks everything automatically:

| Check | What it does | `--fix` behavior |
|-------|--------------|------------------|
| .env file | Verifies OPENAI_API_KEY, KP_* vars | Creates template |
| Docker | Checks daemon and compose | - |
| ArangoDB | Checks container health | Starts container |
| REST API | Checks port 8081 responds | Starts API server |
| Benchmark image | Checks docker image exists | Builds image |
| Network | Tests host.docker.internal | - |
| **Cleanup** | Finds old benchmark facts | **Deletes them** |

```bash
# Dry run (just check)
./scripts/preflight.sh

# Auto-fix issues
./scripts/preflight.sh --fix
```

---

## Benchmark Profiles

| Profile | Command | Duration | Purpose |
|---------|---------|----------|---------|
| `freshness` | `--profile freshness up` | 2 min | Single freshness test |
| `freshness-batch` | `--profile freshness-batch up` | 5-10 min | Freshness (n=50) + FAISS |
| `validation` | `--profile validation up` | 5-10 min | Quick HotpotQA (n=20) |
| `msmarco` | `--profile msmarco up` | 15-30 min | MS MARCO (n=100) |
| `full` | `--profile full up` | 2-4 hours | Full HotpotQA (n=500) |
| `all` | `--profile all up` | 3-5 hours | All benchmarks |

---

## Common Issues

### Search returns wrong/old facts (0% success)

**Cause**: Old benchmark facts polluting search results

**Fix**: Run preflight with `--fix` (cleans up automatically), or manually:
```bash
curl -s "http://localhost:8529/_db/knowledgeplane/_api/cursor" \
  -u root:root -H "Content-Type: application/json" \
  -d '{"query": "FOR f IN facts FILTER STARTS_WITH(f.metadata.namespace, \"freshness\") REMOVE f IN facts RETURN 1"}' \
  | jq '.result | length'
```

### REST API not responding

**Fix**:
```bash
pkill -f "tsx.*server.ts" || true
cd apps/rest-api && PORT=8081 npx tsx src/server.ts &
```

### Docker can't reach host

**Fix**: Already handled via `extra_hosts` in docker-compose.yml. If still failing:
```bash
HOST_IP=$(ifconfig en0 | grep 'inet ' | awk '{print $2}')
echo "KP_API_URL=http://$HOST_IP:8081" >> .env
```

### Full reset

```bash
docker compose -f infra/docker-compose.dev.yml down -v
docker compose -f infra/docker-compose.dev.yml up -d
sleep 15
cd apps/rest-api && PORT=8081 npx tsx src/server.ts &
./tests/benchmarks/scripts/preflight.sh --fix
```

---

## Freshness Benchmark Options

```bash
# Default: KP + FAISS incremental comparison (fair)
python bench_freshness.py --mode api --n 50 --run_baseline

# FAISS full rebuild (worst-case, shows O(n) scaling)
python bench_freshness.py --mode api --n 50 --run_baseline --full-rebuild

# Scaling analysis
python bench_freshness.py --mode api --n 5 --run_baseline --scaling
```

---

## Output Files

Results saved to `tests/benchmarks/output/`:

| File | Content |
|------|---------|
| `hotpotqa_results_*.json` | HotpotQA accuracy metrics |
| `msmarco_results_*.json` | MS MARCO ranking metrics |
| `freshness_batch.json` | Freshness timing comparison |
| `statistical_summary.json` | Aggregated statistics |
