# Benchmark Debugging Summary

**Date**: 2026-02-14
**Issue**: 0% benchmark accuracy due to missing vector indexes
**Status**: Partially resolved - strategic logging added, vector index issue identified

## Problem Discovery

1. **Symptoms**: HotpotQA benchmark returned 0.0% Exact Match, 0.0% F1 score
2. **Root Cause**: Facts have embeddings (1536-dimensional vectors) but NO vector indexes exist
3. **Impact**: Semantic search works via brute-force cosine similarity but returns 0 results in benchmarks

## Investigation Steps

### 1. Checked Embeddings Status
- ✅ 200 facts have embeddings in workspace workspaces/668
- ✅ Embeddings are valid (1536 dimensions, text-embedding-3-small model)
- ✅ Worker successfully processes embeddings

### 2. Checked Vector Indexes
- ❌ NO vector indexes exist on facts, relations, or knowledge_cards collections
- ❌ Only inverted index exists: `idx_fact_embedding_inverted_test`

### 3. Vector Index Creation Attempts
- ❌ **HTTP API**: Returns 400 "Expecting type Array" error
- ❌ **arangojs 10.2.2**: Same error via `collection.ensureIndex()`
- ✅ **Database Flag**: `--experimental-vector-index` IS enabled in ArangoDB 3.12.4
- ✅ **Server logs**: Show "Loading 8192 vectors... for training" but indexes never complete

## Configuration Changes Made

### 1. ArangoDB Version
- Updated docker-compose files to use `arangodb:3.12` (community edition)
- Confirmed `--experimental-vector-index` flag is enabled
- Restarted database container with new configuration

### 2. Environment Cleanup
- **Before**: Redundant environment variables in each service
- **After**: Minimal overrides, rely on root `.env` file
- Only override `ARANGO_URL=http://db:8529` for Docker networking

### 3. Strategic Benchmark Logging Added

#### Embeddings Worker (`apps/background-workers/src/workers/embeddings-generator.ts`)
```javascript
console.log(`[BENCHMARK] Facts summary:`, {
  total: allFacts.length,
  with_embeddings: factsWithEmbeddings.length,
  without_embeddings: allFacts.length - factsWithEmbeddings.length,
  workspace: workspace.id,
  timestamp: new Date().toISOString(),
});
```

#### Vector Search (`packages/db/src/models/Fact.ts`)
```javascript
console.log(`[BENCHMARK] Vector search:`, {
  query: params.query.substring(0, 50) + '...',
  workspace_id: params.workspace_id,
  facts_with_embeddings: allFacts.length,
  results_returned: resultsWithScores.length,
  timing_ms: {
    embedding_generation: embeddingTime,
    db_query: queryTime,
    similarity_calculation: scoreTime,
    total: totalTime,
  },
  top_score: resultsWithScores[0]?.score || 0,
});
```

#### REST API Adapter (`tests/benchmarks/kp_adapter.py`)
```python
logger.info(
    f"[BENCHMARK] Query completed: query='{question[:50]}...' "
    f"total_hits={len(hits)} filtered_out={filtered_count} "
    f"results_returned={len(results)} time={elapsed_ms:.2f}ms "
    f"top_score={results[0].score if results else 0:.4f} "
    f"namespace={namespace} k={k}"
)
```

#### Benchmark Script (`tests/benchmarks/bench_hotpotqa.py`)
```python
logger.info(f"[BENCHMARK] Question {i+1}/{len(questions)}: {question_data['question'][:80]}...")
logger.info(
    f"[BENCHMARK] Question {i+1} complete: "
    f"kp_f1={result.kp_f1:.3f if result.kp_f1 else 'N/A'} "
    f"kp_retrieved={len(result.kp_retrieved_contexts)} "
    f"time={q_elapsed:.2f}s"
)
```

## Outstanding Issues

### Critical: Vector Index Creation Failure

**Error**: "Expecting type Array" from ArangoDB HTTP API

**Attempted Fix**:
```javascript
await collection.ensureIndex({
  type: "vector",
  fields: ["embedding"],
  name: `idx_${collectionName}_embedding_vector`,
  params: {
    metric: "cosine",
    dimension: 1536,
    nLists: 32,
  },
});
```

**Status**: Still failing despite:
- Using correct arangojs 10.2.2 format
- Having `--experimental-vector-index` enabled
- ArangoDB logs showing training attempts
- Embeddings existing in the database

**Next Steps**:
1. Try ArangoDB 3.12.6+ where vector indexes are more stable (not experimental)
2. Check if there's a specific Docker image tag needed
3. Manual index creation via arangosh CLI
4. Consider using inverted index as temporary workaround

## Benchmark Execution Strategy

### Incremental Testing (1 → 10 → 100 → 500 facts)

With the new logging, you can now run:

```bash
cd tests/benchmarks

# Test with 1 fact
docker compose --profile validation run --rm benchmark --n 1

# Test with 10 facts
docker compose --profile validation run --rm benchmark --n 10

# Test with 100 facts
docker compose --profile validation run --rm benchmark --n 100

# Test with 500 facts
docker compose --profile validation run --rm benchmark --n 500
```

### What to Look For in Logs

1. **`[BENCHMARK] Facts summary:`** - Verify embeddings exist
2. **`[BENCHMARK] Vector search:`** - Check timing and results count
3. **`[BENCHMARK] Query completed:`** - Verify queries return results
4. **`[BENCHMARK] Question X complete:`** - Track F1 scores and progress

### Expected Behavior (without vector index)

- Brute-force cosine similarity should still work
- Each query processes ALL facts with embeddings
- Performance degrades with more facts (O(n) vs O(log n) with index)
- Should return non-zero F1 scores if search logic is correct

## References

- [ArangoDB Vector Indexes Documentation](https://docs.arangodb.com/3.12/index-and-search/indexing/working-with-indexes/)
- [arangojs 10.2.2 Documentation](https://arangodb.github.io/arangojs/10.2.2/)
- ADR-ENV-001: Waterfall Environment Configuration

## Files Modified

1. `apps/background-workers/src/workers/embeddings-generator.ts` - Added benchmark logging
2. `packages/db/src/models/Fact.ts` - Added vector search timing logs
3. `tests/benchmarks/kp_adapter.py` - Added query detail logs
4. `tests/benchmarks/bench_hotpotqa.py` - Added question progress logs
5. `infra/docker-compose.yml` - Cleaned up env configs, updated to 3.12
6. `infra/docker-compose.dev.yml` - Same cleanup
7. `packages/db/src/db.ts` - Enhanced error logging for vector index creation

---

**Status**: Ready for incremental benchmark testing with comprehensive logging
**Blocker**: Vector index creation needs resolution for optimal performance
