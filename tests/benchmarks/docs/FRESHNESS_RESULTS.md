# Freshness Benchmark Results

**Status:** Methodology being refined
**Last Valid Run:** 2026-02-16 (with full rebuild mode)
**Current Focus:** Fair incremental comparison

## Methodology Updates (2026-02-17)

The benchmark methodology has been updated to address identified issues:

1. **Success criteria fixed**: Now checks fact ID in metadata instead of substring matching
2. **Cleanup added**: Old benchmark facts are cleaned up before each run
3. **Incremental mode default**: FAISS now uses incremental add by default (fair comparison)
4. **Full rebuild optional**: Use `--full-rebuild` flag to see O(n) scaling behavior

## Test Configuration

```yaml
n: 50                    # Number of tests (recommend 50+ for statistics)
corpus_size: 1000        # FAISS background documents
embedding_model: text-embedding-3-small (KP) / all-MiniLM-L6-v2 (FAISS)
namespace: freshness_bench
mode: incremental        # Default: fair comparison (use --full-rebuild for worst-case)
```

## Commands to Reproduce

```bash
# Quick validation (n=1)
docker compose --profile freshness up

# Full benchmark with FAISS incremental comparison (n=50, fair comparison)
docker compose --profile freshness-batch up

# Full benchmark with FAISS full rebuild (n=50, worst-case)
python bench_freshness.py --mode api --n 50 --run_baseline --full-rebuild

# Scaling analysis with incremental mode
python bench_freshness.py --mode api --n 5 --run_baseline --scaling

# Scaling analysis with full rebuild (shows O(n) behavior)
python bench_freshness.py --mode api --n 5 --run_baseline --scaling --full-rebuild
```

## Architecture Comparison

### KnowledgePlane (sync_embedding=true)
```
Fact Creation → OpenAI Embedding API (~400ms) → ArangoDB Insert (~100ms) → Searchable
Total: ~500ms per fact (O(1))
```

### FAISS Incremental (fair comparison)
```
Fact Add → Embed new doc only (~50ms) → Add to index (~1ms) → Searchable
Total: ~50ms per fact (O(1))
```

### FAISS Full Rebuild (worst-case)
```
Fact Update → Re-embed ALL docs → Rebuild Index → Searchable
Total: ~12s at 1K docs, scales O(n) with corpus size
```

## Known Methodology Considerations

| Aspect | Status | Notes |
|--------|--------|-------|
| Embedding models differ | Known | KP uses OpenAI, FAISS uses local MiniLM |
| Incremental mode fair? | Yes for inserts | For updates requiring deletion, full rebuild is more realistic |
| Network latency | Not isolated | KP includes OpenAI API latency |
| Sample size | n=50+ recommended | For statistical significance |

## Historical Results (Full Rebuild Mode)

The following results were from an earlier run using FAISS full rebuild:

| Metric | KnowledgePlane | FAISS Full Rebuild |
|--------|----------------|-------------------|
| Mean | 0.524s | 12.448s |
| Median | 0.490s | 12.422s |
| P95 | 0.733s | 14.197s |

**Note:** These results use the worst-case FAISS comparison (full rebuild). With incremental mode, FAISS is faster for pure insertions.

## What This Benchmark Measures

- **Freshness**: Time from fact creation to searchability
- **Not measured**: Search quality, ranking accuracy, graph traversal
- **KP's advantage**: Real-time embedding at ingestion, not batch re-indexing

## Next Steps

- [x] Fix success criteria (metadata check vs substring match)
- [x] Add cleanup of old benchmark facts
- [x] Default to incremental mode (fair comparison)
- [ ] Run updated benchmark with n=50
- [ ] Add retrieval quality verification (is the right fact returned?)
- [ ] Compare against managed services (Pinecone upsert timing)
