# Benchmark Playbook

## Quick Start

From the **repository root** (starts ArangoDB and reranker if needed, REST API, background workers, then runs benchmarks):

```bash
# Full default suite (freshness + hotpot + msmarco; can take 30–60+ minutes)
npm run bench:all

# Same suite with minimal sample sizes (~10–20 minutes depending on machine)
npm run bench:quick

# Skip reranker entirely (no long model download; embedding-only in workers)
npm run bench:quick:norerank
# equivalent: BENCH_SKIP_RERANKER=1 npm run bench:quick
```

**Reranker**: If the reranker container does not become healthy in time, the stack script **continues by default** (soft skip) and prints recent `docker logs`. Use **`BENCH_STRICT_RERANKER=1`** if you want the run to **fail** when the reranker never comes up.

One-time env (needs Arango reachable on `localhost:8529`):

```bash
bash tests/benchmarks/scripts/setup-benchmark-env.sh
```

Advanced (from `tests/benchmarks/` only — you must already have the stack up):

```bash
cd tests/benchmarks
./bench hotpot -n 100
./bench runs
```

## Commands

| Command | Description | Duration |
|---------|-------------|----------|
| `./bench hotpot` | HotpotQA multi-hop (n=20) | 5-10 min |
| `./bench hotpot --full` | HotpotQA full (n=500) | 2-4 hours |
| `./bench freshness` | Write-to-searchable latency | 5-10 min |
| `./bench msmarco` | MS MARCO passage retrieval | 15-30 min |
| `./bench all` | All benchmarks | 3-5 hours |
| `./bench runs` | List archived runs | instant |
| `./bench clean` | Remove old benchmark data | instant |
| `./bench preflight` | Check environment | instant |

## Options

If **`./bench all --quick`** (or freshness with small `-n`) still feels slow, the FAISS baseline embeds a **background corpus**; small `n` now uses a **smaller default corpus** automatically. For the fastest run: `BENCH_SKIP_FAISS_BASELINE=1 ./bench freshness --quick` or set that env when invoking `./bench all`.

```bash
./bench hotpot -n 50              # Custom number of questions
./bench hotpot --quick            # Minimal (n=10)
./bench hotpot --full             # Full (n=500)
./bench hotpot --skip-preflight   # Skip environment checks
./bench hotpot --no-archive       # Don't save to runs/
./bench hotpot -- --seed 42       # Pass args to Python
```

## Results

Results are automatically archived to `runs/<timestamp>_<benchmark>/`.

View past runs:
```bash
./bench runs
```

## Troubleshooting

### Network activity every run (“it keeps downloading”)

1. **First fix (runtime):** Benchmark Docker now mounts **`tests/benchmarks/.cache` → `/root/.cache`** and sets Hub/datasets/transformers env vars so **datasets and embedding models** (HotpotQA/MS MARCO, FAISS baseline `all-MiniLM-L6-v2`, etc.) stay on disk between runs. Before, only part of the cache was mounted, so **sentence-transformers / PyTorch often wrote to `/root/.cache/torch` inside the ephemeral container** and re-fetched weights every time.

2. **Still normal sometimes:** `./bench` runs **`docker compose build`** before each benchmark script. If the image is already built, this is usually fast (cached layers). You will still see **full downloads** when the Dockerfile/requirements change, or the first time you build the image.

### HTTP 401 from benchmarks / long “polling” with errors

The benchmark **Docker** container must load **`.env.benchmark`** (not only `.env`) so `KP_API_KEY` and workspace IDs are set. That is configured in `tests/benchmarks/docker-compose.yml`. After `scripts/bench-warm-db.ts` rotates keys, re-run benchmarks so the container picks up the updated file.

### REST API not responding
Use `npm run bench:quick` or `npm run bench:all` from the repo root so the API and workers start with the right env files.

### Search returns wrong/old facts
```bash
./bench clean
```

### Pass custom Python args
```bash
./bench hotpot -- --run_vector false --seed 123
```
