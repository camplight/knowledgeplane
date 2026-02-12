# Benchmark Methodology - KnowledgePlane

## Overview

This document provides a complete, scientifically rigorous description of the methodology used to benchmark KnowledgePlane against a vector baseline system. All benchmark code is open source and available in this repository.

**Version**: 1.0
**Date**: 2026-02-12
**Datasets**: HotpotQA (distractor), MS MARCO (v2.1), Custom Freshness Tests

---

## A. Answer Generation

### KnowledgePlane (KP) System

**Method**: Extractive answer generation from graph-retrieved facts

**Process**:
1. **Query Processing**: User question is sent to KP via MCP `facts_search` tool
2. **Hybrid Retrieval**: KP performs hybrid search (fulltext + vector) across fact nodes
3. **Graph Traversal**: Related facts are retrieved via `fact_relations_get_related` tool
4. **Context Extraction**: Top-k facts (default k=5) are concatenated to form context
5. **Answer Extraction**: Simple heuristic - first sentence from top-ranked fact

**Implementation** (from `bench_hotpotqa.py`, lines 434-472):
```python
def query_kp_system(self, question: str, namespace: str):
    result = self.kp_adapter.query(
        question=question,
        namespace=namespace,
        k=self.top_k,
        search_mode="hybrid"  # Combines fulltext and vector search
    )

    # Extract answer from top results
    if result.results:
        context = " ".join([r.content for r in result.results[:3]])
        answer = self._extract_answer_from_context(question, context)
    else:
        answer = "No answer found"

    return answer, latency_ms
```

**Answer Extraction Heuristic** (lines 501-528):
- Split context into sentences using regex: `[.!?]+`
- Return first sentence as answer
- **Rationale**: Simple, deterministic, no LLM cost, fair comparison

**No LLM Used**: Both systems use the same extractive heuristic to ensure fair comparison. No generative LLM is involved in answer generation for the benchmark results.

### Vector Baseline System

**Method**: Extractive answer generation from vector-retrieved chunks

**Process**:
1. **Query Embedding**: Question is embedded using sentence-transformers (all-MiniLM-L6-v2)
2. **Vector Search**: FAISS similarity search retrieves top-k chunks (default k=5)
3. **Context Extraction**: Top-k chunks are concatenated
4. **Answer Extraction**: Same heuristic as KP - first sentence from top chunk

**Implementation** (from `vector_baseline.py`, lines 439-471):
```python
def _generate_answer_extractive(self, question: str, retrieved: List[RetrievalResult]):
    # Get the top-scoring chunk
    top_chunk = retrieved[0].chunk

    # Split chunk into sentences
    sentences = self._split_into_sentences(top_chunk.text)

    # Return first sentence (same heuristic as KP)
    return sentences[0]
```

**Embedding Model**:
- `sentence-transformers/all-MiniLM-L6-v2`
- Dimension: 384
- Local model, no API cost
- Embeddings are L2-normalized for cosine similarity

**Chunking Strategy** (lines 219-289):
- Fixed-size chunks: 512 tokens
- Overlap: 128 tokens (25%)
- Sentence boundaries preserved
- Metadata preserved from source documents

### Fairness of Comparison

**Both systems use**:
- Same extractive heuristic (first sentence)
- Same namespace-based isolation per query
- Same top-k retrieval (k=5 default)
- No LLM-based answer generation

**Key Difference**:
- **KP**: Retrieves structured fact nodes with graph relations
- **Baseline**: Retrieves unstructured text chunks with no relational context

This is a **fair comparison** because:
1. Answer generation method is identical
2. Both use semantic search (KP hybrid, baseline pure vector)
3. Difference is in the **retrieval mechanism**, not answer generation
4. This isolates the value of graph-native knowledge representation

---

## B. Latency Measurement

### What is Measured

**Scope**: End-to-end query latency from question submission to answer extraction

**Start Point**: `time.time()` immediately before query submission
**End Point**: `time.time()` immediately after answer extraction
**Units**: Milliseconds (ms)

### KP Latency Measurement

**Code** (from `bench_hotpotqa.py`, lines 449-457):
```python
start_time = time.time()
result = self.kp_adapter.query(
    question=question,
    namespace=namespace,
    k=self.top_k,
    search_mode="hybrid"
)
latency_ms = (time.time() - start_time) * 1000
```

**Includes**:
- HTTP request to MCP server
- KP hybrid search (fulltext + vector)
- Fact retrieval and ranking
- HTTP response parsing
- Answer extraction heuristic

**Excludes**:
- Document ingestion time (done once before queries)
- Network latency to benchmark machine (measured client-side)
- Result serialization/deserialization overhead

### Vector Baseline Latency Measurement

**Code** (from `bench_hotpotqa.py`, lines 485-495):
```python
start_time = time.time()
answer = self.vector_baseline.query(
    question=question,
    k=self.top_k,
    mode="extractive"
)
latency_ms = (time.time() - start_time) * 1000
```

**Includes**:
- Query embedding generation (sentence-transformers)
- FAISS similarity search
- Chunk retrieval
- Answer extraction heuristic

**Excludes**:
- Document ingestion and indexing time (done once before queries)
- Model loading time (cached after first load)

### Environment Details

**Hardware** (user-specified, example):
- CPU: Variable (specify in benchmark config)
- RAM: Variable (specify in benchmark config)
- GPU: Not used (CPU-only benchmarks)

**Software**:
- Python 3.9+
- sentence-transformers 2.x
- FAISS 1.7+
- KnowledgePlane MCP server (version specified in config)

**Network**:
- KP: HTTP/JSON-RPC over localhost or network
- Baseline: In-process (no network)

**Important**: KP latency includes HTTP overhead, baseline does not. This is acknowledged as a limitation. For production deployments, KP would use in-process MCP via stdio, eliminating HTTP overhead.

---

## C. Freshness Benchmark

### Source of Truth Definition

**Freshness** measures time-to-truth: the elapsed time between ingesting a fact update and when that update becomes retrievable via search.

**Ground Truth**: The updated fact content that was explicitly ingested

**Success Criterion**: Query returns the new value (substring match)

### Update Propagation - KnowledgePlane

**Process** (from `bench_freshness.py`, lines 432-453):
1. Initial fact ingested via `files_upload` MCP tool
2. Fact is extracted, stored in graph with embedding
3. Update is ingested as a new document with same metadata
4. KP's background consolidation process merges/updates facts
5. Updated fact becomes searchable via hybrid search

**Background Process**: KP runs periodic consolidation to merge related facts. This is not explicitly triggered by benchmarks.

**Namespace Isolation**: Each test uses a unique namespace (e.g., `freshness_bench`) to isolate test facts.

### Update Propagation - Vector Baseline

**Process**: Not applicable - vector baseline does not have a freshness test

**Rationale**: The freshness benchmark specifically tests KP's knowledge graph consolidation capabilities. Vector databases typically require explicit re-indexing for updates, which is a known limitation.

### Detection Method

**Polling Strategy** (from `bench_freshness.py`, lines 115-236):
```python
def poll_until_updated(adapter, question, expected_value,
                       poll_interval=30, max_attempts=20):
    for attempt in range(max_attempts):
        result = adapter.query(question, namespace, k=10, search_mode="hybrid")

        # Check if expected value appears in results
        if result.results and expected_value in result.results[0].content:
            return FreshnessResult(found=True, time_to_truth_seconds=elapsed)

        time.sleep(poll_interval)

    return FreshnessResult(found=False, time_to_truth_seconds=None)
```

**Parameters**:
- **Poll Interval**: 30 seconds (configurable)
- **Max Attempts**: 20 (configurable, default = 10 minutes total)
- **Match Type**: Substring match (case-sensitive)
- **Top-k**: 10 results checked per poll

**Success Criteria**:
- **Found**: Updated value appears in top-10 search results
- **Not Found**: Max attempts reached without finding update

### Time-to-Truth Calculation

**Formula**: `time_to_truth_seconds = elapsed_time_at_first_success`

**Interpretation**:
- **< 1 minute**: Excellent
- **< 3 minutes**: Good
- **< 5 minutes**: Target
- **> 5 minutes**: Slow (may indicate consolidation issue)

### Known Limitations

1. **Polling Granularity**: 30-second intervals mean actual time-to-truth may be up to 30 seconds less than measured
2. **Background Process**: Consolidation timing depends on KP's internal scheduler
3. **Substring Match**: Simple matching may miss semantic equivalents
4. **Single Test Run**: Each benchmark run tests one update cycle

---

## D. Multi-Hop Reasoning (HotpotQA)

### Dataset Details

**Dataset**: HotpotQA (distractor setting)
**Source**: HuggingFace `datasets` library
**Split**: Validation set
**Version**: Latest available via `load_dataset("hotpot_qa", "distractor")`

**Dataset Characteristics**:
- Questions requiring 2+ reasoning hops
- 10 passages per question (2 relevant, 8 distractors)
- Ground truth answers are short spans
- Supporting facts annotated (not used in benchmark)

### Sampling Strategy

**Implementation** (from `bench_hotpotqa.py`, lines 159-271):

Three sampling methods available:

1. **Random Sampling** (default):
   - Shuffle all questions with fixed seed
   - Take first N questions
   - Ensures reproducibility with `seed=42`

2. **First N**:
   - Take first N questions in dataset order
   - Deterministic, no randomization
   - Useful for quick tests

3. **Stratified Sampling**:
   - Sample proportionally from each difficulty level (easy/medium/hard)
   - Preserves difficulty distribution
   - More representative of full dataset

**Code Example** (lines 220-271):
```python
def _stratified_sample(self, items: List[Dict], n: int):
    # Group by difficulty level
    by_level = {}
    for item in items:
        level = item.get('level', 'medium')
        by_level.setdefault(level, []).append(item)

    # Sample proportionally
    samples = []
    for level, level_items in by_level.items():
        level_proportion = len(level_items) / len(items)
        level_n = int(n * level_proportion)
        samples.extend(random.sample(level_items, level_n))

    random.shuffle(samples)
    return samples[:n]
```

**Default Configuration**:
- Method: Random
- N: 20 (quick test), 100 (moderate), 500+ (statistical)
- Seed: 42 (reproducible)

### Metrics Used

#### Exact Match (EM)

**Definition**: Binary metric - 1.0 if normalized prediction exactly matches normalized ground truth, 0.0 otherwise

**Normalization** (from `bench_hotpotqa.py`, lines 995-1020):
```python
def normalize_answer(text: str) -> str:
    # 1. Lowercase
    text = text.lower()

    # 2. Remove articles (a, an, the)
    text = re.sub(r'\b(a|an|the)\b', ' ', text)

    # 3. Remove punctuation
    text = text.translate(str.maketrans('', '', string.punctuation))

    # 4. Collapse whitespace
    text = ' '.join(text.split())

    return text
```

**Computation** (lines 1023-1037):
```python
def compute_exact_match(prediction: str, ground_truth: str) -> float:
    return 1.0 if normalize_answer(prediction) == normalize_answer(ground_truth) else 0.0
```

**Interpretation**:
- **1.0**: Perfect match after normalization
- **0.0**: Any difference (partial credit not given)

#### F1 Score

**Definition**: Token-level F1 score measuring overlap between predicted and ground truth tokens

**Computation** (from `bench_hotpotqa.py`, lines 1040-1077):
```python
def compute_f1(prediction: str, ground_truth: str) -> float:
    pred_tokens = normalize_answer(prediction).split()
    truth_tokens = normalize_answer(ground_truth).split()

    # Count token overlaps
    pred_counter = Counter(pred_tokens)
    truth_counter = Counter(truth_tokens)
    overlap = sum((pred_counter & truth_counter).values())

    # Compute precision and recall
    precision = overlap / len(pred_tokens) if pred_tokens else 0.0
    recall = overlap / len(truth_tokens) if truth_tokens else 0.0

    # Compute F1 (harmonic mean)
    if precision + recall == 0:
        return 0.0

    return 2 * precision * recall / (precision + recall)
```

**Interpretation**:
- **1.0**: Perfect token overlap
- **0.5**: Moderate overlap (typical for partial answers)
- **0.0**: No token overlap

**Example**:
- Prediction: "Paris, France"
- Ground Truth: "Paris"
- Normalized Pred: "paris france" (2 tokens)
- Normalized GT: "paris" (1 token)
- Overlap: 1 token ("paris")
- Precision: 1/2 = 0.5
- Recall: 1/1 = 1.0
- F1: 2 * 0.5 * 1.0 / (0.5 + 1.0) = 0.667

### Answer Extraction Method

**Both systems** use the same extractive method (see Section A).

**No graph traversal** is explicitly used in the current benchmark implementation. KP returns top-k facts from hybrid search; graph relations are stored but not explicitly traversed during query time in this benchmark.

**Future Enhancement**: Benchmarks could explicitly leverage graph traversal for multi-hop questions by:
1. Retrieving seed facts for first hop
2. Following relations to related facts
3. Combining evidence across hops

---

## E. Passage Ranking (MS MARCO)

### Dataset Details

**Dataset**: MS MARCO (v2.1)
**Source**: HuggingFace `datasets` library
**Split**: Validation set
**Version**: `load_dataset("ms_marco", "v2.1", split="validation")`

**Dataset Characteristics**:
- Real search queries from Bing
- 10 passages per query
- Binary relevance labels (is_selected: 0 or 1)
- Single-hop passage ranking task

### Metrics Used

#### Mean Reciprocal Rank (MRR)

**Definition**: Reciprocal of the rank of the first relevant passage

**Formula**: `MRR = 1 / rank_of_first_relevant`

**Computation** (from `bench_msmarco.py`, lines 726-745):
```python
def compute_mrr(ranked_passages: List[str], relevant_passages: Set[str]) -> float:
    for rank, passage_id in enumerate(ranked_passages, 1):
        if passage_id in relevant_passages:
            return 1.0 / rank
    return 0.0
```

**Interpretation**:
- **1.0**: First result is relevant
- **0.5**: Second result is relevant
- **0.33**: Third result is relevant
- **0.0**: No relevant results in top-k

#### Recall@k

**Definition**: Fraction of relevant passages found in top-k results

**Formula**: `Recall@k = |relevant ∩ top_k| / |relevant|`

**Computation** (lines 748-772):
```python
def compute_recall_at_k(ranked_passages: List[str],
                         relevant_passages: Set[str], k: int) -> float:
    if not relevant_passages:
        return 0.0

    top_k = set(ranked_passages[:k])
    found = len(top_k & relevant_passages)

    return found / len(relevant_passages)
```

**Interpretation**:
- **1.0**: All relevant passages in top-k
- **0.5**: Half of relevant passages in top-k
- **0.0**: No relevant passages in top-k

#### NDCG@k (Normalized Discounted Cumulative Gain)

**Definition**: Ranking quality metric with position discount

**Formula**:
- `DCG@k = Σ(i=1 to k) (2^relevance_i - 1) / log2(i + 1)`
- `IDCG@k = DCG of perfect ranking`
- `NDCG@k = DCG / IDCG`

**Computation** (lines 775-808):
```python
def compute_ndcg_at_k(ranked_passages: List[str],
                       relevance_scores: Dict[str, int], k: int) -> float:
    # Compute DCG
    dcg = 0.0
    for i, passage_id in enumerate(ranked_passages[:k]):
        relevance = relevance_scores.get(passage_id, 0)
        dcg += (2 ** relevance - 1) / log2(i + 2)

    # Compute IDCG (ideal DCG)
    ideal_relevance = sorted(relevance_scores.values(), reverse=True)[:k]
    idcg = 0.0
    for i, relevance in enumerate(ideal_relevance):
        idcg += (2 ** relevance - 1) / log2(i + 2)

    return dcg / idcg if idcg > 0 else 0.0
```

**Interpretation**:
- **1.0**: Perfect ranking (all relevant at top)
- **0.8-0.9**: Good ranking
- **0.5-0.7**: Moderate ranking
- **< 0.5**: Poor ranking

### Query Isolation via Namespaces

**Strategy**: Each query uses a unique namespace to ensure complete isolation

**Implementation** (from `bench_msmarco.py`, lines 505-528):
```python
for query_data in queries:
    # Create query-specific namespace
    query_namespace = f"{namespace}_q{query_data['id']}"

    # Ingest passages for this query only
    passages = self.prepare_passages(query_data)
    self.ingest_kp_passages(passages, query_namespace)

    # Vector baseline is reset for each query
    self.initialize_vector_baseline()
    self.ingest_vector_passages(passages)

    # Evaluate with isolation
    result = self.evaluate_query(query_data, query_namespace)
```

**Why Isolation is Critical**:
- Prevents cross-contamination between queries
- Ensures each query only accesses its 10 candidate passages
- Mirrors real search scenario (query-specific corpus)
- Fair comparison between systems

---

## F. Statistical Analysis

### Tests Used

#### Paired t-Test

**Purpose**: Test if mean difference between KP and baseline is statistically significant

**Null Hypothesis**: `H0: mean(KP) - mean(baseline) = 0`

**Alternative Hypothesis**: `H1: mean(KP) > mean(baseline)` (one-tailed) or `H1: mean(KP) ≠ mean(baseline)` (two-tailed)

**Implementation** (from `statistical_analysis.py`, lines 58-95):
```python
def paired_t_test(system1_scores: List[float],
                  system2_scores: List[float],
                  alternative: str = "two-sided") -> Tuple[float, float]:
    if len(system1_scores) != len(system2_scores):
        raise ValueError("Must have paired data")

    t_stat, p_val = stats.ttest_rel(
        system1_scores,
        system2_scores,
        alternative=alternative
    )

    return float(t_stat), float(p_val)
```

**Assumptions**:
- Paired observations (same queries evaluated by both systems)
- Differences are approximately normally distributed
- Independent samples

**Interpretation**:
- **p < 0.01**: Highly significant (strong evidence)
- **p < 0.05**: Significant (evidence of difference)
- **p ≥ 0.05**: Not significant (insufficient evidence)

#### McNemar's Test

**Purpose**: Test for binary outcomes (e.g., Exact Match: correct/incorrect)

**Null Hypothesis**: `H0: Both systems have same error rate`

**Implementation** (lines 98-138):
```python
def mcnemar_test(system1_correct: List[bool],
                 system2_correct: List[bool]) -> Tuple[float, float]:
    # Build 2x2 contingency table
    both_correct = sum(s1 and s2 for s1, s2 in zip(...))
    s1_only = sum(s1 and not s2 for s1, s2 in zip(...))
    s2_only = sum(not s1 and s2 for s1, s2 in zip(...))
    both_wrong = sum(not s1 and not s2 for s1, s2 in zip(...))

    # McNemar statistic with continuity correction
    chi2 = (abs(s1_only - s2_only) - 1) ** 2 / (s1_only + s2_only)
    p_val = 1 - stats.chi2.cdf(chi2, df=1)

    return float(chi2), float(p_val)
```

**Why Use This**: More appropriate than t-test for binary outcomes (EM scores)

### Significance Level

**Alpha (α)**: 0.05 (5% significance level)

**Interpretation**:
- **p < α**: Reject null hypothesis (significant difference)
- **p ≥ α**: Fail to reject null hypothesis (no evidence of difference)

**Bonferroni Correction**: Not applied unless testing multiple hypotheses on same data. If testing EM and F1 separately, consider α/2 = 0.025 per test.

### Effect Size Interpretation

**Cohen's d** measures standardized mean difference:

**Formula**: `d = (mean1 - mean2) / pooled_std`

**Implementation** (lines 187-224):
```python
def effect_size_cohens_d(system1_scores, system2_scores) -> float:
    mean1 = np.mean(system1_scores)
    mean2 = np.mean(system2_scores)

    # Pooled standard deviation
    var1 = np.var(system1_scores, ddof=1)
    var2 = np.var(system2_scores, ddof=1)
    pooled_std = np.sqrt((var1 + var2) / 2)

    return (mean1 - mean2) / pooled_std
```

**Interpretation** (Cohen, 1988):
- **|d| < 0.2**: Negligible effect
- **|d| ≈ 0.2**: Small effect
- **|d| ≈ 0.5**: Medium effect
- **|d| ≈ 0.8**: Large effect
- **|d| > 1.0**: Very large effect

### Sample Size Justification

**Minimum Recommended**:
- **Quick test**: n ≥ 20 (sufficient for paired t-test with α=0.05)
- **Moderate**: n ≥ 100 (better power, more reliable)
- **Statistical**: n ≥ 500 (high power, detect small effects)

**Power Analysis**:
- For medium effect size (d=0.5), α=0.05, power=0.80: **n ≥ 34** required
- For small effect size (d=0.2), α=0.05, power=0.80: **n ≥ 199** required

**Current Defaults**:
- HotpotQA: n=20 (quick test, sufficient for medium/large effects)
- MS MARCO: n=100 (moderate test)

### Confidence Interval Calculation

**Parametric (t-distribution)**:

**Formula**: `CI = mean ± t_critical * SE`

Where:
- `SE = std / sqrt(n)` (standard error)
- `t_critical = t_α/2, df=n-1` (t-distribution critical value)

**Implementation** (lines 21-55):
```python
def compute_confidence_interval(scores, confidence=0.95):
    mean = np.mean(scores)
    std_error = stats.sem(scores)  # Standard error of mean

    degrees_freedom = len(scores) - 1
    t_critical = stats.t.ppf((1 + confidence) / 2, degrees_freedom)
    margin_error = std_error * t_critical

    return mean, mean - margin_error, mean + margin_error
```

**Bootstrap (non-parametric)**:

**Method**: Resample with replacement, compute mean, use percentiles for CI

**Implementation** (lines 141-184):
```python
def bootstrap_confidence_interval(scores, n_bootstrap=10000, confidence=0.95):
    bootstrap_means = []

    for _ in range(n_bootstrap):
        sample = np.random.choice(scores, size=len(scores), replace=True)
        bootstrap_means.append(np.mean(sample))

    alpha = 1 - confidence
    lower = np.percentile(bootstrap_means, alpha / 2 * 100)
    upper = np.percentile(bootstrap_means, (1 - alpha / 2) * 100)

    return mean, lower, upper
```

**When to Use Bootstrap**:
- Small sample size (n < 30)
- Non-normal distribution
- Robust alternative to parametric methods

---

## G. Reproducibility

### Random Seeds

All random operations use fixed seeds for reproducibility:

```python
seed = 42  # Default for all benchmarks

np.random.seed(seed)
random.seed(seed)
```

**What is seeded**:
- Dataset sampling
- Stratified sampling
- Bootstrap resampling (if `random_state` specified)

### Configuration Files

All benchmark runs save configuration to JSON:

**Example** (from benchmark output):
```json
{
  "config": {
    "n_questions": 20,
    "top_k": 5,
    "seed": 42,
    "run_kp": true,
    "run_vector": true,
    "mock_kp": false,
    "sample_method": "random",
    "timestamp": "2026-02-12T10:30:00Z"
  }
}
```

### Version Pinning

Recommended `requirements.txt` for reproducibility:

```
datasets==2.14.0
faiss-cpu==1.7.4
sentence-transformers==2.2.2
scipy==1.11.0
numpy==1.24.0
requests==2.31.0
```

---

## H. Limitations and Known Issues

### Current Limitations

1. **Small Default Sample Size**: Default n=20 for quick tests. Increase to n≥100 for statistical rigor.

2. **HTTP Overhead**: KP latency includes HTTP/JSON-RPC overhead. Production deployments use stdio MCP (no network).

3. **Simple Answer Extraction**: First-sentence heuristic is simplistic. Could use NER, keyword scoring, or span extraction.

4. **No Explicit Graph Traversal**: Current HotpotQA benchmark does not explicitly traverse graph relations during query. This is a missed opportunity to showcase KP's graph capabilities.

5. **Freshness Polling Granularity**: 30-second intervals may miss exact time-to-truth by up to 30 seconds.

6. **Binary Relevance Only**: MS MARCO benchmark uses binary relevance (0/1). Graded relevance would be more informative.

### Threats to Validity

**Internal Validity**:
- Answer extraction method is identical (eliminates this as confound)
- Namespace isolation prevents cross-contamination

**External Validity**:
- HotpotQA and MS MARCO may not represent all knowledge retrieval scenarios
- Real-world queries may differ in complexity and length

**Construct Validity**:
- EM and F1 are standard metrics but may not capture all aspects of answer quality
- Latency includes overhead that varies by deployment

### Future Work

1. **Larger Sample Sizes**: Test with n≥500 for statistical power
2. **Additional Datasets**: Add Natural Questions, SQuAD 2.0, FEVER
3. **Explicit Graph Traversal**: Implement multi-hop graph reasoning for HotpotQA
4. **RAGAS Metrics**: Add context relevance, answer relevance, faithfulness
5. **Graded Relevance**: Use MS MARCO passages with graded relevance scores
6. **Production Latency**: Test with stdio MCP to eliminate HTTP overhead
7. **Answer Quality**: Use LLM-as-judge for semantic answer evaluation

---

## I. References

### Datasets

1. **HotpotQA**: Yang et al., "HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering", EMNLP 2018.
   - https://hotpotqa.github.io/

2. **MS MARCO**: Nguyen et al., "MS MARCO: A Human Generated MAchine Reading COmprehension Dataset", NeurIPS 2016.
   - https://microsoft.github.io/msmarco/

### Metrics

3. **Exact Match & F1**: Rajpurkar et al., "SQuAD: 100,000+ Questions for Machine Comprehension of Text", EMNLP 2016.

4. **MRR, Recall@k, NDCG**: Järvelin & Kekäläinen, "Cumulated gain-based evaluation of IR techniques", ACM TOIS 2002.

### Statistical Methods

5. **Paired t-test**: Student's t-test for dependent samples (standard statistical method)

6. **McNemar's Test**: McNemar, "Note on the sampling error of the difference between correlated proportions or percentages", Psychometrika 1947.

7. **Cohen's d**: Cohen, J., "Statistical Power Analysis for the Behavioral Sciences", 2nd ed., 1988.

8. **Bootstrap Confidence Intervals**: Efron & Tibshirani, "An Introduction to the Bootstrap", 1993.

---

## J. Contact and Support

**Repository**: https://github.com/knowledgeplane/benchmarks
**Issues**: https://github.com/knowledgeplane/benchmarks/issues
**Documentation**: https://github.com/knowledgeplane/benchmarks/docs

For questions about methodology, please open a GitHub issue with the `methodology` tag.

---

**Document Version**: 1.0
**Last Updated**: 2026-02-12
**Authors**: KnowledgePlane Benchmark Suite Contributors
