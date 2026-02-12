# Known Limitations and Future Work

## Overview

This document honestly discusses the limitations of the current KnowledgePlane benchmarking suite. Good science requires acknowledging what is **not** tested, what assumptions are made, and where the methodology could be improved.

**Purpose**: Provide transparency for reproducibility and guide future improvements.

---

## Current Limitations

### 1. Sample Sizes

**Default Configuration**:
- **HotpotQA**: n=20 questions (quick test)
- **MS MARCO**: n=100 queries
- **Freshness**: Single update cycle per test run

**Issue**: Small sample sizes reduce statistical power

**Impact**:
- **n=20**: Sufficient to detect large effects (Cohen's d > 0.8) with 80% power
- **n=20**: Insufficient to reliably detect small effects (Cohen's d < 0.3)
- **p-values** may be unstable with small samples

**Recommendation**: Use n≥100 for moderate tests, n≥500 for publication-quality results

**Example Power Calculation**:
```
For paired t-test, α=0.05, power=0.80:
- Large effect (d=0.8): n=15 required
- Medium effect (d=0.5): n=34 required
- Small effect (d=0.2): n=199 required
```

**Current Status**: Default n=20 is adequate for medium/large effects but not small effects

---

### 2. HTTP Overhead in KP Latency

**Configuration**: Benchmarks use HTTP/JSON-RPC transport for KP MCP server

**Measured KP Latency Includes**:
- Network round-trip time (RTT)
- HTTP request/response overhead
- JSON serialization/deserialization
- TCP handshake (if connection not pooled)

**Measured Vector Baseline Latency Includes**:
- Only in-process computation (no network)
- Direct function calls
- No serialization overhead

**Typical Overhead Breakdown** (localhost):
- **KP Total**: ~100-150ms
  - HTTP overhead: ~20-40ms
  - KP search: ~60-110ms
- **Vector Baseline Total**: ~40-60ms
  - FAISS search: ~30-50ms
  - Answer extraction: ~10ms

**Bias**: KP latency is **artificially inflated** by 20-40ms due to HTTP overhead

**Solution**: Production deployments should use **stdio MCP transport** (in-process, no HTTP)

**Expected Stdio Latency**: 60-110ms (comparable to vector baseline)

**Why We Still Report HTTP Latency**:
- HTTP transport is the default MCP configuration
- Represents realistic deployed scenario (separate MCP server)
- Easy to reproduce without modifying KP codebase

**Recommendation**: Report both HTTP and stdio latencies in future benchmarks

---

### 3. Simple Answer Extraction

**Current Method**: First-sentence heuristic

**Implementation**:
```python
def _extract_answer_from_context(self, question: str, context: str) -> str:
    sentences = re.split(r'[.!?]+', context)
    return sentences[0]  # Return first sentence
```

**Issues**:
1. **Naive**: Ignores question semantics
2. **No Keyword Matching**: Doesn't check if question terms appear in answer
3. **No NER**: Doesn't identify named entities relevant to question
4. **No Span Extraction**: Doesn't extract precise answer spans

**Example Failure Case**:
```
Question: "Who directed Titanic?"
Context: "Titanic was a commercial success. The movie was directed by James Cameron."
First Sentence: "Titanic was a commercial success."
Expected Answer: "James Cameron"
Extracted Answer: "Titanic was a commercial success."
```

**Impact**: May underestimate both systems' performance by extracting poor answers

**Why We Use This Method**:
- **Fair Comparison**: Same heuristic applied to both KP and vector baseline
- **No API Cost**: Avoids LLM calls for answer generation
- **Reproducible**: Deterministic, no randomness

**Better Alternatives**:
1. **Keyword Scoring**: Score sentences by overlap with question terms
2. **NER + Type Matching**: Extract entities matching question type (person, place, date)
3. **Span Extraction Model**: Use BERT-based QA model (e.g., SQuAD-trained)
4. **LLM-based Extraction**: Use Claude/GPT to extract answer from context

**Future Work**: Add `--answer_method` flag supporting multiple extraction strategies

---

### 4. No Explicit Graph Traversal (HotpotQA)

**Current Implementation**: KP hybrid search returns top-k facts directly

**What's Missing**: Explicit multi-hop graph traversal

**Example**:
```python
# Current approach (what benchmarks do):
result = kp_adapter.query(question, k=5)  # Returns top-5 facts

# Desired approach (not implemented):
# 1. Find seed facts for first entity
seed_facts = kp_adapter.query("Arthur's Magazine", k=3)

# 2. Traverse relations to find founding date
for fact in seed_facts:
    related = kp_adapter.get_related_facts(fact.id, relation_type="has_property")
    # Find date-related facts

# 3. Repeat for second entity
seed_facts_2 = kp_adapter.query("First for Women", k=3)
# ...

# 4. Compare dates
```

**Impact**: Benchmarks **underutilize** KP's graph capabilities

**Why This is a Limitation**:
- HotpotQA is designed to test multi-hop reasoning
- KP's graph structure is **built** but not **traversed**
- Vector baseline comparison is less meaningful without explicit graph reasoning

**Mitigation**: KP's hybrid search implicitly benefits from graph structure via:
- Relation-aware embeddings
- Fact consolidation

**Future Work**:
1. Implement explicit graph traversal algorithm for HotpotQA
2. Benchmark "graph-aware" vs "graph-naive" KP modes
3. Add metrics for graph path quality

---

### 5. Freshness Test Polling Granularity

**Configuration**: Poll every 30 seconds (configurable)

**Issue**: Actual time-to-truth may be up to 30 seconds less than measured

**Example**:
```
True Timeline:
  t=0s:   Fact updated
  t=10s:  Fact becomes searchable (consolidation completes)

Measured Timeline:
  t=0s:   Start polling
  t=30s:  First poll → FOUND!
  Measured time-to-truth: 30s (actual was 10s)
```

**Bias**: Measured time-to-truth is **upper bound**, not precise

**Trade-offs**:
- **Finer polling (e.g., 5s)**: More precise but hammers KP server
- **Coarser polling (e.g., 60s)**: Less precise but lighter load

**Recommendation**: Report time-to-truth as range: `[poll_interval, measured_time]`

**Example**: "Time-to-truth: 30-60 seconds (poll interval: 30s)"

---

### 6. Binary Relevance Only (MS MARCO)

**Current Setup**: MS MARCO passages have binary relevance (0 or 1)

**Issue**: Graded relevance (0, 1, 2, 3) would be more informative

**Impact**:
- NDCG@k is less discriminative with binary relevance
- Cannot distinguish "highly relevant" from "marginally relevant"

**Why Binary**:
- MS MARCO v2.1 dataset uses binary labels (`is_selected`)
- Graded labels require separate annotation

**Future Work**: Use datasets with graded relevance (e.g., TREC, Robust04)

---

### 7. Hardware Configuration Not Standardized

**Current State**: Benchmarks run on user-provided hardware

**Issue**: Latency results are not comparable across runs

**Example**:
```
Machine A: MacBook Pro M2, 16GB RAM → 100ms
Machine B: AWS t3.medium, 4GB RAM → 250ms
Machine C: Desktop i9-12900K, 64GB RAM → 60ms
```

**Recommendation**: Report hardware specs with results

**Minimal Hardware Spec**:
```json
{
  "cpu": "Apple M2",
  "cores": 8,
  "ram_gb": 16,
  "os": "macOS 14.0",
  "python_version": "3.11.5",
  "kp_version": "1.0.0",
  "network": "localhost"
}
```

**Future Work**: Provide Docker image with standardized environment

---

### 8. Freshness Test - No Vector Baseline

**Current State**: Freshness benchmark only tests KP

**Why**: Vector databases require explicit re-indexing for updates

**Issue**: No comparison to demonstrate KP's advantage

**Recommendation**: Add vector baseline freshness test showing:
- Manual re-indexing time
- Incremental index update time
- Downtime during re-indexing

**Expected Result**: KP's background consolidation should be significantly faster than vector re-indexing

---

### 9. No RAGAS Metrics

**Missing Metrics**:
- **Context Relevance**: How relevant are retrieved facts/chunks to the question?
- **Answer Relevance**: How relevant is the answer to the question?
- **Faithfulness**: Is the answer grounded in the retrieved context?
- **Context Recall**: How many ground-truth facts were retrieved?

**Why Missing**: RAGAS requires LLM-as-judge, which adds cost and complexity

**Impact**: EM and F1 only measure lexical overlap, not semantic quality

**Future Work**: Add optional `--ragas` flag for comprehensive answer quality assessment

---

### 10. Single-Threaded Benchmarks

**Current Implementation**: Queries are processed sequentially

**Issue**: Does not test concurrent query performance

**Example**:
```python
# Current (sequential):
for question in questions:
    result = query(question)  # One at a time

# Desired (concurrent):
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(query, q) for q in questions]
    results = [f.result() for f in futures]
```

**Impact**:
- Real-world systems handle multiple concurrent users
- Latency under load is critical performance metric

**Future Work**: Add `--concurrent` flag with configurable worker count

---

## Threats to Validity

### Internal Validity

**Definition**: Are the observed differences actually due to KP vs vector baseline, or confounding factors?

**Controlled**:
- ✓ Same answer extraction method
- ✓ Same datasets
- ✓ Namespace isolation (no cross-contamination)
- ✓ Fixed random seeds (reproducible)

**Potential Confounds**:
- **HTTP overhead**: KP uses network, baseline doesn't (acknowledged limitation)
- **Chunk size**: Baseline uses fixed 512-token chunks (may not be optimal)
- **Embedding model**: Baseline uses all-MiniLM-L6-v2 (KP uses different embeddings)

**Mitigation**: Acknowledge in methodology, provide configuration details

---

### External Validity

**Definition**: Do results generalize beyond HotpotQA and MS MARCO?

**Concerns**:
1. **Dataset Specificity**: HotpotQA questions are Wikipedia-based, may not represent real-world queries
2. **Domain Coverage**: Only general knowledge domains tested
3. **Query Length**: HotpotQA questions are relatively short (10-20 tokens)
4. **Answer Type**: Mostly factoid questions (who, what, when, where)

**Not Tested**:
- Long-form questions (50+ tokens)
- Domain-specific knowledge (legal, medical, technical)
- Conversational queries
- Ambiguous queries
- Adversarial queries

**Recommendation**: Expand to additional datasets (Natural Questions, FEVER, SQuAD 2.0)

---

### Construct Validity

**Definition**: Do EM and F1 scores actually measure "answer quality"?

**Strengths**:
- ✓ Standard metrics (widely used in QA literature)
- ✓ Objective (no subjective judgment)
- ✓ Reproducible (deterministic)

**Limitations**:
- **Lexical Matching Only**: "car" ≠ "automobile" (semantically equivalent, EM=0)
- **No Partial Credit**: "Paris, France" vs "Paris" (EM=0, F1=0.67)
- **No Answer Quality**: Grammatically incorrect answers score same as correct

**Example**:
```
Question: "What is the capital of France?"
Ground Truth: "Paris"

Answer A: "Paris"           → EM=1.0, F1=1.0
Answer B: "paris"           → EM=1.0, F1=1.0 (after normalization)
Answer C: "The capital"     → EM=0.0, F1=0.0 (despite being related)
Answer D: "Paris, France"   → EM=0.0, F1=0.67 (contains correct answer)
```

**Recommendation**: Add semantic similarity metrics (e.g., BERTScore, RAGAS)

---

### Conclusion Validity

**Definition**: Are statistical conclusions justified?

**Concerns**:
1. **Small Sample Sizes**: Default n=20 may lack power for small effects
2. **Multiple Testing**: Testing both EM and F1 increases false positive rate (should use Bonferroni correction)
3. **Non-Normal Distributions**: EM is binary (0 or 1), violates t-test normality assumption

**Mitigations**:
- Use McNemar's test for binary EM scores (more appropriate)
- Use bootstrap confidence intervals (non-parametric, robust)
- Increase sample size to n≥100 for reliable conclusions

**Recommendation**: Report both parametric and non-parametric tests

---

## Future Work

### High Priority

1. **Larger Sample Sizes**
   - Default: n≥100
   - Statistical: n≥500
   - Add `--n 500` quick option

2. **Explicit Graph Traversal**
   - Implement multi-hop traversal for HotpotQA
   - Benchmark graph-aware vs graph-naive modes
   - Add graph path quality metrics

3. **Stdio MCP Transport**
   - Add `--transport stdio` flag
   - Eliminate HTTP overhead
   - Fair latency comparison

4. **Additional Datasets**
   - Natural Questions
   - SQuAD 2.0 (with unanswerable questions)
   - FEVER (fact verification)

### Medium Priority

5. **Better Answer Extraction**
   - Add `--answer_method` flag
   - Implement span extraction
   - Use NER + type matching

6. **RAGAS Metrics**
   - Add `--ragas` flag
   - Implement LLM-as-judge
   - Report context/answer relevance

7. **Concurrent Queries**
   - Add `--concurrent N` flag
   - Test latency under load
   - Report P50, P95, P99 latencies

8. **Vector Baseline Freshness**
   - Test explicit re-indexing time
   - Compare to KP's background consolidation

### Low Priority

9. **Graded Relevance**
   - Use datasets with graded labels
   - Report NDCG with full scale

10. **Domain-Specific Tests**
    - Test on technical domains
    - Test on conversational queries

11. **Standardized Hardware**
    - Provide Docker image
    - Document reference hardware specs

12. **Ablation Studies**
    - Test KP with graph relations disabled
    - Test different chunk sizes for vector baseline
    - Test different embedding models

---

## Known Bugs and Issues

### Open Issues

1. **Issue #1**: Namespace filtering not enforced server-side
   - **Impact**: Client-side filtering used (minor performance impact)
   - **Status**: Workaround implemented
   - **Priority**: Medium

2. **Issue #2**: Mock adapter doesn't simulate graph relations
   - **Impact**: Cannot test locally without KP server
   - **Status**: Known limitation
   - **Priority**: Low

3. **Issue #3**: Statistical analysis requires pandas (optional dependency)
   - **Impact**: Users without pandas cannot run `--statistical-analysis`
   - **Status**: Documented in requirements
   - **Priority**: Low

### Resolved Issues

- ✓ **Issue #4**: Fact extraction timeout on large documents → Added timeout parameter
- ✓ **Issue #5**: FAISS index not released → Added proper cleanup in `close()`

---

## Assumptions Made

### Explicit Assumptions

1. **Same Extractive Method is Fair**: Both systems use first-sentence heuristic
   - **Justification**: Isolates retrieval quality from generation quality
   - **Alternative**: Could use LLM generation for both (higher cost)

2. **Namespace Isolation Works**: Each query's documents are isolated
   - **Justification**: Prevents cross-contamination in MS MARCO
   - **Alternative**: Use separate workspaces (more overhead)

3. **HTTP Overhead is Acceptable**: Report HTTP latency despite overhead
   - **Justification**: Reflects realistic deployment scenario
   - **Alternative**: Use stdio transport (requires different setup)

4. **Random Sampling is Representative**: Random sample from HotpotQA validation set
   - **Justification**: Validation set is pre-shuffled
   - **Alternative**: Stratified sampling (implemented as option)

### Implicit Assumptions

1. **Users can run KP server locally**: Benchmarks assume `localhost:8080/mcp` is available
2. **Python 3.9+ environment**: Modern Python with type hints
3. **Sufficient RAM**: FAISS indexing requires RAM proportional to corpus size
4. **No rate limiting**: No API rate limits enforced

---

## When NOT to Use These Benchmarks

These benchmarks are **not suitable** for:

1. **Production Performance Testing**: Use real production queries and load testing tools
2. **Cost Analysis**: Benchmarks don't measure API costs (no LLM generation)
3. **User Experience**: EM/F1 don't capture UX quality (use human evaluation)
4. **Scalability Testing**: Single-threaded benchmarks don't test concurrent load
5. **Domain-Specific Evaluation**: General knowledge datasets may not represent your domain

---

## Responsible Reporting

When reporting benchmark results, please:

1. **Report Sample Size**: "Tested on n=100 questions"
2. **Report Configuration**: "Using HTTP transport, default chunk size 512"
3. **Report Hardware**: "MacBook Pro M2, 16GB RAM"
4. **Report Confidence Intervals**: "F1: 0.85 [95% CI: 0.82, 0.88]"
5. **Report Limitations**: "HTTP overhead inflates KP latency by ~30ms"
6. **Avoid Cherry-Picking**: Report all metrics, not just favorable ones
7. **Use Proper Significance Tests**: Don't claim "improvement" without p-values

**Example Good Reporting**:
```
KnowledgePlane achieved F1=0.85 (95% CI: [0.82, 0.88]) compared to
vector baseline F1=0.78 (95% CI: [0.75, 0.81]) on n=100 HotpotQA
questions (p<0.01, Cohen's d=0.72). Testing was performed on a
MacBook Pro M2 using HTTP MCP transport (adding ~30ms overhead).
```

**Example Bad Reporting**:
```
KnowledgePlane is 9% better than vector baseline!
(Cherry-picked metric, no CI, no sample size, no significance test)
```

---

## Contact

For questions about limitations or suggestions for improvements:

- **GitHub Issues**: https://github.com/knowledgeplane/benchmarks/issues
- **Tag**: Use `limitations` or `future-work` tags

---

**Document Version**: 1.0
**Last Updated**: 2026-02-12
**Authors**: KnowledgePlane Benchmark Suite Contributors
