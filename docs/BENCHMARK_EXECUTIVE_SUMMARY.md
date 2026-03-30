# KnowledgePlane Benchmark Executive Summary

**Date:** February 24, 2026
**Version:** 1.0
**Status:** Active Development

---

## Executive Overview

KnowledgePlane is a knowledge management system that combines vector embeddings with LLM-powered fact consolidation (CardConsolidator) to provide intelligent retrieval and reasoning over user data. This document summarizes our comprehensive benchmarking efforts across four industry-standard evaluation suites.

### Key Metrics at a Glance

| Benchmark | Task | Best Result | Industry Comparison |
|-----------|------|-------------|---------------------|
| **LongMemEval** | Memory QA | 50% accuracy | vs 60-95% SOTA |
| **HotpotQA** | Multi-hop Reasoning | 0.168 SF F1 | +226% vs vector baseline |
| **MS-MARCO** | Passage Ranking | 0.326 MRR | Competitive |
| **RelationRecall** | Relation Extraction | 0.582 F1 | 90% recall achieved |

---

## 1. LongMemEval (ICLR 2025) - Memory QA

### Overview
LongMemEval evaluates long-term memory capabilities across 500+ conversational sessions. Questions test four cognitive abilities: Information Extraction (IE), Multi-Session Reasoning (MR), Temporal Reasoning (TR), and Knowledge Updates (KU).

### Results Summary

| Setting | N | Accuracy | IE | MR | TR | KU | Recall@5 |
|---------|---|----------|----|----|----|----|----------|
| Oracle (Best) | 50 | **50.0%** | 50% | 8% | 58% | 100% | 93% |
| Oracle (Avg) | 50 | 45-48% | 40-50% | 8-17% | 47-58% | 100% | 93% |

### Competitor Comparison

| System | Accuracy | Delta vs KP |
|--------|----------|-------------|
| Mastra OM + GPT-5-mini | 94.9% | -44.9% |
| GPT-4o (Oracle) | 92.0% | -42.0% |
| EmergenceMem | 86.0% | -36.0% |
| Supermemory + Gemini-3-Pro | 85.2% | -35.2% |
| Mastra OM + GPT-4o | 84.2% | -34.2% |
| Supermemory + GPT-4o | 81.6% | -31.6% |
| Zep/Graphiti + GPT-4o | 71.2% | -21.2% |
| GPT-4o (Full Context) | 60.0% | -10.0% |
| **KnowledgePlane** | **50.0%** | baseline |

### Key Findings

1. **Knowledge Updates (KU): 100%** - CardConsolidator excels at tracking updated information
2. **Temporal Reasoning (TR): 58%** - Session dates enable decent temporal understanding
3. **Information Extraction (IE): 50%** - Main failure mode is "no relevant information" hallucinations
4. **Multi-Session Reasoning (MR): 8-17%** - Weakest area; aggregation across sessions fails

### Experiments Conducted (20 runs)

| Experiment | Result | Outcome |
|------------|--------|---------|
| Simple 7-rule prompt | 50% | ✅ Best overall |
| **Two-Stage LLM** | 46% | ⚠️ MR doubled (8→17%), but IE dropped (50→33%) |
| Aggressive anti-abstention | 44% | ❌ Caused wrong answers |
| Chain-of-thought for counting | 40% | ❌ Hurt all abilities |
| Extended counting rules | 48% | ❌ No improvement |
| Ability-specific prompts | 30% | ❌ Catastrophic failure |
| Database without cleaning | 27-30% | ❌ Pollution kills retrieval |

### Two-Stage LLM Deep Dive (Feb 24)

| Ability | Baseline | Two-Stage | Change |
|---------|----------|-----------|--------|
| IE | 50% | 33% | -17% ❌ |
| MR | 8% | 17% | **+9%** ✅ |
| TR | 58% | 53% | -5% |
| KU | 100% | 100% | 0% |

**Finding:** Two-Stage helps multi-session reasoning by processing sessions independently, but the extraction phase over-filters for single-session questions. A hybrid approach (Two-Stage for MR only) could improve overall accuracy.

### Root Cause Analysis

| Failure Mode | % of Errors | Description |
|--------------|-------------|-------------|
| Abstention hallucination | ~40% | Model says "no info" when info exists |
| Undercounting | ~35% | Finds 2 items when answer is 3 |
| Temporal ordering | ~15% | Wrong sequence of events |
| Aggregation errors | ~10% | Wrong totals/sums |

---

## 2. HotpotQA - Multi-hop Reasoning

### Overview
HotpotQA tests multi-hop reasoning by requiring retrieval of supporting facts from multiple documents to answer complex questions.

### Results Summary (N=200)

| System | Supporting Facts F1 | Doc Recall | Latency |
|--------|---------------------|------------|---------|
| **KnowledgePlane** | **0.168** | 0.555 | 472ms |
| Vector Baseline | 0.052 | 0.772 | 79ms |
| **Improvement** | **+226%** | -28% | +393ms |

### Key Findings

1. **CardConsolidator dramatically improves supporting fact identification** (+226%)
2. Trade-off: Lower document recall but much higher precision on relevant facts
3. Latency increase acceptable for quality improvement

---

## 3. MS-MARCO - Passage Ranking

### Overview
MS-MARCO evaluates passage ranking quality for information retrieval tasks.

### Results Summary (N=200)

| Metric | Score |
|--------|-------|
| MRR@10 | 0.326 |
| Recall@10 | 0.575 |
| NDCG@10 | 0.386 |

### Assessment
Competitive performance for a knowledge-focused system. MS-MARCO optimizes for search relevance; KnowledgePlane optimizes for knowledge consolidation.

---

## 4. RelationRecall - Relation Extraction

### Overview
RelationRecall evaluates the CardConsolidator's ability to extract and maintain entity relationships.

### Results Summary (N=10 clusters)

| Run | F1 | Precision | Recall |
|-----|----|-----------| -------|
| Best | **0.582** | 0.457 | 0.800 |
| High Recall | 0.563 | 0.409 | **0.900** |
| Balanced | 0.552 | 0.421 | 0.800 |

### Key Findings

1. **Excellent recall (80-90%)** - CardConsolidator finds most relationships
2. **Precision needs improvement** - Over-extraction of false positives
3. F1 score of 0.58 indicates room for refinement

---

## 5. Reranker Optimization

### Threshold Sweep Results

| Threshold | Performance |
|-----------|-------------|
| 0.25 | Lower |
| 0.30 | Lower |
| 0.35 | Medium |
| **0.40** | **Optimal (60.86% F1)** |
| 0.45 | Lower |

**Recommendation:** Use reranker threshold of 0.40 for production.

---

## Infrastructure Findings

### Critical Dependencies

| Component | Impact | Notes |
|-----------|--------|-------|
| Database cleanliness | **Critical** | Pollution drops Recall@5 from 93% to 69% |
| Embedding freshness | High | Async embedding queue working correctly |
| Reranker | Medium | 0.40 threshold optimal |
| Vector index | Medium | Using JS fallback (O(n)) due to sparse doc limitation |

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Avg query latency | 500-800ms |
| Embedding latency | 150-350ms |
| Consolidation time | 2-7s per batch |
| Recall@5 (clean DB) | 92-99% |
| Recall@5 (polluted DB) | 69-71% |

---

## Strategic Assessment

### Strengths
1. **Knowledge Updates (100%)** - Handles information changes perfectly
2. **Multi-hop Reasoning (+226%)** - CardConsolidator excels at connecting facts
3. **High Recall Retrieval (93%)** - Finds relevant information reliably
4. **Relation Extraction (90% recall)** - Captures entity relationships well

### Weaknesses
1. **Multi-Session Aggregation (8-17%)** - Cannot reliably count/sum across sessions
2. **LongMemEval Gap (-10 to -45%)** - Significantly behind SOTA memory systems
3. **Abstention Hallucinations** - Says "no info" when info exists
4. **Precision in Relation Extraction** - Over-extracts relationships

### Competitive Position

```
SOTA (Mastra+GPT-5): ████████████████████████ 95%
GPT-4o Oracle:       ███████████████████████  92%
EmergenceMem:        █████████████████████    86%
Supermemory:         ████████████████████     82%
Zep/Graphiti:        ██████████████████       71%
GPT-4o Full:         ███████████████          60%
KnowledgePlane:      █████████████            50%  ← Current
```

---

## Recommendations

### Immediate Actions (High Impact, Low Effort)

1. **Increase retrieval K from 5 to 10** for multi-session questions
2. **Implement cross-encoder reranking** for better fact selection
3. **Add explicit date parsing** for temporal reasoning

### Medium-Term Improvements

1. **Two-Stage LLM Architecture**
   - Stage 1: Extract relevant facts from each session
   - Stage 2: Synthesize answer from extracted facts
   - Expected impact: +15-20% on MR ability

2. **Hybrid Retrieval**
   - Combine keyword + semantic search
   - Improve recall on specific entity mentions

3. **Abstention Calibration**
   - Fine-tune model confidence thresholds
   - Reduce "no information" hallucinations

### Long-Term Architecture

1. **Temporal Knowledge Graph**
   - Track entity states over time
   - Enable complex temporal queries

2. **Session-Aware Embeddings**
   - Encode temporal context in vectors
   - Improve multi-session retrieval

---

## Conclusion

KnowledgePlane demonstrates strong capabilities in knowledge consolidation and multi-hop reasoning, outperforming vector baselines by 226% on supporting fact identification. However, a significant gap exists compared to state-of-the-art memory systems (50% vs 71-95% on LongMemEval).

The primary bottleneck is **multi-session reasoning**, where the system struggles to aggregate information across conversation sessions. Addressing this through architectural improvements (Two-Stage LLM, increased retrieval depth) is the recommended path forward.

**Target:** Achieve 70% LongMemEval accuracy (matching Zep/Graphiti) within next development cycle.

---

## Appendix: Benchmark Details

### LongMemEval Question Types

| Type | Description | KP Performance |
|------|-------------|----------------|
| single-session-user | User info from one session | 50% |
| single-session-assistant | Assistant info from one session | 50% |
| single-session-preference | User preferences | 33% |
| multi-session | Aggregation across sessions | 17% |
| temporal-reasoning | Time-based questions | 58% |
| knowledge-update | Updated information | 100% |

### Test Configurations

| Parameter | Value |
|-----------|-------|
| Retrieval K | 5 |
| Reranker threshold | 0.40 |
| Reranker window | 30 |
| Answer model | GPT-4o |
| Embedding model | text-embedding-3-small |
| Judge model | GPT-4o |

---

*Report generated: February 24, 2026*
*Total experiments: 35+ benchmark runs across 4 evaluation suites*
