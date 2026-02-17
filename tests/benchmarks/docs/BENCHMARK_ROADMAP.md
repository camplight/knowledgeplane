# KnowledgePlane Benchmark Roadmap

**Last Updated:** 2026-02-17
**Status:** Active
**Related:** [ADR-BENCH-001](../../../docs/ADR-BENCH-001-benchmark-strategy.md)

## Executive Summary

KnowledgePlane is **knowledge infrastructure for AI** — not a memory layer for chatbots. Our benchmarks must prove this positioning against Mem0, Zep, and pure vector stores.

### Positioning Statement
> "KnowledgePlane is knowledge infrastructure for AI systems that need to reason about structured facts — not just remember conversations."

### Key Differentiators to Benchmark

| Differentiator | Competitor Gap | Benchmark |
|----------------|----------------|-----------|
| **Real-time CRUD** | Mem0/Zep optimize reads | Freshness |
| **Graph traversal** | Pure vector can't do hops | MetaQA / GraphHop |
| **Multi-tenant isolation** | Managed services are opaque | Concurrent workspace ops |
| **Webhook triggers** | No competitors offer this | Event delivery latency |
| **Temporal queries** | Zep claims this, test it | LongMemEval subset |

---

## Competitive Landscape

| System | Focus | Strength | KP Advantage |
|--------|-------|----------|--------------|
| **Mem0** | Personalization | 26% better on LoCoMo | We have graph traversal they lack |
| **Zep/Graphiti** | Temporal KG | 18.5% better on LongMemEval | We have sync embeddings, webhooks |
| **LangChain Memory** | Prototyping | Easy integration | We scale, they don't |
| **Pinecone/Weaviate** | Vector search | Sub-ms retrieval | We have graph + vector hybrid |

---

## Phase 1: Validate Current Advantages (DONE)

### 1.1 Freshness Benchmark ✅ COMPLETE
**What it proves:** Real-time write-to-searchable latency

**Results (2026-02-17, n=50):**
| Metric | KnowledgePlane | FAISS Incremental | FAISS Rebuild |
|--------|----------------|-------------------|---------------|
| Mean | 0.88s | 0.54s | 13.4s |
| Success | 100% | 100% | 100% |

**Why it matters:** KP sync embeddings beat batch re-indexing by 25x

### 1.2 MS MARCO Retrieval ✅ COMPLETE
**What it proves:** Hybrid search quality on passage ranking

**Results (2026-02-16, n=100):**
| Metric | KP | Vector Baseline | Delta |
|--------|-----|-----------------|-------|
| MRR | 0.319 | 0.311 | +2.6% |
| Recall@10 | 0.65 | 0.65 | 0% |
| NDCG@10 | 0.398 | 0.390 | +1.8% |

**Why it matters:** Validates hybrid search is competitive

---

## Phase 2: Prove Graph Advantage (HIGH PRIORITY)

### 2.1 HotpotQA Supporting Facts ⚠️ NEEDS FIX
**Current state:** Measures answer EM/F1 (wrong for retrieval system)
**Fix:** Measure Supporting Facts F1 (did we find the right evidence?)

**Action items:**
- [ ] Change metric from answer EM to supporting facts F1
- [ ] Test retrieval of evidence sentences, not answer generation
- [ ] Compare: KP hybrid vs FAISS vector-only

### 2.2 MetaQA Multi-Hop 🆕 NEW
**What it proves:** Graph traversal beats vector similarity for relationship questions

**Design:**
- Use `FactRelation.getRelatedFacts()` for explicit edge traversal
- Test 1-hop, 2-hop, 3-hop accuracy separately
- Compare: KP graph traversal vs pure vector retrieval

**Why it matters:** This is KP's unique capability that Mem0/FAISS cannot replicate

**Action items:**
- [ ] Create `bench_metaqa.py`
- [ ] Seed test data with explicit relations
- [ ] Implement graph traversal in kp_adapter
- [ ] Run n=200 benchmark

### 2.3 Temporal Queries 🆕 NEW
**What it proves:** Timestamp-aware retrieval

**Test cases:**
- "What changed since [date]?"
- "Latest fact about [topic]"
- "Facts created before [date] updated after [date]"

**Why it matters:** Zep claims temporal reasoning advantage, we should match/beat

---

## Phase 3: Competitive Benchmarks (MEDIUM PRIORITY)

### 3.1 LoCoMo Subset
**What it proves:** Long-term memory retrieval (Mem0's flagship benchmark)

**Scope:** Single-session QA + multi-session reasoning (skip multi-modal)

**Target:** Match or beat Mem0's 66.9% on subset

**Why partial:** LoCoMo tests conversational memory; KP is knowledge infrastructure

### 3.2 LongMemEval Subset
**What it proves:** Temporal reasoning, knowledge updates (Zep's benchmark)

**Scope:** Temporal reasoning + knowledge update consistency

**Target:** Match or beat Zep's 18.5% improvement claim

---

## Phase 4: Unique Differentiation (LOWER PRIORITY)

### 4.1 Webhook Delivery Latency
**What it proves:** Event-driven architecture (no competitors have this)

**Metric:** Time from fact write to webhook delivery

**Target:** <50ms

### 4.2 Multi-Tenant Throughput
**What it proves:** Enterprise isolation at scale

**Metric:** Concurrent workspace operations, zero cross-tenant leakage

---

## Benchmark Decisions

### Skip: RAGAS
**Why:**
- RAGAS requires LLM answer generation (KP is retrieval-only)
- 2/4 RAGAS metrics (faithfulness, answer_relevancy) don't apply
- Current metrics (MRR, NDCG, Recall@k) already cover context precision/recall
- RAGAS adds LLM cost overhead with no additional signal

**Alternative:** Continue with industry-standard IR metrics (BEIR, MTEB patterns)

### Skip: HotpotQA Answer Metrics
**Why:**
- KP doesn't generate answers
- Measuring EM/F1 on answers is meaningless for retrieval

**Alternative:** Measure Supporting Facts F1 (retrieval quality for evidence)

### Consider: LiveSearchBench
**Why:**
- Auto-generates questions from Wikidata deltas
- Tests real-time knowledge freshness
- Aligns with KP's freshness claims

**Status:** Research complete, implementation TBD

---

## Architecture Constraints (Reality Check)

| Constraint | Implication | Benchmark Impact |
|------------|-------------|------------------|
| O(n) fallback vector search | Don't test large-scale vector | Keep n<500 for MS MARCO |
| ArangoSearch BM25 | Full-text works, not SPLADE | Don't benchmark neural ranking |
| Sync embeddings = API latency | Freshness limited by OpenAI | Test with mock for pure KP speed |
| Graph traversal = extra queries | Multi-hop adds latency | Measure hops vs accuracy tradeoff |

---

## Commands

```bash
cd tests/benchmarks

# Preflight (run first!)
./scripts/preflight.sh --fix

# Current benchmarks
docker compose --profile freshness-batch up   # Freshness (proven win)
docker compose --profile validation up        # HotpotQA (needs fix)
docker compose --profile msmarco up           # MS MARCO (done)

# Future benchmarks
python bench_metaqa.py --n 200                # Multi-hop (Phase 2)
python bench_temporal.py --n 100              # Temporal (Phase 2)
```

---

## Research Sources

### Competitive Intelligence
- [Mem0 Research - 26% LoCoMo improvement](https://mem0.ai/research)
- [Zep Paper - Temporal Knowledge Graph](https://arxiv.org/abs/2501.13956)
- [Graphiti GitHub](https://github.com/getzep/graphiti)
- [Survey of AI Agent Memory Frameworks](https://www.graphlit.com/blog/survey-of-ai-agent-memory-frameworks)

### Benchmark References
- [LoCoMo Benchmark](https://snap-research.github.io/locomo/)
- [LongMemEval](https://arxiv.org/abs/2410.10813)
- [LiveSearchBench](https://arxiv.org/html/2511.01409v1)
- [RAGAS Framework](https://docs.ragas.io/) (not recommended for KP)

### Positioning References
- [Knowledge Graph vs Vector Database](https://www.falkordb.com/blog/knowledge-graph-vs-vector-database/)
- [Multi-Tenant AI Architecture](https://hypermode.com/blog/multi-tenant-ai-applications)
- [Event-Driven AI Agents](https://xebia.com/blog/beyond-rag-ai-agents-with-a-real-time-context/)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-17 | Major update: Competitive research, RAGAS decision, graph benchmark plan |
| 2026-02-16 | Complete rewrite based on swarm architecture analysis |
| 2026-02-16 | Added retrieval metrics (Recall@k, MRR) to HotpotQA |
