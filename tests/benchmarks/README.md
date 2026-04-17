# KnowledgePlane Benchmarking Suite

## Quick Start

From the **repository root** (recommended):

```bash
npm run bench:quick   # all suite benchmarks with minimal n
npm run bench:all     # all suite benchmarks with default n
```

Requires `.env` and `.env.benchmark` (see `tests/benchmarks/scripts/setup-benchmark-env.sh`).

From `tests/benchmarks/` (stack must already be running):

```bash
./bench hotpot
./bench all
./bench runs
```

## Benchmarks

### HotpotQA (Multi-Hop Reasoning)
**Key Metric**: Supporting Facts F1 (SF F1)

Evaluates retrieval of evidence sentences for multi-hop questions.

```bash
./bench hotpot           # Quick (n=20)
./bench hotpot -n 100    # Medium
./bench hotpot --full    # Full (n=500)
```

| Metric | Description | Target |
|--------|-------------|--------|
| **SF F1** | Harmonic mean of precision/recall | > 25% |
| SF Recall | Found support sentences / Gold | > 65% |
| SF Precision | Correct sentences / Retrieved | > 15% |
| Doc Recall | Found relevant docs / Gold docs | > 70% |

### Freshness (Write-to-Searchable Latency)
**Key Metric**: Time-to-truth

Measures how quickly new facts become searchable.

```bash
./bench freshness
```

| Metric | Description | Target |
|--------|-------------|--------|
| Mean latency | Avg time to searchable | < 1.0s |
| P95 latency | 95th percentile | < 2.0s |

### MS MARCO (Passage Retrieval)
**Key Metric**: MRR (Mean Reciprocal Rank)

Evaluates single-hop passage retrieval quality.

```bash
./bench msmarco
```

| Metric | Description | Target |
|--------|-------------|--------|
| MRR | Mean reciprocal rank | > 0.30 |
| Recall@10 | Hit rate in top 10 | > 0.60 |
| NDCG@10 | Normalized DCG | > 0.35 |

## Commands

```bash
./bench hotpot      # HotpotQA benchmark
./bench freshness   # Freshness benchmark
./bench msmarco     # MS MARCO benchmark
./bench all         # All benchmarks
./bench runs        # List archived runs
./bench clean       # Remove old benchmark data from DB
./bench preflight   # Check environment
./bench help        # Show all options
```

## Options

```bash
-n, --n <num>       Number of questions (default: varies)
--quick             Minimal sample size (n=10)
--full              Full benchmark (n=500)
--skip-preflight    Skip environment checks
--no-archive        Don't save results to runs/
-- <args>           Pass extra args to Python script
```

## Results

Results are automatically archived:
```
runs/
  20260217_175057_hotpot_n20/
    metadata.json
    hotpotqa_results.csv
    hotpotqa_summary.json
```

## Prerequisites

1. **Docker** - All benchmarks run in containers
2. **KP REST API** - Running on port 8081
3. **ArangoDB** - Running on port 8529
4. **.env** - `OPENAI_API_KEY` set

## Troubleshooting

```bash
# Check environment
./bench preflight

# Clean old benchmark data
./bench clean

# Pass custom args to Python
./bench hotpot -- --run_vector false --seed 123
```

## Documentation

- [PLAYBOOK.md](PLAYBOOK.md) - Quick reference
- [docs/BENCHMARK_ROADMAP.md](docs/BENCHMARK_ROADMAP.md) - Strategy and methodology
- [docs/README.md](docs/README.md) - Technical details
