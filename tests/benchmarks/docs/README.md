# Benchmark Documentation

## Overview

This directory contains documentation for the KnowledgePlane benchmarking suite.

---

## Current Documentation

### [FRESHNESS_RESULTS.md](./FRESHNESS_RESULTS.md)
**Latest benchmark results: Time-to-Truth comparison**

Key findings:
- KP achieves **23.8x faster** mean time-to-truth vs FAISS baseline
- KP: 0.524s mean (sync embedding) vs FAISS: 12.4s (batch rebuild)
- 100% success rate on n=50 tests

### [BENCHMARK_ROADMAP.md](./BENCHMARK_ROADMAP.md)
**Roadmap for benchmark improvements and next steps**

### [VECTOR_BASELINE_README.md](./VECTOR_BASELINE_README.md)
**FAISS vector baseline implementation details**

### [spec.md](./spec.md)
**Original benchmark specification**

---

## Archived Documentation

Historical docs moved to `./archive/`:
- `METHODOLOGY.md` - Complete methodology for all benchmarks
- `FAQ.md` - Common questions and answers
- `LIMITATIONS.md` - Known limitations
- `EXAMPLE_CASE_STUDY.md` - Worked examples

---

## Quick Start

### Running Benchmarks

```bash
cd tests/benchmarks

# Quick validation (n=20)
./bench hotpot

# Full benchmark (n=500)
./bench hotpot --full

# Freshness with FAISS comparison (n=50)
./bench freshness

# Or from project root
npm run bench hotpot
```

### Environment Setup

```bash
# Required - copy from root .env
export KP_API_URL=http://localhost:8081  # REST API port
export OPENAI_API_KEY=sk-...

# For Docker, env is loaded from root .env automatically
```

### Port Reference

| Service | Port | URL |
|---------|------|-----|
| REST API | 8081 | `http://localhost:8081/api/*` |
| MCP Server | 8080 | `http://localhost:8080/mcp` |
| Webapp | 3000 | `http://localhost:3000` |
| ArangoDB | 8529 | `http://localhost:8529` |

---

## Results Location

All benchmark outputs are saved to `tests/benchmarks/output/`:

```
output/
├── hotpotqa_results.csv      # Per-question HotpotQA results
├── hotpotqa_summary.json     # Aggregate HotpotQA metrics
├── msmarco_results.csv       # Per-query MS MARCO results
├── msmarco_summary.json      # Aggregate ranking metrics
├── freshness_batch.json      # Freshness benchmark data
└── benchmark_report_*.json   # Combined reports
```

---

## Key Metrics

### Freshness (Time-to-Truth)
| Metric | KnowledgePlane | FAISS Baseline |
|--------|----------------|----------------|
| Mean | 0.524s | 12.448s |
| P95 | 0.733s | 14.197s |
| Advantage | **23.8x faster** | - |

### HotpotQA (Multi-Hop Reasoning)
- Target: KP achieves >10% higher EM than vector baseline
- Measures: Exact Match, F1, Latency

### MS MARCO (Passage Ranking)
- Measures: MRR, Recall@k, NDCG@k

---

## Contributing

To add new benchmark results:
1. Run the benchmark with appropriate sample size (n >= 50)
2. Save raw data to `output/`
3. Create a results doc in `docs/`
4. Update this README

---

## Folder Structure

```
tests/benchmarks/
├── bench                 # CLI entry point
├── src/                  # Python source
│   ├── hotpotqa.py       # HotpotQA benchmark
│   ├── freshness.py      # Freshness benchmark
│   ├── msmarco.py        # MS MARCO benchmark
│   └── lib/              # Shared modules
│       ├── adapter.py    # KP REST API adapter
│       ├── vector.py     # FAISS vector baseline
│       └── stats.py      # Statistical analysis
├── tests/                # Unit tests
├── examples/             # Demo scripts
├── docs/                 # Documentation
├── output/               # Latest results
└── runs/                 # Archived runs
```

---

**Last Updated**: 2026-02-17
