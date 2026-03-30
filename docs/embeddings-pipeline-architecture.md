# Embeddings Pipeline Architecture Analysis

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EMBEDDINGS PIPELINE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐       ┌──────────────┐       ┌──────────────────────────┐
│   REST API   │       │  MCP Server  │       │   Background Workers     │
│  (Port 8081) │       │  (stdio/SSE) │       │  (Always Running)        │
└──────┬───────┘       └──────┬───────┘       └──────────┬───────────────┘
       │                      │                           │
       │ POST /api/facts      │ facts_write tool          │
       ├──────────────────────┴───────────────────────────┤
       │                                                   │
       │                Fact.write()                       │
       │              (Saves to ArangoDB)                  │
       │                      │                            │
       │                      ▼                            │
       │            ┌─────────────────┐                    │
       │            │   ArangoDB      │                    │
       │            │   facts         │                    │
       │            │   workspace_id  │                    │
       │            │   content       │◄───────────────────┤
       │            │   embedding=null│                    │
       │            └────────┬────────┘                    │
       │                     │                             │
       │         triggerWebhook()                          │
       │         "fact.created"                            │
       │         (If webhooks exist)                       │
       │                     │                             │
       │                     ▼                             │
       │            ┌─────────────────┐                    │
       │            │  webhook_triggers│                   │
       │            │  (Optional)      │                   │
       │            └──────────────────┘                   │
       │                                                    │
       │                                                    │
       └────────────────────────────────────────────────────┤
                                                            │
                    ┌───────────────────────────────────────┘
                    │
                    ▼
       ┌────────────────────────────────────────────┐
       │  EmbeddingsGenerator Worker                │
       │  (3 Trigger Mechanisms)                    │
       └────────────────────────────────────────────┘

TRIGGER 1: Real-time Queue (PRIMARY - NOT IMPLEMENTED YET)
────────────────────────────────────────────────────────────
   [PLANNED] After Fact.write() → Call embeddingsGenerator.enqueueFact()
   ✗ Currently: No integration between Fact.write() and worker
   ✗ The enqueue* methods exist but are never called

TRIGGER 2: Periodic Sweep (BACKUP - CURRENTLY ACTIVE)
────────────────────────────────────────────────────────────
   Every 10 minutes:
   1. Get all workspaces
   2. For each workspace:
      - Query facts WHERE embedding is null OR embedding=[]
      - Batch by token count (300k tokens/batch)
      - Call OpenAI embeddings API
      - Update fact.embedding + fact.embedding_model
   3. Create worker_logs entry per workspace

TRIGGER 3: Manual Trigger via API (IMPLEMENTED)
────────────────────────────────────────────────────────────
   POST /api/facts/trigger-embeddings
   1. Insert records into worker_triggers collection
   2. Worker checks every 30 seconds for pending triggers
   3. Processes all facts without embeddings
   4. Updates trigger status: pending → processing → completed

┌────────────────────────────────────────────────────────────┐
│                    SEARCH FLOW                              │
└────────────────────────────────────────────────────────────┘

   POST /api/facts/search
         │
         ├─ query="*" → Full-text search (no embeddings)
         │
         ├─ use_vector_search=true → Vector search only
         │   └─ generateQueryEmbedding() → cosine similarity
         │
         ├─ use_vector_search=false → Full-text only
         │   └─ FULLTEXT(facts, "content", query)
         │
         └─ default → Hybrid search
             ├─ Full-text results (limit × 2)
             ├─ Vector results (limit × 2)
             └─ Deduplicate + average scores
```

---

## Question 1: How Does the Current Embeddings Pipeline Work?

### Current Flow (Trigger 2 - Periodic Sweep)

1. **Background Worker Startup** (`apps/background-workers/src/index.ts`)
   ```typescript
   const embeddingsGenerator = new EmbeddingsGenerator();
   embeddingsGenerator.start(); // Runs every 10 minutes
   ```

2. **Worker Process Method** (Lines 368-655 in `embeddings-generator.ts`)
   - Iterates through ALL workspaces
   - For each workspace:
     - Fetches ALL facts in batches of 100 (up to 10k safety limit)
     - Filters facts WHERE `!embedding || embedding.length === 0 || embedding_model !== this.embeddingModel`
     - Creates token-aware batches (max 300k tokens per batch)
     - Calls OpenAI embeddings API: `provider.embeddings(texts, model)`
     - Updates each fact: `collections.facts.update(key, { embedding, embedding_model })`
   - Same process for relations and knowledge cards
   - Creates `worker_logs` entry with metrics

3. **Token Management**
   - Conservative estimation: 3 chars = 1 token
   - Truncates content if > 300k tokens
   - Batches multiple facts by total token count

4. **Rate Limiting**
   - PQueue: 1 request per 1.2 seconds (50 req/min)
   - Prevents OpenAI rate limit errors

### Intended Flow (Trigger 1 - Real-time Queue) - NOT IMPLEMENTED

The worker has `enqueueFact()`, `enqueueRelation()`, `enqueueCard()` methods (lines 45-92), but:
- **These are NEVER called** from `Fact.write()` or REST API
- The integration layer is missing
- Would provide <2 second embedding generation after fact creation

---

## Question 2: Where Does the Workspace ID Fix Come Into Play?

### The Workspace ID Issue (Line 395)

```typescript
// Use full workspace ID (with "workspaces/" prefix) to match how facts are stored
const workspaceId = workspace.id;
console.log(`DEBUG: Processing workspace ${workspaceId}`);
```

**Context:**
- Facts are stored with `workspace_id` field (e.g., `"workspaces/12345"`)
- The worker must use the FULL ID to match facts correctly
- Bug history: Previous versions likely used `_key` instead of `_id`, causing mismatches

**Where it matters:**
- Line 406: `Fact.list(workspaceId, batchSize, offset, false)` - queries by workspace_id
- Line 468: `FactRelation.query({ workspace_id: workspaceId, ... })` - filters relations
- Line 536: `KnowledgeCard.list(workspaceId, 100, cardOffset)` - filters cards

**Verification:** The fix ensures that when a fact is created with `workspace_id="workspaces/2592"`, the worker correctly finds it during the sweep.

---

## Question 3: Expected Flow from Fact Creation to Embedding Generation

### Current State (Periodic Sweep)

```
Time T:
  ├─ POST /api/facts {"content": "test"}
  │  └─ Fact.write() → Saves to DB with embedding=null
  │
Time T + random(0-10 minutes):
  ├─ Worker periodic sweep triggers
  │  └─ Queries all facts with embedding=null
  │     └─ Finds our fact
  │        └─ Generates embedding via OpenAI
  │           └─ Updates fact.embedding
```

**Characteristics:**
- Latency: 0-10 minutes (average ~5 minutes)
- Batch-optimized: Processes multiple facts together
- Cost-effective: Amortizes API overhead
- NOT suitable for real-time search

### Ideal State (Real-time Queue) - Requires Implementation

```
Time T:
  ├─ POST /api/facts {"content": "test"}
  │  └─ Fact.write() → Saves to DB
  │     └─ embeddingsGenerator.enqueueFact(workspaceId, factId) ← MISSING
  │
Time T + 1.2s (queue delay):
  ├─ Queue processes fact
  │  └─ processSingleFact()
  │     └─ OpenAI API call
  │        └─ Update fact.embedding
```

**Characteristics:**
- Latency: ~1-2 seconds
- Real-time: Suitable for immediate search
- Rate-limited: 50 req/min via PQueue
- Duplicate prevention: `processedIds` Set

---

## Question 4: How Can We Verify Embeddings Are Generated?

### Method 1: Direct Database Query

```bash
# Check if fact has embedding
curl -X POST http://localhost:8081/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "FOR f IN facts FILTER f._key == \"2592\" RETURN { id: f._id, has_embedding: HAS(f, \"embedding\"), embedding_length: LENGTH(f.embedding), model: f.embedding_model }"
  }'
```

Expected output:
```json
{
  "results": [{
    "id": "facts/2592",
    "has_embedding": true,
    "embedding_length": 1536,  // text-embedding-3-small
    "model": "text-embedding-3-small"
  }]
}
```

### Method 2: Worker Logs

```bash
# Query worker_logs to see if embeddings were generated
curl -X POST http://localhost:8081/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "FOR log IN worker_logs FILTER log.worker_name == \"embeddings-generator\" SORT log.created_at DESC LIMIT 5 RETURN log"
  }'
```

Expected fields:
- `status: "success"`
- `items_updated: N` (number of facts processed)
- `execution_time_ms: X`

### Method 3: Manual Trigger + Immediate Verification

```bash
# Trigger embeddings generation
curl -X POST http://localhost:8081/api/facts/trigger-embeddings \
  -H "Content-Type: application/json" \
  -d '{"fact_ids": ["facts/2592"]}'

# Wait 30-60 seconds, then check
curl "http://localhost:8081/api/facts/facts/2592"
```

### Method 4: Search with Vector Search

```bash
# If embedding exists, vector search should work
curl -X POST http://localhost:8081/api/facts/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test content",
    "use_vector_search": true,
    "k": 5
  }'
```

If embeddings exist, you'll get similarity scores > 0.

---

## Question 5: Critical Integration Points to Test

### Integration Point 1: REST API → Worker (BROKEN)

**Current State:**
```typescript
// packages/db/src/models/Fact.ts:108
// After saving fact, only triggers webhook
triggerWebhook("fact.created", record).catch((error) => {
  console.error("Failed to trigger fact.created webhook:", error);
});
// ❌ Missing: embeddingsGenerator.enqueueFact() call
```

**Test:**
1. Create fact via REST API
2. Verify embedding is generated within 2 seconds (should fail)
3. Wait 10 minutes for periodic sweep (should succeed)

### Integration Point 2: Workspace ID Propagation

**Test:**
```bash
# Create fact with explicit workspace_id
curl -X POST http://localhost:8081/api/facts \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test workspace propagation",
    "workspace_id": "workspaces/2592",
    "created_by": "users/test",
    "last_updated_by": "users/test"
  }'

# Verify fact is saved with correct workspace_id
curl -X POST http://localhost:8081/api/query \
  -d '{"query": "FOR f IN facts FILTER f.workspace_id == \"workspaces/2592\" RETURN f"}'
```

**Expected:** Fact should have `workspace_id: "workspaces/2592"` (with prefix)

### Integration Point 3: OpenAI API Key Configuration

**Test:**
```bash
# Check if OPENAI_API_KEY is set in background worker
docker logs knowledgeplane-background-workers-1 | grep "OPENAI_API_KEY"

# Expected: No errors about missing API key
# If missing, worker constructor throws: "OPENAI_API_KEY environment variable is required"
```

### Integration Point 4: Embedding Model Consistency

**Test:**
```sql
-- Check if all embeddings use the same model
FOR f IN facts
  FILTER HAS(f, "embedding")
  COLLECT model = f.embedding_model WITH COUNT INTO count
  RETURN { model, count }
```

**Expected:** All facts should use `"text-embedding-3-small"` (default)

### Integration Point 5: Worker Trigger Collection

**Test:**
```bash
# Ensure worker_triggers collection exists and worker can read it
curl -X POST http://localhost:8081/api/query \
  -d '{"query": "FOR t IN worker_triggers FILTER t.worker_name == \"embeddings-generator\" RETURN t"}'
```

**Expected:** Returns array (empty or with triggers)

---

## Critical Tests Needed (Prioritized)

### Test 1: End-to-End Fact Creation → Embedding Generation

**Priority:** HIGH
**Purpose:** Validate the entire pipeline works

```bash
#!/bin/bash
# Test script: test-embeddings-e2e.sh

# 1. Create fact
FACT_ID=$(curl -s -X POST http://localhost:8081/api/facts \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Embeddings test at '$(date +%s)'",
    "workspace_id": "workspaces/2592",
    "created_by": "users/test",
    "last_updated_by": "users/test"
  }' | jq -r '.fact.id')

echo "Created fact: $FACT_ID"

# 2. Check immediately (should NOT have embedding)
sleep 2
curl -s "http://localhost:8081/api/facts/$FACT_ID" | jq '.fact | {id, has_embedding: (.embedding != null)}'

# 3. Wait for periodic sweep (max 10 minutes)
echo "Waiting for periodic sweep..."
for i in {1..60}; do
  sleep 10
  HAS_EMBEDDING=$(curl -s "http://localhost:8081/api/facts/$FACT_ID" | jq -r '.fact.embedding != null')
  if [ "$HAS_EMBEDDING" = "true" ]; then
    echo "✓ Embedding generated after $((i * 10)) seconds"
    exit 0
  fi
  echo "  Attempt $i/60: No embedding yet..."
done

echo "✗ FAIL: Embedding not generated after 10 minutes"
exit 1
```

### Test 2: Manual Trigger Mechanism

**Priority:** HIGH
**Purpose:** Validate on-demand embedding generation

```bash
#!/bin/bash
# test-manual-trigger.sh

# 1. Create fact without embedding
FACT_ID=$(curl -s -X POST http://localhost:8081/api/facts \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Manual trigger test",
    "workspace_id": "workspaces/2592",
    "created_by": "users/test",
    "last_updated_by": "users/test"
  }' | jq -r '.fact.id')

# 2. Trigger embedding generation
curl -X POST http://localhost:8081/api/facts/trigger-embeddings \
  -H "Content-Type: application/json" \
  -d "{\"fact_ids\": [\"$FACT_ID\"]}"

# 3. Wait for worker to process (30 second check interval + processing time)
sleep 45

# 4. Verify embedding exists
curl -s "http://localhost:8081/api/facts/$FACT_ID" | \
  jq '{has_embedding: (.fact.embedding != null), model: .fact.embedding_model}'

# Expected: {"has_embedding": true, "model": "text-embedding-3-small"}
```

### Test 3: Workspace Isolation

**Priority:** MEDIUM
**Purpose:** Ensure embeddings respect workspace boundaries

```bash
#!/bin/bash
# test-workspace-isolation.sh

# Create facts in different workspaces
WS1="workspaces/2592"
WS2="workspaces/9999"

FACT1=$(curl -s -X POST http://localhost:8081/api/facts \
  -d "{\"content\": \"WS1 fact\", \"workspace_id\": \"$WS1\", \"created_by\": \"users/test\", \"last_updated_by\": \"users/test\"}" | jq -r '.fact.id')

FACT2=$(curl -s -X POST http://localhost:8081/api/facts \
  -d "{\"content\": \"WS2 fact\", \"workspace_id\": \"$WS2\", \"created_by\": \"users/test\", \"last_updated_by\": \"users/test\"}" | jq -r '.fact.id')

# Trigger embeddings for WS1 only
curl -X POST http://localhost:8081/api/facts/trigger-embeddings \
  -d "{\"fact_ids\": [\"$FACT1\"]}"

sleep 45

# Verify
echo "Fact 1 (WS1): $(curl -s http://localhost:8081/api/facts/$FACT1 | jq '.fact.embedding != null')"
echo "Fact 2 (WS2): $(curl -s http://localhost:8081/api/facts/$FACT2 | jq '.fact.embedding != null')"

# Expected: Fact 1 = true, Fact 2 = false
```

### Test 4: Vector Search Functionality

**Priority:** HIGH
**Purpose:** Validate embeddings enable semantic search

```bash
#!/bin/bash
# test-vector-search.sh

# 1. Create semantically related facts
curl -X POST http://localhost:8081/api/facts \
  -d '{"content": "Python is a programming language", "workspace_id": "workspaces/2592", "created_by": "users/test", "last_updated_by": "users/test"}'

curl -X POST http://localhost:8081/api/facts \
  -d '{"content": "JavaScript is used for web development", "workspace_id": "workspaces/2592", "created_by": "users/test", "last_updated_by": "users/test"}'

curl -X POST http://localhost:8081/api/facts \
  -d '{"content": "Bananas are yellow fruits", "workspace_id": "workspaces/2592", "created_by": "users/test", "last_updated_by": "users/test"}'

# 2. Wait for embeddings
sleep 600  # 10 minutes

# 3. Search for "coding languages"
curl -X POST http://localhost:8081/api/facts/search \
  -d '{"query": "coding languages", "use_vector_search": true, "k": 3}' | \
  jq '.hits[] | {content: .content, score}'

# Expected: Python and JavaScript should rank higher than Bananas
```

### Test 5: Performance Under Load

**Priority:** MEDIUM
**Purpose:** Validate rate limiting and batching work correctly

```bash
#!/bin/bash
# test-bulk-embeddings.sh

# Create 100 facts
for i in {1..100}; do
  curl -s -X POST http://localhost:8081/api/facts \
    -d "{\"content\": \"Bulk test fact $i with unique content to avoid deduplication\", \"workspace_id\": \"workspaces/2592\", \"created_by\": \"users/test\", \"last_updated_by\": \"users/test\"}" &
done

wait

# Trigger embeddings for workspace
curl -X POST http://localhost:8081/api/facts/trigger-embeddings \
  -d '{"namespace": null}'

# Monitor worker logs
echo "Monitoring worker logs..."
# Expected: Batched processing, no rate limit errors
```

---

## Summary: What's Working vs. What's Broken

### ✅ Working

1. **Periodic Sweep** - Embeddings ARE generated every 10 minutes
2. **Token-Aware Batching** - Prevents API overload
3. **Rate Limiting** - PQueue prevents rate limit errors
4. **Workspace Isolation** - Facts filtered by workspace_id correctly
5. **Manual Trigger API** - Can force embedding generation via REST
6. **Worker Logs** - Audit trail of embedding generation
7. **Hybrid Search** - Full-text + vector search working

### ❌ Broken / Missing

1. **Real-time Embeddings** - `enqueueFact()` never called after `Fact.write()`
2. **Fast Feedback** - 0-10 minute delay not acceptable for benchmarks
3. **Integration Layer** - No connection between REST API and worker queue
4. **Webhook Integration** - Could trigger embeddings but doesn't

### 🔧 Recommended Fixes

#### Fix 1: Add Real-time Enqueue (5 minutes)

```typescript
// packages/db/src/models/Fact.ts

// At top of file
import { getEmbeddingsGenerator } from "../workers/embeddings-singleton";

// In Fact.write() after line 101
const record = this._normalizeRecord(result.new!);

// ADD THIS:
const embedGen = getEmbeddingsGenerator();
if (embedGen) {
  embedGen.enqueueFact(input.workspace_id, record.id).catch(err => {
    console.error("Failed to enqueue fact for embeddings:", err);
  });
}

// Existing webhook trigger
triggerWebhook("fact.created", record).catch((error) => {
  console.error("Failed to trigger fact.created webhook:", error);
});
```

#### Fix 2: Create Embeddings Singleton (10 minutes)

```typescript
// packages/db/src/workers/embeddings-singleton.ts
import type { EmbeddingsGenerator } from "@knowledgeplane/background-workers";

let embeddingsGeneratorInstance: any = null;

export function setEmbeddingsGenerator(generator: any) {
  embeddingsGeneratorInstance = generator;
}

export function getEmbeddingsGenerator(): any | null {
  return embeddingsGeneratorInstance;
}
```

#### Fix 3: Register Generator in Background Worker (2 minutes)

```typescript
// apps/background-workers/src/index.ts
import { setEmbeddingsGenerator } from "@knowledgeplane/db";

async function main() {
  // ...existing code...

  const embeddingsGenerator = new EmbeddingsGenerator();
  embeddingsGenerator.start();

  // ADD THIS:
  setEmbeddingsGenerator(embeddingsGenerator);

  // ...rest of code...
}
```

---

## Performance Characteristics

| Metric | Current (Periodic) | With Real-time | Target |
|--------|-------------------|----------------|--------|
| Latency (avg) | 5 minutes | 1-2 seconds | <2s |
| Latency (max) | 10 minutes | 3 seconds | <5s |
| Throughput | ~100 facts/10min | 50 facts/min | 50/min |
| API Costs | Batched (optimal) | Batched (optimal) | Minimize |
| Search Readiness | Delayed | Immediate | Immediate |

---

## Architecture Decision Records (ADRs)

### ADR-001: Why Periodic Sweep + Real-time Queue?

**Decision:** Implement both mechanisms
**Rationale:**
- Periodic sweep catches missed items (fault tolerance)
- Real-time queue provides low latency (user experience)
- Deduplication via `processedIds` Set prevents double-processing

### ADR-002: Why 300k Token Limit?

**Decision:** Batch by token count, not item count
**Rationale:**
- OpenAI has token-based pricing
- API has 300k token limit per request
- Variable-length facts require dynamic batching

### ADR-003: Why Rate Limit at 50 req/min?

**Decision:** Use PQueue with 1.2s interval
**Rationale:**
- OpenAI limit: 3,000 RPM for text-embedding-3-small
- Conservative 50 RPM prevents hitting limits during spikes
- Allows headroom for other services using same key

---

## Troubleshooting Guide

### Issue: Embeddings not generating after 10 minutes

**Check:**
1. Is background worker running? `docker ps | grep background-workers`
2. Are logs showing errors? `docker logs knowledgeplane-background-workers-1`
3. Is OPENAI_API_KEY set? Check `.env.dev`
4. Are worker_triggers being created? Query `worker_triggers` collection

### Issue: "Invalid API key" errors

**Fix:**
```bash
# Check key in background worker environment
docker exec knowledgeplane-background-workers-1 env | grep OPENAI_API_KEY

# If missing, add to docker-compose.yml or .env.dev
```

### Issue: Embeddings generated but search returns no results

**Check:**
1. Does search use correct workspace_id?
2. Are embeddings the correct dimension (1536 for text-embedding-3-small)?
3. Is query embedding being generated successfully?

```bash
# Verify embedding dimensions
curl -X POST http://localhost:8081/api/query \
  -d '{"query": "FOR f IN facts FILTER HAS(f, \"embedding\") RETURN LENGTH(f.embedding) LIMIT 1"}'
# Expected: [1536]
```

---

## Next Steps

1. **Immediate (Benchmarking):** Use manual trigger API to force embedding generation
2. **Short-term (1 day):** Implement real-time enqueue integration (Fixes 1-3)
3. **Medium-term (1 week):** Add monitoring/metrics for embedding generation
4. **Long-term (1 month):** Optimize batching strategy based on production metrics

---

**Document Version:** 1.0
**Last Updated:** 2026-02-14
**Status:** Current Architecture Analysis
