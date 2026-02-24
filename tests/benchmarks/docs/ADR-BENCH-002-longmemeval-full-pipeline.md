# ADR-BENCH-002: LongMemEval Full Pipeline Architecture

**Status:** Proposed
**Date:** 2026-02-20
**Author:** System Architecture Agent

## Context

The current LongMemEval benchmark (`tests/benchmarks/src/longmemeval.py`) only uses basic vector search via the REST API. KnowledgePlane has several advanced features that could significantly improve recall quality:

1. **CardConsolidator** (background worker) - Finds similar facts using embedding similarity + cross-encoder reranking, creates FactRelation edges
2. **Reranker** (port 8082) - BGE cross-encoder that filters false positives from embedding candidates
3. **FactRelations** - Graph edges connecting related facts (references, depends_on, causes, supports, etc.)
4. **Graph Traversal** - `getRelatedFacts()`, `getIncomingRelations()` for 1-hop expansion
5. **KnowledgeCards** - Consolidated summaries grouping related facts

### Constraints

- Benchmark runs in Docker container connecting to host services
- Background workers run on a 5-minute interval (too slow for per-question feedback)
- LongMemEval has 500 questions; we need fast iteration
- The benchmark ingests fresh sessions per question (namespace isolation)

### Current Flow (Vector-Only)

```
Question → Ingest Sessions → Vector Search → Generate Answer → Evaluate
                              (50-100ms)
```

### Target Flow (Full Pipeline)

```
Question → Ingest Sessions → [Consolidate] → Vector Search → Graph Expand → Rerank → Generate Answer → Evaluate
                              (sync/async)    (50ms)          (10ms)        (50ms)
```

## Decision

We propose a **hybrid architecture** with two modes:

### Mode 1: Synchronous Consolidation (For Benchmark Accuracy)

For accurate benchmarking of KP's full capabilities, trigger consolidation synchronously after ingestion.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INGESTION PHASE (per question)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Ingest Sessions as Facts (sync_embedding=True)                          │
│     └── Each session becomes 1 fact with session_id metadata                │
│                                                                              │
│  2. Trigger Synchronous Consolidation (NEW)                                  │
│     ├── POST /api/facts/consolidate-sync?workspace_id=X                     │
│     │                                                                        │
│     │   ┌─────────────────────────────────────────────────────────────┐     │
│     │   │  Consolidation Pipeline (200-500ms per batch of 20 facts)   │     │
│     │   ├─────────────────────────────────────────────────────────────┤     │
│     │   │                                                              │     │
│     │   │  a) Embedding Similarity Pre-filter                         │     │
│     │   │     └── cosine_similarity >= 0.30 → candidate pairs         │     │
│     │   │                                                              │     │
│     │   │  b) Cross-Encoder Reranking (port 8082)                     │     │
│     │   │     └── BGE-reranker-v2-m3, threshold >= 0.40               │     │
│     │   │                                                              │     │
│     │   │  c) LLM Relation Extraction (GPT-4o-mini)                   │     │
│     │   │     └── Entity extraction + CoT reasoning                   │     │
│     │   │     └── Confidence >= 0.70                                  │     │
│     │   │                                                              │     │
│     │   │  d) Create FactRelation Edges                               │     │
│     │   │     └── Types: references, depends_on, causes, supports...  │     │
│     │   │                                                              │     │
│     │   └─────────────────────────────────────────────────────────────┘     │
│     │                                                                        │
│     └── Returns: {relations_created: N, time_ms: X}                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          RETRIEVAL PHASE (per question)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  3. Initial Vector Search                                                    │
│     ├── POST /api/facts/search                                              │
│     │   └── query: question, k: 10 (over-fetch for graph expansion)        │
│     └── Returns: Top-10 facts by hybrid search score                        │
│                                                                              │
│  4. Graph Expansion (1-hop) (NEW)                                           │
│     ├── For each retrieved fact:                                            │
│     │   ├── GET /api/facts/{id}/relations (outgoing)                       │
│     │   └── GET /api/facts/{id}/incoming-relations (incoming)              │
│     │                                                                        │
│     ├── Collect unique related facts                                        │
│     └── Filter: only facts in same namespace (question scope)               │
│                                                                              │
│  5. Query-Aware Reranking (NEW)                                             │
│     ├── Combine: initial_results + graph_expanded_facts                     │
│     ├── Deduplicate by fact_id                                              │
│     │                                                                        │
│     ├── POST RERANKER:8082/rerank                                           │
│     │   └── pairs: [(question, fact.content) for each fact]                 │
│     │   └── threshold: 0.40                                                 │
│     │                                                                        │
│     └── Returns: Top-K reranked facts (k=5 default)                         │
│                                                                              │
│  6. Generate Answer (unchanged)                                              │
│     └── GPT-4o-mini with CoT prompting                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Mode 2: Pre-Computed Consolidation (For Speed)

For rapid iteration during development, pre-ingest all sessions once, run consolidation, then query.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SETUP PHASE (once per dataset)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Bulk Ingest All Sessions                                                 │
│     └── Ingest all LongMemEval sessions as facts (takes 5-10 min)           │
│                                                                              │
│  2. Wait for Background Consolidation                                        │
│     └── CardConsolidator runs every 5 min                                   │
│     └── Or: trigger manually via POST /api/worker-triggers                  │
│                                                                              │
│  3. Verify Relations Created                                                 │
│     └── Query: FOR r IN relations FILTER r.workspace_id == X RETURN COUNT   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    BENCHMARK PHASE (per question)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Same as Mode 1 Retrieval Phase, but skip ingestion/consolidation            │
│  (facts already exist with relations)                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Minimal Changes for Maximum Improvement

#### Phase 1: Add Graph Expansion to Query (Highest Impact)

1. **Modify `adapter.py`**: Add `query_with_graph_expansion()` method

```python
def query_with_graph_expansion(
    self,
    question: str,
    namespace: Optional[str] = None,
    initial_k: int = 10,
    final_k: int = 5,
    expansion_hops: int = 1,
) -> QueryResult:
    """
    Query with graph-based fact expansion.

    1. Get initial vector search results (over-fetch)
    2. Expand via graph traversal
    3. Rerank combined set
    4. Return top-K
    """
    # Step 1: Initial vector search
    initial_results = self.query(question, namespace, k=initial_k)

    # Step 2: Graph expansion
    expanded_facts = set()
    for fact in initial_results.results:
        relations = self.get_related_facts(fact.id)
        for rel in relations.relations:
            if self._in_namespace(rel.fact, namespace):
                expanded_facts.add(rel.fact.id)

    # Step 3: Fetch expanded facts
    all_facts = initial_results.results + self._fetch_facts(expanded_facts)

    # Step 4: Rerank against question
    reranked = self._rerank_for_query(question, all_facts)

    return QueryResult(results=reranked[:final_k])
```

2. **Add reranker client to adapter**:

```python
def _rerank_for_query(
    self,
    query: str,
    facts: List[FactResult],
    threshold: float = 0.3
) -> List[FactResult]:
    """Rerank facts against query using cross-encoder."""
    if not facts:
        return []

    pairs = [{"fact_a": query, "fact_b": f.content} for f in facts]

    response = requests.post(
        f"{self.reranker_url}/rerank",
        json={"pairs": pairs, "threshold": threshold}
    )

    if response.status_code != 200:
        return facts  # Fallback to original order

    results = response.json().get("results", [])

    # Sort by score, filter by threshold
    scored_facts = []
    for r in results:
        if r["keep"]:
            scored_facts.append((r["score"], facts[r["index"]]))

    scored_facts.sort(key=lambda x: x[0], reverse=True)
    return [f for _, f in scored_facts]
```

#### Phase 2: Add Synchronous Consolidation Endpoint (Medium Impact)

1. **Add REST API endpoint** in `apps/rest-api/src/server.ts`:

```typescript
app.post('/api/facts/consolidate-sync', async (req, res) => {
  const { workspace_id, fact_ids, timeout_ms = 5000 } = req.body;

  // Import consolidation logic from CardConsolidator
  const consolidator = new CardConsolidator();

  // Run consolidation for specific facts
  const result = await consolidator.consolidateFactsSync(
    workspace_id,
    fact_ids,
    { timeout_ms }
  );

  res.json({
    relations_created: result.relationsCreated,
    time_ms: result.timeMs,
  });
});
```

2. **Add sync consolidation to CardConsolidator**:

```typescript
async consolidateFactsSync(
  workspaceId: string,
  factIds: string[],
  options: { timeout_ms?: number } = {}
): Promise<{ relationsCreated: number; timeMs: number }> {
  const start = Date.now();

  // Fetch facts
  const facts = await Promise.all(
    factIds.map(id => Fact.findById(id))
  );

  // Run consolidation pipeline
  const relationsCreated = await this.createFactRelations(
    facts.filter(Boolean)
  );

  return {
    relationsCreated,
    timeMs: Date.now() - start,
  };
}
```

#### Phase 3: Update LongMemEval Benchmark (Integration)

1. **Modify `longmemeval.py`**:

```python
def run_benchmark_full_pipeline(
    adapter: KnowledgePlaneAdapter,
    questions: List[LongMemEvalQuestion],
    k: int = 5,
    use_graph_expansion: bool = True,
    use_sync_consolidation: bool = True,
    reranker_url: str = "http://localhost:8082",
) -> List[EvaluationResult]:
    """Run LongMemEval with full KP pipeline."""

    results = []

    for question in tqdm(questions, desc="Evaluating"):
        start_time = time.time()

        # 1. Ingest sessions
        session_to_fact = ingest_sessions_as_facts(adapter, question)

        # 2. Trigger synchronous consolidation (if enabled)
        if use_sync_consolidation:
            fact_ids = list(session_to_fact.values())
            adapter.trigger_consolidation_sync(fact_ids)

        # 3. Query with graph expansion (if enabled)
        if use_graph_expansion:
            query_result = adapter.query_with_graph_expansion(
                question.question,
                namespace=f"longmemeval_{question.question_id}",
                initial_k=10,
                final_k=k,
            )
        else:
            query_result = adapter.query(
                question.question,
                namespace=f"longmemeval_{question.question_id}",
                k=k,
            )

        # 4. Generate answer (unchanged)
        predicted_answer = generate_answer(adapter, question, query_result.results)

        # ... rest unchanged
```

## Expected Impact

### Performance Estimates

| Component | Latency | Impact on Recall |
|-----------|---------|------------------|
| Initial Vector Search | 50ms | Baseline |
| + Graph Expansion (1-hop) | +10ms | +5-15% recall (related context) |
| + Query Reranking | +50ms | +10-20% precision (filter false positives) |
| + Sync Consolidation | +200-500ms | +5-10% recall (better relations) |

### Total Expected Improvement

- **Without full pipeline**: ~60% accuracy (vector-only baseline)
- **With graph expansion + reranking**: ~70-75% accuracy
- **With sync consolidation**: ~75-80% accuracy

### Trade-offs

| Option | Pros | Cons |
|--------|------|------|
| Sync Consolidation | Accurate benchmark | Slower (500ms/question) |
| Pre-computed | Fast iteration | Stale relations, more setup |
| Graph Expansion Only | Fast, no extra deps | Misses some relations |

## Alternatives Considered

### Alternative 1: Full Async with Polling

Run consolidation async, poll for completion. Rejected because:
- Adds 5+ seconds latency per question
- Complex timeout/retry logic needed
- LongMemEval has 500 questions = 40+ minutes of waiting

### Alternative 2: Batch Pre-Consolidation

Ingest all sessions upfront, consolidate once. Rejected because:
- Different sessions per question need isolation
- Would require complex namespace management
- Doesn't match real-world usage patterns

### Alternative 3: Skip Consolidation, Graph-Only

Use existing relations from previous runs. Rejected because:
- Relations may be stale or missing
- Benchmark results not reproducible
- Doesn't test full KP capability

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Reranker service unavailable | Degraded results | Fallback to embedding scores |
| Consolidation timeout | Incomplete relations | Set timeout, continue with partial |
| Graph expansion explosion | High latency | Cap expansion to 50 facts |
| Docker network issues | Can't reach host services | Use host.docker.internal |

## Success Criteria

1. **Accuracy**: LongMemEval accuracy improves from ~60% to >70%
2. **Latency**: Full pipeline completes in <2s per question
3. **Reproducibility**: Same results on repeated runs (deterministic)
4. **Fallback**: Graceful degradation when components unavailable

## References

- `tests/benchmarks/src/longmemeval.py` - Current benchmark implementation
- `tests/benchmarks/src/relationrecall.py` - Reference for consolidation patterns
- `apps/background-workers/src/workers/card-consolidator.ts` - Consolidation logic
- `packages/db/src/models/FactRelation.ts` - Graph traversal API
- `apps/background-workers/src/services/reranker.py` - Cross-encoder service
