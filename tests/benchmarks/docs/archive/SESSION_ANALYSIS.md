# Session Analysis: Benchmark Changes & Path Forward

**Date:** 2026-02-14
**Scope:** Benchmark system changes and second/third-order effects

---

## 1. What We Changed

### 1.1 Embeddings Generator (background-workers)
**File:** `/apps/background-workers/src/workers/embeddings-generator.ts`

**Change:** Line 395 - Fixed workspace ID usage
```typescript
// BEFORE: workspace.id might have been just the key
// AFTER: const workspaceId = workspace.id; // Full ID with "workspaces/" prefix
```

**Purpose:** Ensure facts are queried with correct workspace ID format (`workspaces/xxx` vs `xxx`)

**Impact:**
- ✅ **Positive:** Facts will now be correctly filtered by workspace
- ⚠️ **Risk:** If existing facts were stored with inconsistent workspace IDs, they might become invisible
- ⚠️ **Risk:** Background worker needs proper .env.dev with API keys to run

### 1.2 Benchmark Script (bench_hotpotqa.py)
**File:** `/tests/benchmarks/bench_hotpotqa.py`

**Changes:**
- Line 117-148: Added `mode` parameter (`cached` vs `timestamped`)
- Line 615-623: Namespace generation logic:
  - `cached` mode: `f"hotpotqa_validation_seed{self.seed}"` (deterministic)
  - `timestamped` mode: `f"hotpotqa_{int(time.time())}"` (unique per run)
- Line 647-665: Conditional ingestion with embedding trigger for cached mode
- Line 1307-1313: CLI argument `--mode` (default: `timestamped`)

**Purpose:**
- `cached` mode: Reuse embeddings across runs (fast iteration, skip embedding generation)
- `timestamped` mode: Fresh namespace every run (full pipeline benchmark)

**Impact:**
- ✅ **Positive:** Developers can iterate quickly with cached embeddings
- ✅ **Positive:** Production benchmarks use timestamped for accurate E2E timing
- ⚠️ **Risk:** Cached mode assumes embeddings exist - will fail on first run unless setup properly
- ⚠️ **Risk:** Stale data cleanup now conflicts with cached mode's assumption of persistent data

### 1.3 REST API Trigger Endpoint
**File:** `/tests/benchmarks/trigger_embeddings.ts` (standalone utility)

**What it does:**
- HTTP POST to `/rest/facts/trigger-embeddings`
- Triggers background worker to generate embeddings for a namespace

**Impact:**
- ✅ **Positive:** Benchmark can explicitly request embedding generation
- ⚠️ **Risk:** Requires REST API server to be running
- ⚠️ **Risk:** Requires background worker to be running and healthy
- ⚠️ **Risk:** No feedback on whether embeddings are actually generated (async operation)

### 1.4 Database Schema (db.ts)
**File:** `/packages/db/src/db.ts`

**Changes (attempted):**
- Lines 420-439: Vector index parameter adjustment for knowledge_cards
- Lines 703-746: Dynamic `nLists` calculation based on vector count
- Attempted to make vector indices more robust with empty collections

**Issues:**
- ⚠️ **Current blocker:** Vector index creation fails when collection has 0 vectors
- ⚠️ **ArangoDB requirement:** `nLists` must be ≤ number of vectors (can't have 16 clusters with 0 training points)
- ⚠️ **Fact model issue:** Relations collection schema validation may cause type mismatches

### 1.5 Fact Model (Fact.ts)
**File:** `/packages/db/src/models/Fact.ts`

**Changes:**
- Lines 81-98: Added debug logging for fact write operations
- Logs: content length, metadata keys, workspace_id

**Purpose:** Debug why fact ingestion might be failing

**Impact:**
- ✅ **Positive:** Visibility into what's being saved
- ⚠️ **Noise:** Verbose logging in production

---

## 2. Second/Third-Order Effects

### 2.1 Workspace ID Consistency
**Primary change:** Fixed workspace ID format in embeddings-generator.ts

**Second-order effects:**
1. **Existing facts may have inconsistent workspace IDs**
   - Some facts: `workspaces/abc123` (full ID)
   - Some facts: `abc123` (key only)
   - **Result:** Embedding worker might miss facts with inconsistent IDs

2. **Fact.list() and query filters**
   - All queries filter by `workspace_id`
   - If workspace_id format is inconsistent, queries will miss data
   - **Result:** "No facts found" even though data exists in DB

**Third-order effects:**
1. **Cached mode will appear empty**
   - Cached namespace assumes facts exist
   - If workspace_id filter misses facts, ingestion appears to have failed
   - **Result:** Benchmark fails with "no data" even though facts were ingested

2. **REST API queries fail**
   - REST API uses workspace_id from auth context
   - If format doesn't match stored facts, semantic search returns empty
   - **Result:** Users can't query their own data

### 2.2 Cached Mode vs Fresh Data
**Primary change:** Added cached/timestamped mode to benchmark

**Second-order effects:**
1. **Cached mode assumes embeddings exist**
   - Checks `_check_cached_data_exists()` (line 728-764)
   - If embeddings missing, re-ingests data
   - **Result:** First run of cached mode is slow (generates embeddings)

2. **Embedding generation is async**
   - `_trigger_embeddings()` fires HTTP request and returns immediately
   - `_wait_for_embeddings()` polls with 10-second intervals (timeout: 300s)
   - **Result:** Benchmark blocks for up to 5 minutes waiting for embeddings

**Third-order effects:**
1. **Background worker bottleneck**
   - Worker has throttled queue: 50 req/min (line 32-36 in embeddings-generator.ts)
   - Large benchmark (500 facts) would take 10+ minutes to process
   - **Result:** `_wait_for_embeddings()` times out, benchmark fails

2. **Stale data cleanup conflicts**
   - Cached mode wants persistent data
   - Previous plan was to cleanup old benchmark namespaces
   - **Result:** Cached mode would be constantly invalidated by cleanup

### 2.3 Vector Index Creation Timing
**Primary change:** Attempted to make vector index creation more robust

**Second-order effects:**
1. **Fresh database has no vectors yet**
   - Init runs before any facts are created
   - Vector index creation with `nLists=16` fails when collection is empty
   - **Result:** Database init fails, server won't start

2. **Index creation skipped on error**
   - Code catches errors and continues (line 740-745)
   - Vector index might not exist at all
   - **Result:** Semantic search silently falls back to full-text

**Third-order effects:**
1. **Benchmark accuracy compromised**
   - If vector index doesn't exist, vector search is disabled
   - Hybrid search becomes full-text only
   - **Result:** Benchmark doesn't actually test graph-native retrieval

2. **Performance metrics misleading**
   - Full-text search is faster than semantic search
   - If benchmarks run without vector index, KP appears faster than it should be
   - **Result:** False performance improvements in metrics

---

## 3. Current Blockers

### 3.1 Fresh Database Initialization
**Problem:** Server won't start on fresh database

**Root cause:**
1. `db.ts` init tries to create vector index with `nLists=16`
2. Collections are empty (no vectors yet)
3. ArangoDB rejects: "nLists cannot exceed number of vectors"

**Why it matters:**
- Developers can't run benchmarks locally without complex setup
- Docker containers fail to start
- CI/CD pipelines break

**Current workaround:** None - manually create workspace/user or patch db.ts

### 3.2 Background Worker Configuration
**Problem:** Worker needs .env.dev but benchmarks run in tests folder

**Root cause:**
1. Background worker reads `process.env.OPENAI_API_KEY`
2. Benchmark runs in `/tests/benchmarks/` (separate from `/apps/background-workers/`)
3. No mechanism to share environment variables

**Why it matters:**
- Cached mode triggers embedding worker
- Worker fails silently (no API key)
- Benchmark times out waiting for embeddings

**Current workaround:** Manual setup of .env.dev in background-workers folder

### 3.3 Fact Ingestion Untested
**Problem:** We don't know if facts are actually being saved

**Root cause:**
1. Added debug logging to Fact.write() but haven't run it
2. Workspace ID format issues might cause silent failures
3. Schema validation errors might reject documents

**Why it matters:**
- Benchmark might be testing empty database
- All queries return zero results
- False negatives in performance metrics

**Current workaround:** None - needs actual test run

---

## 4. Gradual Path to Working Benchmarks

### Step 1: Fix Database Initialization (Critical)
**Goal:** Server starts successfully on fresh database

**Actions:**
1. **Modify db.ts vector index creation** (lines 506-523, 606-625, 702-746)
   ```typescript
   // Skip vector index creation if collection is empty
   if (vectorCount === 0) {
     console.log("Skipping vector index creation (no vectors yet)");
     continue; // Index will be created later when embeddings are added
   }
   ```

2. **Add lazy vector index creation**
   - Create index when first embedding is added
   - Background worker checks if index exists before processing batch
   - Falls back to manual similarity if no index

3. **Test:**
   ```bash
   # Fresh database
   docker-compose down -v
   docker-compose up -d arango
   npm run dev:db-init  # Should succeed without errors
   ```

**Why this is minimal:**
- Only touches db.ts initialization code
- No changes to runtime queries or business logic
- Unblocks all downstream work

**Expected outcome:** Database initializes successfully, server starts

---

### Step 2: Create Test Workspace/User (Critical)
**Goal:** Benchmark can write facts to a real workspace

**Actions:**
1. **Create setup script** `/tests/benchmarks/scripts/setup_test_workspace.sh`
   ```bash
   #!/bin/bash
   # POST to /rest/auth/register
   # Create user: "benchmark-user"
   # Create workspace: "benchmark-workspace"
   # Output: workspace_id, user_id, api_key to .env
   ```

2. **Update benchmark to use these credentials**
   - Read from `.env` file in benchmarks folder
   - Fall back to defaults if not present

3. **Test:**
   ```bash
   cd tests/benchmarks
   ./scripts/setup_test_workspace.sh
   python bench_hotpotqa.py --n 5 --mock_kp false --run_vector false --mode timestamped
   ```

**Why this is minimal:**
- Shell script + environment variables
- No code changes to KP system
- Can be documented in QUICKSTART.md

**Expected outcome:** Facts are successfully ingested to database

---

### Step 3: Test Fact Ingestion (Validation)
**Goal:** Confirm facts are saved with correct workspace_id format

**Actions:**
1. **Add verification query after ingestion**
   ```python
   # In bench_hotpotqa.py after ingest_kp_documents()
   result = self.kp_adapter.query(
       query="*",  # Wildcard to match all
       namespace=namespace,
       k=10
   )
   logger.info(f"Verification: Found {len(result.results)} facts in namespace {namespace}")
   if len(result.results) == 0:
       logger.error("FATAL: Ingestion claimed success but no facts found!")
   ```

2. **Add debug endpoint in REST API**
   ```typescript
   // GET /rest/debug/workspace/:id/facts
   // Returns: count of facts, sample of workspace_ids, sample of embeddings
   ```

3. **Test:**
   ```bash
   python bench_hotpotqa.py --n 5 --mode timestamped
   # Check logs for verification output
   curl http://localhost:8080/rest/debug/workspace/xxx/facts
   ```

**Why this is minimal:**
- Debug logging + simple HTTP endpoint
- No changes to production code paths
- Easy to remove once validated

**Expected outcome:** Facts are found after ingestion, workspace_id format is consistent

---

### Step 4: Validate Embedding Generation (Partial)
**Goal:** Confirm background worker can generate embeddings for small dataset

**Actions:**
1. **Test worker in isolation**
   ```bash
   cd apps/background-workers
   cp .env.example .env.dev
   # Add OPENAI_API_KEY=sk-...
   npm run dev
   # Should see: "Embeddings generator started"
   ```

2. **Manually trigger for test namespace**
   ```bash
   cd tests/benchmarks
   node trigger_embeddings.ts hotpotqa_test_namespace
   # Watch worker logs for processing
   ```

3. **Verify embeddings exist**
   ```bash
   # Query ArangoDB directly
   # Count facts where embedding != null in namespace
   ```

**Why this is minimal:**
- Tests worker independently before integrating with benchmark
- Can debug API key / rate limit issues in isolation
- Validates async flow works at all

**Expected outcome:** Embeddings are generated for test namespace within 5 minutes

---

### Step 5: Run First Successful Benchmark (Milestone)
**Goal:** Complete end-to-end benchmark with real results

**Actions:**
1. **Use timestamped mode with small sample**
   ```bash
   cd tests/benchmarks
   python bench_hotpotqa.py \
       --n 10 \
       --mode timestamped \
       --run_vector false \
       --mock_kp false
   ```

2. **Monitor each stage:**
   - ✅ Dataset loaded
   - ✅ Documents prepared
   - ✅ Facts ingested
   - ✅ Embeddings triggered
   - ✅ Embeddings ready (wait up to 5 min)
   - ✅ Queries executed
   - ✅ Results saved

3. **Inspect output:**
   ```bash
   cat output/hotpotqa_results.csv
   cat output/hotpotqa_summary.json
   ```

**Why this is the milestone:**
- Proves entire pipeline works
- Small sample (n=10) minimizes embedding generation time
- timestamped mode avoids cached data assumptions
- Single system (KP only) reduces complexity

**Expected outcome:** CSV/JSON files with non-zero F1 scores

---

## 5. Safety Checks Before Each Step

### Before Step 1 (db.ts changes):
- ✅ Backup current db.ts
- ✅ Test on fresh Docker container (not production)
- ✅ Verify existing workspaces still work after change

### Before Step 2 (workspace setup):
- ✅ Document exact API endpoints used
- ✅ Test script doesn't delete existing data
- ✅ Credentials are written to .env (not committed)

### Before Step 3 (validation):
- ✅ Debug endpoints are read-only
- ✅ Verification queries don't modify data
- ✅ Logs don't expose sensitive info

### Before Step 4 (worker test):
- ✅ Worker .env.dev is gitignored
- ✅ API key has spending limits
- ✅ Test namespace is isolated (won't pollute production)

### Before Step 5 (benchmark):
- ✅ timestamped mode is used (not cached)
- ✅ n=10 (small sample to avoid high costs)
- ✅ Output folder is writable
- ✅ All previous steps completed successfully

---

## 6. Risks & Mitigation

### Risk: Vector index changes break existing queries
**Mitigation:**
- Test queries before/after index changes
- Graceful fallback if index doesn't exist (already implemented in Fact.ts)

### Risk: Embedding generation timeout
**Mitigation:**
- Start with n=5 or n=10 (minimal sample)
- Increase `timeout` in `_wait_for_embeddings()` from 300s to 600s
- Monitor worker logs during wait

### Risk: Workspace ID format breaks existing data
**Mitigation:**
- Run migration script to normalize all workspace_id fields
- Or: Update queries to handle both formats (add OR clause)

### Risk: Background worker consumes all OpenAI credits
**Mitigation:**
- Set OpenAI usage limits in dashboard
- Use small test samples first
- Monitor costs during development

---

## 7. Success Criteria

### Minimum Viable Benchmark Run:
- ✅ Server starts on fresh database
- ✅ Workspace/user created via script
- ✅ 10 facts ingested to namespace
- ✅ Facts found via query after ingestion
- ✅ Embeddings generated within 5 minutes
- ✅ Queries return non-empty results
- ✅ CSV/JSON output files created
- ✅ F1 scores > 0.0 (not just errors)

### Stretch Goal (not required for first success):
- Cached mode works
- Vector baseline comparison
- Statistical analysis
- Large sample (n=100+)

---

## 8. Recommended Execution Order

1. **Today:** Fix db.ts vector index creation (Step 1)
2. **Today:** Create workspace setup script (Step 2)
3. **Today:** Test fact ingestion with verification (Step 3)
4. **Tomorrow:** Test background worker in isolation (Step 4)
5. **Tomorrow:** Run first successful benchmark (Step 5)

**Total estimated time:** 4-6 hours over 2 days

**Key principle:** Each step validates the previous one before moving forward. No speculative fixes without confirmation.
