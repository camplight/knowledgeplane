# RelationRecall Benchmark - Gap Analysis Report

**Generated:** 2026-02-17
**Status:** Pre-benchmark audit complete

This report consolidates findings from swarm agent audits and SOTA web research to identify gaps between KnowledgePlane's CardConsolidator implementation and current best practices.

---

## Executive Summary

| Category | Gaps Found | Critical | Medium | Low |
|----------|------------|----------|--------|-----|
| Architecture | 5 | 3 | 2 | 0 |
| Model/API | 2 | 1 | 1 | 0 |
| Benchmark Integration | 4 | 0 | 3 | 1 |
| **Total** | **11** | **4** | **6** | **1** |

---

## Critical Gaps

### 1. Content-Based Matching is Fragile
**Location:** `card-consolidator.ts:323-329`

**Problem:** The AI returns fact text in `from_content` and `to_content`, which are matched back to facts using exact string comparison:
```typescript
const fromFact = batch.find((f) => f.content === relation.from_content);
```

**Impact:** Fails if the AI paraphrases, summarizes, or has any whitespace differences.

**SOTA Solution:** [SF-GPT](https://www.sciencedirect.com/science/article/abs/pii/S0925231224014978) uses Entity Alignment Generator with semantic clustering for fuzzy matching.

**Recommendation:** Use embedding similarity + entity alignment instead of exact string match.

---

### 2. Batch Size Limits Cross-Batch Relations
**Location:** `card-consolidator.ts:316`

**Problem:** Facts are processed in fixed batches of 20. Relations can only be discovered *within* a batch.

**Example:** If Fact #1 and Fact #25 are semantically related, they will never be evaluated together.

**SOTA Solution:** Use sliding window batching with overlap (e.g., sentence size 3, overlap 1) to ensure cross-batch relation discovery.

**Status:** ✅ **FIXED** - Implemented sliding window with 50% overlap (step=10, batch=20). Batches now: 0-19, 10-29, 20-39, etc.

---

### 3. No Hybrid Retrieval
**Location:** CardConsolidator relies exclusively on LLM for relation discovery.

**Problem:** Pure LLM approach is slow and expensive. Embeddings exist in the system but aren't used for relation candidate detection.

**SOTA Solution:** [Graphiti/Zep](https://github.com/getzep/graphiti) uses embeddings + BM25 + graph traversal with **no LLM calls during retrieval** (P95 latency: 300ms).

**Status:** ✅ **FIXED** - Added embedding pre-filtering with `findSimilarPairs()` (threshold >= 30%). AI prompt now includes top 10 similar pairs as hints.

---

### 4. Deprecated Model (gpt-4o)
**Location:** All files referencing model selection

**Problem:** GPT-4o deprecated on Feb 17, 2026. API calls will fail.

**Status:** ✅ **FIXED** - Migrated to `gpt-5.1` with single source of truth in `@knowledgeplane/aimodel/constants.ts`

---

## Medium Gaps

### 5. No Relation Type Normalization
**Location:** `card-consolidator.ts:426-427`

**Problem:** The AI prompt includes `etc.` allowing arbitrary relation types:
```
"references", "depends_on", "related_to", "part_of", "causes", "enables", "contradicts", "supports", etc.
```

**Impact:** AI can return variations like "related_to" vs "related to" vs "relates_to".

**SOTA Solution:** Use [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) with JSON schema to constrain types.

**Recommendation:** Use `response_format: { type: "json_schema" }` with enum constraint.

---

### 6. Single-Pass Extraction
**Location:** CardConsolidator makes one LLM call per batch.

**Problem:** No validation or consolidation pass to catch errors.

**SOTA Solution:** [EDC Framework](https://arxiv.org/html/2510.20345v1): Extract → Define → Canonicalize (3 stages)

**Recommendation:** Add validation pass to verify extracted relations.

---

### 7. No Temporal Awareness
**Location:** FactRelation model has no validity period fields.

**Problem:** Cannot track when relations were valid or invalidated.

**SOTA Solution:** [Zep](https://arxiv.org/html/2501.13956v1) maintains validity periods with non-lossy updates.

**Recommendation:** Add `valid_from`, `valid_until` fields to FactRelation.

---

### 8. Consolidation Trigger via Direct DB
**Location:** `relationrecall.py:698-720`

**Problem:** Benchmark triggers consolidation by writing directly to ArangoDB with hardcoded credentials (`root:root`).

**Recommendation:** Add REST API endpoint for triggering consolidation.

---

### 9. Race Condition in Stability Check
**Location:** `relationrecall.py:770-773`

**Problem:** Benchmark checks if relation count is "stable" for 3 polls to detect consolidation completion. This may trigger prematurely between batch processing.

**Recommendation:** Check for explicit "completed" status from worker instead of counting relations.

---

### 10. Relation Types Mismatch
**Location:** Benchmark RELATION_TYPES vs CardConsolidator prompt

**Problem:** Benchmark had 7 types, CardConsolidator has 8 (`contradicts` was missing).

**Status:** ✅ **FIXED** - Added `contradicts` to benchmark's RELATION_TYPES.

---

## Low Priority

### 11. Benchmark Favors Small Clusters
**Location:** Benchmark uses 3-fact clusters

**Problem:** All cluster facts fit within 20-fact batch limit, making benchmark results overly optimistic.

**Recommendation:** Add "stress test" mode with 50+ fact clusters to expose batch limit issues.

---

## Comparison with Competitors

| Capability | KnowledgePlane | Mem0 | Zep/Graphiti |
|------------|----------------|------|--------------|
| Auto-discover relations | ✅ (but fragile) | ❌ "0% implicit" | ✅ |
| Hybrid retrieval | ❌ LLM-only | ⚠️ Limited | ✅ Emb+BM25+Graph |
| Temporal awareness | ❌ | ❌ | ✅ |
| Retrieval latency | ~500ms | ~200ms | ~300ms (no LLM) |
| Structured output | ❌ json_object | N/A | ✅ |

**KP Advantage:** Auto-creates relations where Mem0 finds 0%.

**KP Gap:** No hybrid retrieval like Graphiti.

---

## Fixed in This Session

1. ✅ **Model Migration**: `gpt-4o` → `gpt-5.1` with single source of truth
2. ✅ **Relation Types Sync**: Added `contradicts` to benchmark
3. ✅ **CLI Rename**: `librarian` → `relationrecall` (pragmatic)

---

## Recommended Next Steps

### Before Running Benchmark
1. ~~Update model to gpt-5.1~~ ✅ Done
2. ~~Sync relation types~~ ✅ Done
3. Verify background-workers is running with new model

### Short-Term Improvements
4. Add embedding pre-filtering for relation candidates
5. Implement sliding window batching
6. Use Structured Outputs for type constraints

### Medium-Term Improvements
7. Add consolidation trigger API
8. Add consolidation status API
9. Add temporal validity fields

---

## Sources

- [OpenAI Retiring GPT-4o](https://openai.com/index/retiring-gpt-4o-and-older-models/)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [SF-GPT: Knowledge Triple Extraction](https://www.sciencedirect.com/science/article/abs/pii/S0925231224014978)
- [Graphiti: Real-Time Knowledge Graphs](https://github.com/getzep/graphiti)
- [Zep Temporal KG Architecture](https://arxiv.org/html/2501.13956v1)
- [EDC Framework](https://arxiv.org/html/2510.20345v1)
- [Cognee AI Memory Tools Evaluation](https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation)
- [IBM SOTA LLMs for KG Construction](https://research.ibm.com/publications/the-state-of-the-art-large-language-models-for-knowledge-graph-construction-from-text-techniques-tools-and-challenges--1)
