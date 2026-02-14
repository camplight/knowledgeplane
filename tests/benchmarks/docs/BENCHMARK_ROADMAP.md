# KnowledgePlane Benchmark Roadmap

## Milestone 1: Fast Feedback Loop (Current Focus)
**Goal**: Reduce iteration time from 5+ minutes to <30 seconds

### 1.1 Fix Embedding Wait Detection ✅
- [ ] Current: Polls generic queries, often misses new namespace data
- [ ] Fix: Query by namespace directly to verify embeddings exist
- [ ] Test: Embeddings detected within 30s of generation

### 1.2 Implement Cached Mode ⏳
- [ ] First run: `--mode seed` → Ingest + generate embeddings + save namespace
- [ ] Subsequent: `--mode cached` → Reuse existing namespace, skip ingestion
- [ ] Benefit: 2-5s runs instead of 300s+

### 1.3 Cache HotpotQA Dataset Locally ⏳
- [ ] Download once, cache in `./data/hotpotqa_validation.json`
- [ ] Skip HuggingFace download on subsequent runs
- [ ] Benefit: Save 30-40s per run

## Milestone 2: Reliable Results
**Goal**: Get meaningful F1 scores, not 0.0%

### 2.1 Verify Answer Extraction
- [ ] Debug why F1 = 0.0% despite good retrieval scores
- [ ] Check if retrieved context contains the answer
- [ ] May need to adjust k parameter or scoring threshold

### 2.2 Namespace Isolation
- [ ] Ensure cached namespace doesn't pollute between runs
- [ ] Add namespace cleanup option: `--cleanup-namespace`

## Milestone 3: Production Benchmark Suite
**Goal**: Publishable benchmark results

### 3.1 Full Run Configuration
- [ ] n=500 questions
- [ ] Both KP and vector baseline
- [ ] Statistical analysis enabled
- [ ] Output to `output/YYYY-MM-DD_hotpotqa_full/`

### 3.2 Documentation
- [ ] Clear README with one-command setup
- [ ] Results interpretation guide
- [ ] Comparison with other RAG systems

---

## Quick Commands

```bash
# Milestone 1: Fast iteration
./scripts/run-benchmark.sh --mode cached --n 10    # 5-10 seconds

# Milestone 2: Verify results
./scripts/run-benchmark.sh --mode timestamped --n 20 --debug

# Milestone 3: Full benchmark
./scripts/run-benchmark.sh --mode full --n 500 --statistical
```

## Current Blockers

1. **Embedding wait timeout** - Detection logic doesn't find new namespace data
2. **No seed command** - Can't pre-populate cached namespace
3. **Dataset re-download** - 30s overhead every run

## Next Actions

1. Fix `_wait_for_embeddings()` to query by namespace
2. Add `--mode seed` to pre-populate cached data
3. Cache HotpotQA dataset locally
4. Test cached mode end-to-end
