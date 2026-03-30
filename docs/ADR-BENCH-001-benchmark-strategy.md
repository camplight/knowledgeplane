# ADR-BENCH-001: Benchmark Strategy for KnowledgePlane

**Status:** Accepted
**Date:** 2026-02-16
**Context:** Swarm analysis revealed fundamental mismatches between current benchmarks and KP's architecture

## Problem

Current benchmarks (MS MARCO, HotpotQA) treat KnowledgePlane as a vector database, but KP is a knowledge graph system. This leads to:

1. **Testing the wrong capabilities** - Benchmarks measure vector retrieval, KP's strength is graph + freshness
2. **Unfair comparisons** - KP's O(n) JavaScript cosine similarity can't compete with HNSW at scale
3. **Unused features** - Graph traversal (`FactRelation.getRelatedFacts`) is never called in benchmarks
4. **Misleading results** - MS MARCO tests 10 passages per query, not 8.8M (sidesteps the real challenge)

## Architecture Analysis (Evidence)

### Gap 1: Vector Index Exists but Unused
```typescript
// packages/db/src/models/Fact.ts:380-381
// This approach works with any ArangoDB version and doesn't require APPROX_NEAR_COSINE
const allFacts = await cursor.all();  // Fetches ALL facts
resultsWithScores = allFacts.map(fact => cosineSimilarity(fact.embedding, queryEmbedding));
```
**Impact:** O(n) complexity vs O(log n) for HNSW. Will fail at scale.

### Gap 2: Fulltext Returns score=1.0 (No BM25)
```typescript
// packages/db/src/models/Fact.ts:294-300
RETURN { fact: fact, score: 1.0 }  // No relevance ranking
```
**Impact:** Hybrid search averaging is meaningless when fulltext is always 1.0.

### Gap 3: Graph Traversal Never Called
```typescript
// packages/db/src/models/FactRelation.ts:548-561 - EXISTS
static async getRelatedFacts(factId, relationType) { ... }

// tests/benchmarks/bench_hotpotqa.py - NEVER USED
grep "get_related_facts" bench_hotpotqa.py → No matches
```
**Impact:** KP's unique graph capability is untested.

### Gap 4: MS MARCO Tests 10 Passages, Not 8.8M
```python
# bench_msmarco.py - Per query, creates isolated namespace with ~10 passages
query_namespace = f"{namespace}_q{query_data['id']}"
self.ingest_kp_passages(passages, query_namespace)  # Only 10 passages
```
**Impact:** Completely sidesteps MS MARCO's core challenge (large-scale retrieval).

## Decision

### What KP Actually Is
| Designed For | Not Designed For |
|--------------|------------------|
| Knowledge graph with typed edges | Pure vector similarity at scale |
| Real-time fact updates (freshness) | Batch re-indexing workflows |
| Workspace isolation | Single massive corpus |
| 1-hop graph traversal | Web-scale retrieval |
| Hybrid search on bounded sets | Competing with HNSW/FAISS |

### Benchmark Strategy

**Principle:** Benchmark what KP does well. Be honest about limitations.

| Priority | Benchmark | Tests | Expected Result |
|----------|-----------|-------|-----------------|
| **1** | Freshness | Real-time searchability after update | KP wins (sync embeddings) |
| **2** | HotpotQA (n≤200) | Hybrid search quality | Competitive |
| **3** | MetaQA (future) | Explicit graph traversal | Would showcase graph IF implemented |
| **Skip** | MS MARCO at scale | O(n) can't compete | Designed to lose |
| **Skip** | BEIR zero-shot | Not KP's feature | No advantage |

### Phased Approach

**Phase 1: Validate What Works (No Core Changes)**
- Run Freshness benchmark with vector baseline comparison
- Run HotpotQA n=200 with retrieval metrics
- Document honest results

**Phase 2: Honest Documentation**
- Frame HotpotQA as "retrieval benchmark, not graph reasoning"
- Add MS MARCO only at small scale (n≤100) as "ranking sanity check"

**Phase 3: Future Graph Benchmarks (Separate PR)**
- MetaQA with explicit `get_related_facts` calls
- Requires adapter changes only, not core changes

## Consequences

### Positive
- Honest benchmark story we can defend
- Focus on KP's actual differentiators (freshness, graph structure)
- No core changes required for Phase 1-2
- Clear roadmap for future graph benchmarks

### Negative
- Can't claim "beats vector DBs at retrieval" (because it doesn't at scale)
- HotpotQA results show retrieval, not multi-hop reasoning
- Graph advantages remain theoretical until Phase 3

### The Honest Narrative

> "KnowledgePlane achieves competitive retrieval on small-to-medium knowledge bases while offering unique advantages in real-time fact updates and structured relationships. For applications requiring knowledge graphs with immediate searchability (rather than periodic re-indexing), KP provides a compelling alternative to traditional RAG pipelines."

## Alternatives Considered

1. **Scale MS MARCO to 8.8M** - Rejected: O(n) search would fail catastrophically
2. **Implement APPROX_NEAR_COSINE** - Out of scope: Core change, separate initiative
3. **Claim multi-hop reasoning** - Rejected: Graph traversal not used in queries
4. **Skip benchmarks entirely** - Rejected: Need evidence for value proposition

## References

- BEIR Benchmark: https://github.com/beir-cellar/beir
- MS MARCO: https://microsoft.github.io/msmarco/
- MetaQA: https://aclanthology.org/2020.acl-main.412/
- Swarm analysis: 2026-02-16 (5 agents, 400k+ tokens analyzed)
