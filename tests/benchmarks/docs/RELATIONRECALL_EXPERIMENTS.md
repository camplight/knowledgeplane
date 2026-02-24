# RelationRecall Benchmark Experiments

Track all experiments for improving RelationRecall F1 score.

**Target**: 60%+ F1 (currently stuck at 45-58% with high variance)

---

## ⚠️ Strategic Note (2026-02-20)

> **RelationRecall is now an INTERNAL development benchmark only.**
>
> **Why:** Even 100% F1 on RelationRecall has no external credibility—it's an internal benchmark nobody outside KP knows about.
>
> **Primary external benchmark:** LongMemEval (ICLR 2025, UCLA/Tencent)
>
> **Use RelationRecall for:**
> - Fast iteration on CardConsolidator pipeline
> - Regression testing after changes
> - Internal quality tracking
>
> **Do NOT use RelationRecall for:**
> - Marketing claims
> - Competitive comparisons
> - External publications
>
> See [BENCHMARK_ROADMAP.md](../tests/benchmarks/docs/BENCHMARK_ROADMAP.md) for full strategy.

---

## Current Best Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Embedding Threshold | 0.30 | Over-fetch for reranker |
| **Reranker Threshold** | **0.40** | **Optimized via sweep (was 0.35)** |
| Confidence Threshold | 0.70 | In LLM extraction |
| LLM Verify | DISABLED | Hurt F1 (58% → 40%) |
| Temperature | 0.0 | Deterministic |

**Best Sweep Result**: 60.86% ± 6.01% F1 at threshold 0.40

---

## Completed Experiments

### Exp 1: Cross-encoder Reranker Validation ✅
**Date**: 2026-02-19
**Hypothesis**: Cross-encoder reranker improves precision by filtering embedding-similar but semantically unrelated pairs

**Changes**:
- Started reranker sidecar on port 8082
- Set embedding threshold to 0.30 (over-fetch)
- Reranker threshold: 0.35

**Results**:
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| F1 | ~40% | 57.6% | +17.6% |
| Precision | - | 41.3% | - |
| Recall | - | 95.0% | - |
| TP/FP/FN | - | 19/27/1 | - |

**Conclusion**: KEEP - Reranker significantly improved F1. High recall but low precision suggests over-generation.

---

### Exp 2: Confidence Threshold 0.8 ❌
**Date**: 2026-02-19
**Hypothesis**: Raising confidence threshold from 0.7 to 0.8 would filter low-confidence relations and improve precision

**Changes**:
- CONFIDENCE_THRESHOLD: 0.7 → 0.8
- Updated prompt to say "0.8" instead of "0.7"

**Results**:
| Metric | Before (0.7) | After (0.8) | Delta |
|--------|--------------|-------------|-------|
| F1 | 57.6% | 45.6% | **-12.0%** |
| Precision | 41.3% | 35.1% | -6.2% |
| Recall | 95.0% | 65.0% | -30.0% |
| TP/FP/FN | 19/27/1 | 13/24/7 | - |

**Conclusion**: REVERTED - Raising threshold hurt BOTH precision and recall. The LLM assigns similar confidence scores to good and bad relations, so filtering doesn't help.

---

## Pending Experiments

### Exp 3: HNSW Index for Embedding Pre-filter
**Hypothesis**: Native vector index (O(log n)) vs JS cosine fallback (O(n²)) could improve throughput

**Status**: TODO - Blocked by ArangoDB sparse document limitation

**Notes**:
- Current: JS cosine fallback due to sparse documents (facts created without embeddings)
- Option A: Separate embeddings collection for vector index
- Option B: Wait for ArangoDB sparse vector support

---

### Exp 4: Reranker Threshold Sweep ✅
**Date**: 2026-02-19
**Hypothesis**: Current threshold 0.35 may be too permissive or too strict

**Method**: Hyperparameter sweep with 3 runs per value (statistical validation)

**Results**:
| Threshold | Mean F1 | Std | Individual Runs |
|-----------|---------|-----|-----------------|
| 0.25 | 45.93% | ±7.56% | 41.2%, 56.6%, 40.0% |
| 0.30 | 46.80% | ±5.95% | 55.2%, 43.1%, 42.1% |
| 0.35 | 48.63% | ±9.89% | 50.0%, 35.9%, 60.0% |
| **0.40** | **60.86%** | **±6.01%** | 54.9%, **69.1%**, 58.6% |
| 0.45 | 51.26% | ±9.53% | 64.4%, 47.3%, 42.1% |

**Conclusion**: KEEP 0.40 - Clear local maximum! +12.23% F1 improvement over 0.35 default.

**Updated default**: RERANKER_THRESHOLD changed from 0.35 → 0.40

---

### Exp 5: Entity-Based Pre-filtering
**Hypothesis**: Only consider pairs that share named entities before reranking

**Research Findings (Swarm 2026-02-19):**
- Precision gains: +2-16% documented in literature
- Recall loss: -1-5% (manageable with hybrid approaches)
- Production systems (Zep, LangChain, LlamaIndex) all use entity pre-filtering
- **Embedding-based > NER-only** for implicit references

**Recommendation**: We already do embedding pre-filtering (0.30 threshold) + reranker. This is essentially Option 2 from research. Skip for now.

---

### Exp 6: Relation Count Cap (Hub Detection) 🆕
**Hypothesis**: Highly-connected entities (hubs) attract spurious relations

**Research Findings (Swarm 2026-02-19):**
- Microsoft GraphRAG uses 0.5 confidence minimum
- Degree normalization: `score / log(1 + degree)` penalizes hubs
- Per-type limits recommended

**Suggested Implementation**:
```typescript
const MAX_RELATIONS_PER_TYPE = {
  references: 10,
  depends_on: 5,
  related_to: 15,
  part_of: 3,
  causes: 5,
  contradicts: 3,
  supports: 10,
  enables: 5,
};
```

**Expected Impact**: +10-15% precision, -5-10% recall

**Status**: TODO - Quick win

---

### Exp 7: Bayesian + ASHA Hyperparameter Tuning
**Research Findings (Swarm 2026-02-19):**
- Grid search: 625 evaluations (4 params × 5 values)
- **Bayesian + ASHA: 30-50 evaluations** (12-20x faster)
- Parameter sensitivity: LLM Confidence > Embedding > Reranker > Temperature
- **Temperature should be FIXED at 0.0** - not worth tuning

**Recommendation**: Skip for now - single-param sweeps sufficient. Consider if need multi-param optimization later.

---

### Exp 8: Prompt Engineering - Few-shot Examples
**Hypothesis**: Better few-shot examples could improve LLM precision

**Ideas**:
- Add more negative examples (non-relations that look like relations)
- Add domain-specific examples
- Reduce ambiguity in relation type definitions

---

### Exp 9: Hybrid Retrieval (BM25 + Embedding) ❌
**Date**: 2026-02-20
**Hypothesis**: Combining BM25 keyword matching with embedding similarity improves pre-filtering by catching entity/keyword matches that cosine similarity misses

**Implementation**:
- Added `findSimilarPairsHybrid()` method to CardConsolidator
- Uses BM25 search via `Fact.search({ use_vector_search: false })` for top-K similar facts
- Combines with embedding similarity using RRF (Reciprocal Rank Fusion)
- RRF formula: `score = Σ 1/(k + rank_i)` where k=60 (standard)

**Results**:
| Metric | Embedding-only | Hybrid (BM25+Embedding) | Delta |
|--------|----------------|------------------------|-------|
| F1 | 60.86% | ~50% | **-10.86%** |
| Precision | 41.8% | 48.0% | +6.2% |
| Recall | 76.7% | 51.7% | **-25.0%** |

**Conclusion**: REVERTED - BM25 adds noise to relation extraction pre-filtering. Keyword matches that aren't semantically similar introduce false candidates, which the LLM then over-generates relations for. The embedding-based approach is better for this use case.

**Why BM25 hurts here**: BM25 finds lexically similar text (shared keywords), but relation extraction needs semantically related facts. Two facts sharing the word "Paris" doesn't mean they have a logical relation.

**Status**: DISABLED by default (`USE_HYBRID_PREFILTER=true` to re-enable)

---

### Exp 10: Multi-run Statistical Reporting
**Hypothesis**: LLM variance is high; need multiple runs for reliable metrics

**Commands**:
```bash
./bench relationrecall --runs 5 -n 10
./bench relationrecall --runs 10 -n 10
```

**Notes**: Helps distinguish real improvements from variance

---

## Dropped Experiments

### LLM Verification (Gap #6) ❌
**Tested**: 2026-02-18
**Result**: DECREASED F1 from 58% to 30.5%
**Reason**: CoT verification was too strict, rejecting valid relations

---

## Variance Analysis

LLM non-determinism causes F1 to vary between 16% and 58% across runs:

| Run | F1 | Notes |
|-----|-----|-------|
| 1 | 58.3% | Best observed |
| 2 | 40.0% | - |
| 3 | 16.2% | Worst observed |
| 4 | 45.6% | - |
| 5 | 57.6% | With reranker |

**Mitigation**: Use `--runs 5` or more for statistical confidence
