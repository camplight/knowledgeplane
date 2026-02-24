# LongMemEval Benchmark Improvement Plan

## Executive Summary

**Current State**: 30% accuracy with 93% Recall@5 (retrieval works, synthesis fails)
**Target State**: 70%+ accuracy by leveraging KnowledgePlane's full pipeline
**Key Insight**: The pipeline is "retrieve facts, generate answer" but should be "retrieve facts, build knowledge graph, traverse graph, generate answer"

---

## Problem Analysis

### What's Working (93% Recall@5)
- Vector/hybrid search finds relevant session facts
- Fact ingestion correctly preserves session metadata
- Namespace isolation per question works

### What's Failing (0% IE, 30% Overall)
1. **No Relation Creation**: Facts are ingested but CardConsolidator isn't creating relations between conversation turns
2. **No Graph Traversal**: Query uses flat fact search, not graph-enhanced retrieval
3. **Poor Answer Synthesis**: GPT-4o-mini receives disconnected facts without relationship context
4. **Missing Temporal Context**: Session dates aren't being used for temporal reasoning (TR)

---

## Root Cause Deep Dive

### Why Relations Aren't Being Created

Looking at `card-consolidator.ts`, the consolidation requires:
1. Facts with embeddings (checked via `embedding_model`)
2. Similarity threshold >= 0.30
3. Processing happens every 5 minutes OR on trigger

**Issue**: LongMemEval runs too fast - facts are ingested, queried, and evaluated before:
- Embeddings are generated (async worker)
- CardConsolidator runs
- Relations are created

### Why Answers Fail

The current `generate_answer()` in `longmemeval.py`:
1. Receives flat list of facts
2. Builds context as simple concatenation
3. Uses GPT-4o-mini with CoT prompt
4. No relationship information provided

**Issue**: Without graph context, the LLM can't distinguish:
- Which sessions relate to each other
- What temporal order events occurred in
- Which facts contradict/update others (for KU questions)

---

## Implementation Plan

### Phase 1: Synchronous Pipeline Integration (Primary Fix)

**Goal**: Ensure facts have embeddings and relations before query

#### 1.1 Add Synchronous Consolidation Endpoint

**File**: `apps/rest-api/src/routes/facts.ts`

Add a new endpoint that:
1. Ingests facts with `sync_embedding=true` (already exists)
2. Triggers CardConsolidator synchronously
3. Returns when relations are created

```typescript
// POST /api/facts/batch-with-consolidation
// - Accepts array of facts
// - Generates embeddings synchronously
// - Runs mini-consolidation on the batch
// - Returns fact_ids + relation_ids
```

**Estimated Time**: 2-3 hours

#### 1.2 Add Mini-Consolidator Function

**File**: `packages/db/src/lib/mini-consolidator.ts`

Extract core relation logic from CardConsolidator for synchronous use:

```typescript
export async function consolidateFacts(factIds: string[]): Promise<{
  relations: RelationRecord[];
  elapsed_ms: number;
}> {
  // 1. Fetch facts with embeddings
  // 2. Find similar pairs (embedding similarity >= 0.30)
  // 3. Rerank with cross-encoder if available
  // 4. Identify relations with AI
  // 5. Create relation records
  // 6. Return created relations
}
```

**Estimated Time**: 3-4 hours

#### 1.3 Update LongMemEval Adapter

**File**: `tests/benchmarks/src/lib/adapter.py`

Add method:

```python
def ingest_with_consolidation(
    self,
    documents: List[Dict],
    namespace: str,
    wait_for_relations: bool = True
) -> ConsolidatedIngestionResult:
    """
    Ingest documents and ensure relations are created.

    1. POST /api/facts/batch-with-consolidation
    2. Wait for response (includes relation_ids)
    3. Return structured result
    """
```

**Estimated Time**: 1-2 hours

---

### Phase 2: Graph-Enhanced Query (Secondary Fix)

**Goal**: Use relations in query context

#### 2.1 Add Graph Traversal to Search

**File**: `packages/db/src/models/Fact.ts`

Add method to expand search results using graph:

```typescript
static async searchWithGraph(params: {
  query: string;
  workspace_id: string;
  k: number;
  graph_depth: number; // 1-2 hops
  include_relations: boolean;
}): Promise<GraphEnhancedSearchResult> {
  // 1. Standard vector search for top-k facts
  // 2. For each fact, traverse relations (outgoing + incoming)
  // 3. Include related facts in results
  // 4. Return with relationship metadata
}
```

**Estimated Time**: 3-4 hours

#### 2.2 Add Graph Search API Endpoint

**File**: `apps/rest-api/src/routes/facts.ts`

```typescript
// POST /api/facts/search-graph
// - query: string
// - k: number (default 5)
// - graph_depth: number (default 1)
// - include_relation_types: string[] (optional filter)
```

**Estimated Time**: 1-2 hours

#### 2.3 Update Adapter Query Method

**File**: `tests/benchmarks/src/lib/adapter.py`

```python
def query_with_graph(
    self,
    question: str,
    namespace: str,
    k: int = 5,
    graph_depth: int = 1
) -> GraphQueryResult:
    """
    Query with graph expansion.

    Returns facts plus their relationships.
    """
```

**Estimated Time**: 1-2 hours

---

### Phase 3: Improved Answer Synthesis (Tertiary Fix)

**Goal**: Better prompt with relationship context

#### 3.1 Graph-Aware Answer Generation

**File**: `tests/benchmarks/src/longmemeval.py`

Update `generate_answer()`:

```python
def generate_answer(
    adapter: KnowledgePlaneAdapter,
    question: LongMemEvalQuestion,
    graph_result: GraphQueryResult,
) -> str:
    """
    Generate answer using graph context.

    Context includes:
    - Session facts with relationship annotations
    - Explicit temporal ordering
    - Contradiction/update markers (for KU questions)
    """

    # Build structured context
    context = build_graph_context(graph_result)

    # Enhanced prompt with relationship hints
    prompt = f"""You are answering questions about a user's conversation history.

## Knowledge Graph Context

### Sessions and Their Relationships
{context.session_graph}

### Key Relationships Discovered
{context.relationships}

### Temporal Order
{context.temporal_order}

## Question
{question.question}

Based on the knowledge graph above, provide a direct answer.
For temporal questions, consider the session dates.
For update questions, prioritize the most recent information.
"""
```

**Estimated Time**: 2-3 hours

#### 3.2 Ability-Specific Prompts

Different prompts for different question types:

| Ability | Key Strategy |
|---------|--------------|
| IE (Information Extraction) | Focus on "references" and "supports" relations |
| MR (Multi-Session) | Include all related sessions via graph traversal |
| TR (Temporal Reasoning) | Sort by date, highlight temporal relations |
| KU (Knowledge Update) | Find "contradicts" relations, prefer newer facts |
| ABS (Abstention) | If no strong relations, return "I don't know" |

**Estimated Time**: 2-3 hours

---

### Phase 4: Benchmark Integration

**Goal**: Make changes work via `./bench longmemeval`

#### 4.1 Update LongMemEval Runner

**File**: `tests/benchmarks/src/longmemeval.py`

```python
def run_benchmark(
    adapter: KnowledgePlaneAdapter,
    questions: List[LongMemEvalQuestion],
    k: int = 5,
    use_consolidation: bool = True,  # NEW
    use_graph_query: bool = True,    # NEW
    graph_depth: int = 1,            # NEW
) -> List[EvaluationResult]:
    for question in questions:
        # Phase 1: Ingest with consolidation
        if use_consolidation:
            result = adapter.ingest_with_consolidation(
                documents=session_docs,
                namespace=namespace,
            )
        else:
            # Original path
            result = adapter.ingest_documents(...)

        # Phase 2: Query with graph
        if use_graph_query:
            query_result = adapter.query_with_graph(
                question=question.question,
                namespace=namespace,
                k=k,
                graph_depth=graph_depth,
            )
        else:
            query_result = adapter.query(...)

        # Phase 3: Graph-aware answer generation
        predicted = generate_answer(adapter, question, query_result)
```

**Estimated Time**: 1-2 hours

#### 4.2 Add CLI Options

**File**: `tests/benchmarks/bench`

```bash
# Add to run_longmemeval()
EXTRA_FLAGS=""
if [ "$USE_CONSOLIDATION" = true ]; then
    EXTRA_FLAGS+=" --use-consolidation"
fi
if [ "$USE_GRAPH_QUERY" = true ]; then
    EXTRA_FLAGS+=" --use-graph"
fi

run_docker longmemeval --n "$n" --setting "$setting" $EXTRA_FLAGS
```

**Estimated Time**: 30 minutes

---

## Files to Modify

### Core Implementation (Priority 1)

| File | Changes | LOC Estimate |
|------|---------|--------------|
| `apps/rest-api/src/routes/facts.ts` | Add batch-with-consolidation endpoint | +100 |
| `packages/db/src/lib/mini-consolidator.ts` | New file: synchronous consolidation | +200 |
| `packages/db/src/models/Fact.ts` | Add `searchWithGraph()` method | +80 |
| `tests/benchmarks/src/lib/adapter.py` | Add new methods | +100 |

### Benchmark Updates (Priority 2)

| File | Changes | LOC Estimate |
|------|---------|--------------|
| `tests/benchmarks/src/longmemeval.py` | Update pipeline | +150 |
| `tests/benchmarks/bench` | Add CLI flags | +20 |

### Tests (Priority 3)

| File | Changes | LOC Estimate |
|------|---------|--------------|
| `tests/benchmarks/tests/test_longmemeval.py` | New test file | +100 |

---

## Test Strategy

### Unit Tests

1. **Mini-Consolidator Tests**
   - `test_similar_pairs_found`: Given 2 related facts, verify pair detection
   - `test_relations_created`: Verify correct relation types
   - `test_no_false_positives`: Verify unrelated facts don't get linked

2. **Graph Search Tests**
   - `test_1_hop_expansion`: Verify related facts are included
   - `test_2_hop_expansion`: Verify transitive relations work
   - `test_relation_type_filter`: Verify filtering by type works

### Integration Tests

```bash
# Run with mock data (fast, no server)
./bench longmemeval --setting oracle --mock -n 5

# Run with real server (full integration)
./bench longmemeval --setting oracle -n 20 --use-consolidation --use-graph
```

### Regression Tests

```bash
# Compare old vs new pipeline
./bench longmemeval --setting oracle -n 50 --no-consolidation  # Baseline
./bench longmemeval --setting oracle -n 50 --use-consolidation  # New

# Output comparison in runs/<timestamp>/comparison.json
```

---

## Expected Accuracy Improvements

### By Phase

| Phase | Component | Expected Gain | Cumulative |
|-------|-----------|---------------|------------|
| Baseline | Current state | - | 30% |
| Phase 1 | Sync consolidation | +10-15% | 40-45% |
| Phase 2 | Graph-enhanced query | +10-15% | 50-60% |
| Phase 3 | Better synthesis | +10-15% | 60-75% |

### By Ability

| Ability | Current | Expected After |
|---------|---------|----------------|
| IE (Information Extraction) | 0% | 65-75% |
| MR (Multi-Session) | 35% | 70-80% |
| TR (Temporal Reasoning) | 40% | 60-70% |
| KU (Knowledge Updates) | 30% | 65-75% |
| ABS (Abstention) | 50% | 70-80% |

---

## Constraints & Considerations

### Time Constraints

**Target**: Complete within 5 minutes per question
- Current: ~2-3s per question (too fast, no consolidation)
- With sync consolidation: ~5-10s per question
- With graph query: +1-2s per question
- **Total estimated**: 7-12s per question (acceptable)

### Docker Compatibility

All changes must work within Docker:
- Mini-consolidator runs inside REST API container
- No new containers required
- Environment variables respected (RERANKER_URL, etc.)

### Backward Compatibility

- New endpoints are additive (no breaking changes)
- CLI flags are optional with sensible defaults
- Existing benchmarks continue to work

---

## Implementation Order

### Week 1: Foundation

1. Create `mini-consolidator.ts` (4h)
2. Add `/api/facts/batch-with-consolidation` (3h)
3. Update adapter.py with new methods (2h)
4. Basic integration test (1h)

### Week 2: Graph Query

1. Add `searchWithGraph()` to Fact model (4h)
2. Add `/api/facts/search-graph` endpoint (2h)
3. Update adapter query methods (2h)
4. Graph search tests (2h)

### Week 3: Synthesis & Polish

1. Update `generate_answer()` with graph context (3h)
2. Ability-specific prompts (2h)
3. Full benchmark run & tuning (4h)
4. Documentation & cleanup (1h)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sync consolidation too slow | Benchmark timeout | Add timeout, fall back to async |
| Graph traversal returns too many facts | Context overflow | Limit depth, filter by score |
| Relation quality varies | Lower accuracy | Tune thresholds, add verification |
| Cross-encoder unavailable | Fall back to embedding-only | Already handled in consolidator |

---

## Success Criteria

### Minimum Viable (MVP)

- [ ] Accuracy >= 50% on oracle setting
- [ ] IE ability > 40%
- [ ] Full run completes in < 5 minutes (n=50)

### Target

- [ ] Accuracy >= 70% on oracle setting
- [ ] All abilities > 50%
- [ ] Competitive with Zep (71.2%)

### Stretch

- [ ] Accuracy >= 80% on oracle setting
- [ ] Beat Supermemory (81.6%)
- [ ] Working on S setting (115K tokens)

---

## Appendix: Reference Implementation Patterns

### From relationrecall.py (Consolidation Pattern)

```python
# Wait for consolidation
def wait_for_consolidation(self, namespace: str) -> bool:
    start_time = time.time()
    while time.time() - start_time < self.consolidation_timeout:
        relations = self._get_relations_for_facts(benchmark_fact_ids)
        if len(relations) > 0:
            return True
        time.sleep(self.consolidation_poll_interval)
    return False
```

### From card-consolidator.ts (Relation Creation)

```typescript
// Key relation types
const VALID_RELATION_TYPES = [
  "references",
  "depends_on",
  "related_to",
  "part_of",
  "causes",
  "enables",
  "contradicts",
  "supports",
];
```

### From FactRelation.ts (Graph Traversal)

```typescript
// 1-hop outgoing traversal
static async getRelatedFacts(factId: string): Promise<RelatedFact[]> {
  const aql = `
    FOR relation IN relations
      FILTER relation._from == @factId
      FILTER relation.deleted_at == null
      LET fact = DOCUMENT(relation._to)
      RETURN { relation, fact }
  `;
}
```
