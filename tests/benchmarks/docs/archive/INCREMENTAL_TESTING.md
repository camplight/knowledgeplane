# Incremental Testing Guide

Step-by-step validation of the KnowledgePlane embeddings pipeline.

## Quick Start

```bash
# Run all incremental tests (1 → 10 → 100 facts)
python test_incremental.py

# Verify existing pipeline state
./scripts/verify_pipeline.sh <namespace>
```

## What Gets Tested

### Phase 0: Infrastructure
- MCP server connectivity
- REST API health
- Authentication

### Phase 1: Single Fact
1. Ingest 1 fact
2. Trigger embeddings
3. Wait for generation (max 60s)
4. Verify retrieval works

### Phase 2: Small Batch (10 Facts)
1. Ingest 10 capital city facts
2. Trigger batch embeddings
3. Wait for generation (max 120s)
4. Verify batch retrieval

### Phase 3: Medium Batch (100 Facts)
1. Load real HotpotQA documents
2. Ingest ~50 unique documents
3. Trigger embeddings
4. Test retrieval with actual questions

## Usage Examples

### Run All Phases
```bash
python test_incremental.py
```

### Use Custom Configuration
```bash
python test_incremental.py \
  --api-url http://localhost:8081 \
  --workspace-id 668 \
  --user-id 664 \
  --api-key bench_4d4e2e4eebfa49a68ede6114
```

### Verify Existing Data
```bash
# Check if namespace has facts and embeddings
./scripts/verify_pipeline.sh incremental_test_1707912345

# Or use curl directly
curl -X POST "http://localhost:8081/api/facts/search?workspace_id=668" \
  -H "Content-Type: application/json" \
  -H "knowledgeplane-key: bench_4d4e2e4eebfa49a68ede6114" \
  -d '{"query": "test", "k": 5}' | jq
```

## Output

### Console Output
```
==========================================
Starting Incremental Benchmark Testing
==========================================

============================================================
Running Phase 0: Infrastructure
============================================================
Testing MCP server connectivity...
  ✓ MCP server responding: 200
Testing REST API connectivity...
  ✓ REST API responding: 200
Testing authentication...
  ✓ Authentication successful, 15 tools available
✅ Phase 0: Infrastructure PASSED (0.45s)

============================================================
Running Phase 1: Single Fact
============================================================
Step 1: Ingesting single fact...
  ✓ Fact ingested: fact_12345
Step 2: Triggering embedding generation...
  ✓ Embedding generation triggered: 1 facts
Step 3: Waiting for embedding generation (max 60s)...
  Waiting... (5s/60s)
  ✓ Embeddings ready
Step 4: Retrieving fact via semantic search...
  ✓ Fact successfully retrieved (1 results)
✅ Phase 1: Single Fact PASSED (15.32s)
```

### JSON Output
Results saved to `output/incremental/incremental_test_results.json`:

```json
{
  "timestamp": 1707912345.123,
  "namespace": "incremental_test_1707912345",
  "phases": [
    {
      "phase": "phase_0",
      "passed": true,
      "duration_seconds": 0.45,
      "details": {
        "mcp_health": {"status": "ok"},
        "rest_health": {"status": "ok"},
        "auth_test": "success",
        "available_tools": 15
      },
      "error": null
    },
    {
      "phase": "phase_1",
      "passed": true,
      "duration_seconds": 15.32,
      "details": {
        "ingestion": {"fact_id": "fact_12345"},
        "embedding_trigger": {"triggered_count": 1},
        "embedding_ready": true,
        "retrieval": {"facts": [...]}
      },
      "error": null
    }
  ],
  "summary": {
    "total_phases": 3,
    "passed_phases": 3,
    "failed_phases": 0,
    "total_duration": 45.67
  }
}
```

## Troubleshooting

### Phase 0 Fails (Infrastructure)
```bash
# Check if servers are running
docker ps | grep knowledgeplane

# Check MCP server
curl http://localhost:8080/health

# Check REST API
curl http://localhost:8081/health

# Verify credentials in .env
cat .env
```

### Phase 1 Fails (Single Fact)
```bash
# Check fact was created
curl -X POST "http://localhost:8081/api/facts/search?workspace_id=668" \
  -H "knowledgeplane-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "*", "k": 100}' | jq '.hits | length'

# Check embedding worker logs
docker logs knowledgeplane_worker_1

# Manually trigger embeddings
curl -X POST "http://localhost:8081/api/facts/trigger-embeddings?workspace_id=668" \
  -H "knowledgeplane-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "incremental_test_1707912345"}'
```

### Phase 2/3 Fails (Batches)
```bash
# Check how many facts were ingested
./scripts/verify_pipeline.sh incremental_test_1707912345

# Check embedding generation progress
# (Look for facts with embedding != null)

# If timeout, increase wait time in test_incremental.py:
# Line 360: timeout=120 → timeout=300
# Line 467: timeout=300 → timeout=600
```

## Recovery Procedures

### Stuck Embeddings
If embeddings never complete:

```bash
# 1. Check background worker is running
docker ps | grep worker

# 2. Check worker logs for errors
docker logs -f knowledgeplane_worker_1

# 3. Restart worker if needed
docker-compose restart background-workers

# 4. Re-trigger embeddings
curl -X POST "http://localhost:8081/api/facts/trigger-embeddings?workspace_id=668" \
  -H "knowledgeplane-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "YOUR_NAMESPACE"}'
```

### Clean Namespace
To start fresh:

```bash
# Delete all facts in test namespace
# (No direct API - use ArangoDB Web UI or arangosh)

# Or use a new namespace by re-running tests
python test_incremental.py
```

## Next Steps

After all phases pass:

```bash
# Ready for full benchmarks!
python bench_hotpotqa.py --n 500 --mode cached
```

## Performance Expectations

| Phase | Facts | Ingest | Embeddings | Total |
|-------|-------|--------|------------|-------|
| 0     | 0     | -      | -          | ~1s   |
| 1     | 1     | ~0.5s  | ~15s       | ~20s  |
| 2     | 10    | ~2s    | ~45s       | ~60s  |
| 3     | 50    | ~10s   | ~120s      | ~150s |

Total expected runtime: **~4-5 minutes**

## Success Criteria

✅ All phases pass
✅ Facts ingested == Facts expected
✅ Embeddings generated for all facts
✅ Semantic search returns results
✅ No errors in worker logs

## Environment Variables

Required in `.env`:
```bash
KP_API_URL=http://localhost:8081
KP_WORKSPACE_ID=668
KP_USER_ID=664
KP_API_KEY=bench_4d4e2e4eebfa49a68ede6114
```

## Files

- `test_incremental.py` - Main incremental test harness
- `scripts/verify_pipeline.sh` - Quick verification script
- `output/incremental/` - Test results output directory

## Additional Verification Commands

### Count Facts in Namespace
```bash
curl -X POST "http://localhost:8081/api/facts/search?workspace_id=668" \
  -H "knowledgeplane-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "*", "k": 1000}' | \
  jq '[.hits[] | select(.metadata.namespace == "YOUR_NAMESPACE")] | length'
```

### Check Embeddings Exist
```bash
# If semantic search returns results with scores > 0, embeddings exist
curl -X POST "http://localhost:8081/api/facts/search?workspace_id=668" \
  -H "knowledgeplane-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "k": 5}' | \
  jq '.hits[] | {id, score, namespace: .metadata.namespace}'
```

### Test Retrieval Quality
```bash
# Test with a meaningful query
curl -X POST "http://localhost:8081/api/facts/search?workspace_id=668" \
  -H "knowledgeplane-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "capital of France", "k": 5}' | \
  jq '.hits[] | {content, score}'
```
