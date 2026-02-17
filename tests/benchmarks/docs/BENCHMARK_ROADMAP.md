# KnowledgePlane Benchmark Roadmap

**Last Updated:** 2026-02-17
**Status:** Active
**Related:** [ADR-BENCH-001](../../../docs/ADR-BENCH-001-benchmark-strategy.md)

## Executive Summary

KnowledgePlane is **knowledge infrastructure for AI** — not a memory layer for chatbots. Our benchmarks must prove this positioning against Mem0, Zep, and pure vector stores.

### The Core Insight

> **"Competitors optimize for 'memory retrieval' while KnowledgePlane optimizes for 'knowledge organization.' Benchmarks must reflect this distinction."**

### Positioning Statement
> "KnowledgePlane is knowledge infrastructure for AI systems that need to reason about structured facts — not just remember conversations."

### The AI Librarian (Primary UVP)

KnowledgePlane's **CardConsolidator** ("AI Librarian") runs every 5 minutes and:
1. **Auto-discovers relations** between facts using GPT-4o
2. **Creates graph edges** (FactRelations) with typed relationships
3. **Consolidates clusters** into KnowledgeCards with title/summary/content

**No competitor does this automatically.**

| Capability | KnowledgePlane | Mem0 | Zep |
|------------|----------------|------|-----|
| Auto-create relations | ✅ AI librarian | ❌ "No link between Munich and Germany" | ❌ Requires manual edges |
| Consolidate into cards | ✅ KnowledgeCards | ❌ Raw memories only | ❌ Raw memories only |
| Multi-hop traversal | ✅ `getRelatedFacts()` | ❌ No graph | ⚠️ Limited |
| Real-time webhooks | ✅ <100ms | ❌ Batch | ❌ Batch |

---

## Benchmark Philosophy

| Layer | What to Test | Benchmark |
|-------|--------------|-----------|
| **Retrieval** (table stakes) | Can we find relevant facts fast? | HotpotQA SF-F1, MS MARCO |
| **Organization** (differentiator) | Does the librarian create correct structure? | RelationRecall, ConsoliMem |
| **Real-time** (differentiator) | How fast are updates searchable? | Freshness, CRUD-Latency |

---

## Competitive Landscape

| System | Focus | Their Benchmark | KP Advantage |
|--------|-------|-----------------|--------------|
| **Mem0** | Personalization | 66.9% on LoCoMo | We auto-create relations (they find 0%) |
| **Zep/Graphiti** | Temporal KG | 18.5% on LongMemEval | We consolidate + have webhooks |
| **Cognee** | Hybrid graph+vector | 0.93 on HotPotQA | We have KnowledgeCards |
| **Pinecone/Weaviate** | Vector search | Sub-ms retrieval | We have graph + vector hybrid |

**Key finding:** Mem0's evaluation shows "no link between Munich and Germany, even though it's directly stated in the input" — their system cannot auto-discover relations.

---

## Phase 1: Validate Retrieval Layer (DONE)

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

**Why it matters:** Validates hybrid search is competitive (table stakes)

---

## Phase 2: Prove AI Librarian Value (HIGHEST PRIORITY)

### 2.1 RelationRecall@k 🆕 NEW — PRIMARY DIFFERENTIATOR
**What it proves:** Does the AI librarian auto-discover the correct relations?

**Design:**
```
Input: 100 facts with known implicit relations (from Wikipedia/Wikidata)
Process: Run CardConsolidator on facts
Measure: How many ground-truth relations were auto-created?
```

**Metrics:**
| Metric | Definition | Target |
|--------|------------|--------|
| Relation Precision | Correct edges / Created edges | > 0.85 |
| Relation Recall | Found edges / Expected edges | > 0.70 |
| Relation F1 | Harmonic mean | > 0.75 |

**Evaluation without human annotation:**
- **Entailment scoring**: Use NLI model to verify relation is supported by source text
- **Consistency check**: Run 5x, measure Jaccard similarity of created relations
- **Synthetic injection**: Insert known relations, measure if librarian finds them

**Why it matters:** Mem0 discovers **0% of implicit relations**. If KP discovers 70%+, that's the headline.

**Action items:**
- [ ] Create `bench_librarian.py`
- [ ] Build synthetic test set with known relations
- [ ] Implement entailment-based evaluation
- [ ] Compare: KP vs Mem0 (expected: 70% vs 0%)

### 2.2 ConsoliMem 🆕 NEW — CONSOLIDATION QUALITY
**What it proves:** Does KnowledgeCard synthesis preserve and organize information?

**Design:**
```
Input: 50 documents with 30% intentional overlap
Process: Run CardConsolidator
Measure:
  - Deduplication ratio (50 docs → N cards)
  - Coverage F1 (can we retrieve all original info from cards?)
  - Synthesis quality (did it truly synthesize vs concatenate?)
```

**Metrics:**
| Metric | Definition | Target |
|--------|------------|--------|
| Dedup Ratio | Cards created / Input docs | < 0.7 (good consolidation) |
| Coverage F1 | Original facts recoverable from cards | > 0.90 |
| Synthesis Score | G-Eval coherence + consistency | > 0.80 |

**Evaluation tools:**
- **G-Eval**: GPT-4 based coherence/consistency scoring (0.514 Spearman correlation)
- **FActScore**: Verify all claims in cards are supported by source facts
- **DeepSynth-Eval**: Measure true synthesis vs simple extraction

**Why it matters:** Competitors store raw memories. KP organizes them into coherent knowledge.

**Action items:**
- [ ] Create `bench_consolidation.py`
- [ ] Build overlapping document test set
- [ ] Implement G-Eval and FActScore metrics
- [ ] Run n=50 benchmark

---

## Phase 3: Prove Retrieval Quality (HIGH PRIORITY)

### 3.1 HotpotQA Supporting Facts F1 ✅ IMPLEMENTED
**What it proves:** Can we retrieve the right evidence for multi-hop questions?

**Results (2026-02-17, n=20):**
| Metric | KnowledgePlane | Vector Baseline | Delta |
|--------|----------------|-----------------|-------|
| SF F1 | 16.7% | 2.9% | +485% |
| SF Recall | 60.9% | 5.0% | +55.9pp |
| SF Precision | 10.0% | 2.0% | +8.0pp |
| Doc Recall | 50.0% | 0.0% | +50.0pp |
| Latency | 482ms | 95ms | (slower) |

**Why it matters:** KP dramatically outperforms pure vector search on evidence retrieval.

**Metrics:**
| Metric | Definition | Target | Current |
|--------|------------|--------|---------|
| SF Precision | Correct support facts / Retrieved facts | > 0.15 | 10.0% |
| SF Recall | Found support facts / Gold support facts | > 0.65 | 60.9% ✅ |
| SF F1 | Harmonic mean | > 0.25 | 16.7% |

**Next steps:**
- [ ] Run n=200 full benchmark for statistical significance
- [ ] Improve SF Precision (currently retrieving too many non-supporting facts)
- [ ] Investigate latency optimization

### 3.2 GraphHop-N (Extended HotpotQA)
**What it proves:** Graph traversal beats vector similarity for relationship questions

**Design:**
- Use `FactRelation.getRelatedFacts()` for explicit edge traversal
- Test 1-hop, 2-hop, 3-hop accuracy separately
- Questions like: "What continent is the birthplace of the director of Titanic in?" (3 hops)

**Why it matters:** This tests retrieval + organization together

**Action items:**
- [ ] Create `bench_graphhop.py`
- [ ] Seed test data with explicit relations
- [ ] Implement graph traversal in kp_adapter
- [ ] Run n=200 benchmark

---

## Phase 4: Competitive Benchmarks (MEDIUM PRIORITY)

### 4.1 LoCoMo Subset
**What it proves:** Long-term memory retrieval (Mem0's flagship benchmark)

**Scope:** Single-session QA + multi-session reasoning (skip multi-modal)

**Target:** Match or beat Mem0's 66.9% on subset

**Why partial:** LoCoMo tests conversational memory; KP is knowledge infrastructure

### 4.2 LongMemEval Subset
**What it proves:** Temporal reasoning, knowledge updates (Zep's benchmark)

**Scope:** Temporal reasoning + knowledge update consistency

**Target:** Match or beat Zep's 18.5% improvement claim

**Note:** Zep's original 84% LoCoMo claim was disputed; corrected evaluation shows 58.44%

---

## Phase 5: Enterprise Differentiation (LOWER PRIORITY)

### 5.1 CRUD-Latency
**What it proves:** Real-time responsiveness

**Metrics:** P50, P95, P99 time from create to searchable

**Target:** KP <100ms P95; competitors >10s P95

### 5.2 Webhook Delivery Latency
**What it proves:** Event-driven architecture (no competitors have this)

**Metric:** Time from fact write to webhook delivery

**Target:** <50ms

### 5.3 Multi-Tenant Throughput
**What it proves:** Enterprise isolation at scale

**Metric:** Concurrent workspace operations, zero cross-tenant leakage

---

## Benchmark Decisions

### Skip: RAGAS
**Why:**
- RAGAS requires LLM answer generation (KP is retrieval-only)
- 2/4 RAGAS metrics (faithfulness, answer_relevancy) don't apply
- Current metrics (MRR, NDCG, Recall@k) already cover context precision/recall

**Alternative:** Use FActScore for factuality, G-Eval for quality

### Skip: HotpotQA Answer Metrics
**Why:**
- KP doesn't generate answers
- Measuring EM/F1 on answers is meaningless for retrieval

**Alternative:** Measure Supporting Facts F1 (retrieval quality for evidence)

### Consider: Text2KGBench
**Why:**
- Tests LLM-driven KG generation with hallucination detection
- Directly tests AI-generated graphs (like our librarian)
- 7 evaluation metrics for fact extraction

**Status:** Research complete, could replace/augment RelationRecall

---

## Architecture Constraints (Reality Check)

| Constraint | Implication | Benchmark Impact |
|------------|-------------|------------------|
| O(n) fallback vector search | Don't test large-scale vector | Keep n<500 for MS MARCO |
| ArangoSearch BM25 | Full-text works, not SPLADE | Don't benchmark neural ranking |
| Sync embeddings = API latency | Freshness limited by OpenAI | Test with mock for pure KP speed |
| Graph traversal = extra queries | Multi-hop adds latency | Measure hops vs accuracy tradeoff |
| Librarian runs every 5 min | Not real-time consolidation | Test after consolidation completes |

---

## Commands

```bash
cd tests/benchmarks

# Preflight (run first!)
./bench preflight

# Phase 1: Retrieval Layer (DONE)
./bench freshness                             # Freshness
./bench msmarco                               # MS MARCO

# Phase 2: AI Librarian (TODO)
./bench -- src/librarian.py --n 100           # RelationRecall
./bench -- src/consolidation.py --n 50        # ConsoliMem

# Phase 3: Retrieval Quality (DONE)
./bench hotpot                                # HotpotQA SF-F1
./bench -- src/graphhop.py --n 200            # Multi-hop traversal (TODO)

# Phase 4: Competitive (TODO)
./bench -- src/locomo.py --n 100              # vs Mem0
./bench -- src/longmemeval.py --n 100         # vs Zep
```

---

## Research Sources

### AI Librarian Evaluation
- [KnowledgeNet - End-to-end KB population](https://github.com/diffbot/knowledge-net)
- [Text2KGBench - LLM KG generation](https://github.com/cenguix/Text2KGBench)
- [DocRED - Document-level relation extraction](https://aclanthology.org/P19-1074/)
- [REBEL - End-to-end triplet extraction](https://huggingface.co/Babelscape/rebel-large)

### Consolidation Evaluation
- [Multi-XScience - Related work synthesis](https://huggingface.co/datasets/yaolu/multi_x_science_sum)
- [DeepSynth-Eval - Synthesis quality](https://arxiv.org/html/2601.03540)
- [G-Eval - LLM-based evaluation](https://learn.microsoft.com/en-us/ai/playbook/technology-guidance/generative-ai/working-with-llms/evaluation/g-eval-metric-for-summarization)
- [FActScore - Factuality verification](https://github.com/shmsw25/FActScore)
- [Do MDS Models Synthesize? - MIT](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00687)

### Relation Extraction Evaluation
- [TACRED Revisited](https://aclanthology.org/2020.acl-main.142/)
- [OIE Benchmark](https://github.com/gabrielStanovsky/oie-benchmark)
- [CaRB - Crowdsourced OpenIE](https://github.com/dair-iitd/CaRB)

### Competitive Intelligence
- [Mem0 Research](https://mem0.ai/research)
- [Mem0 Evaluation Gaps](https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation)
- [Zep Paper - Temporal Knowledge Graph](https://arxiv.org/abs/2501.13956)
- [Zep LoCoMo Dispute](https://github.com/getzep/zep-papers/issues/5)
- [Cognee Benchmark Evaluation](https://www.cognee.ai/blog/deep-dives/ai-memory-evals-0825)

### Standard Benchmarks
- [LoCoMo Benchmark](https://snap-research.github.io/locomo/)
- [LongMemEval](https://arxiv.org/abs/2410.10813)
- [HotpotQA](https://hotpotqa.github.io/)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-17 | Major restructure: AI Librarian benchmarks as Phase 2, research swarm findings |
| 2026-02-17 | Added RelationRecall, ConsoliMem benchmarks |
| 2026-02-17 | Added competitive analysis: Mem0 finds 0% relations |
| 2026-02-17 | Kept HotpotQA SF-F1 in Phase 3 (retrieval is table stakes) |
| 2026-02-17 | Added evaluation tools: G-Eval, FActScore, entailment scoring |
| 2026-02-16 | Complete rewrite based on swarm architecture analysis |
