# Methodology FAQ - KnowledgePlane Benchmarks

## Overview

This FAQ addresses common questions about the benchmarking methodology, design decisions, and how to interpret results.

**Related Documents**:
- [METHODOLOGY.md](./METHODOLOGY.md) - Full methodology details
- [LIMITATIONS.md](./LIMITATIONS.md) - Known limitations
- [EXAMPLE_CASE_STUDY.md](./EXAMPLE_CASE_STUDY.md) - Worked example

---

## General Questions

### Q: Is the comparison fair?

**A**: Yes, with acknowledged caveats.

**Fair Aspects**:
- **Same answer extraction method**: Both KP and vector baseline use identical first-sentence heuristic
- **Same datasets**: Both evaluated on same questions/queries
- **Same top-k**: Both retrieve same number of results (default k=5)
- **Namespace isolation**: No cross-contamination in MS MARCO tests
- **No cherry-picking**: All results reported

**Caveats**:
- **Latency**: KP includes HTTP overhead (~20-40ms), vector baseline is in-process
- **Deployment**: KP is a full system with MCP server, vector baseline is a Python class
- **Chunking**: Vector baseline uses fixed 512-token chunks (not necessarily optimal)

**Bottom Line**: The comparison isolates **retrieval quality** (graph vs vector) while controlling for answer generation. The latency comparison has known bias (HTTP overhead) that we openly acknowledge.

See: [METHODOLOGY.md Section B](./METHODOLOGY.md#b-latency-measurement)

---

### Q: Why these metrics?

**A**: Standard metrics from QA research literature.

**Exact Match (EM)**:
- **Pros**: Strict, objective, no partial credit
- **Cons**: Penalizes minor variations ("Paris" vs "Paris, France")
- **Used in**: SQuAD, HotpotQA, Natural Questions

**F1 Score**:
- **Pros**: Partial credit for token overlap, more forgiving
- **Cons**: Doesn't capture semantic equivalence
- **Used in**: SQuAD, HotpotQA, Natural Questions

**MRR, Recall@k, NDCG@k**:
- **Pros**: Standard ranking metrics, used in IR research
- **Cons**: Require relevance labels
- **Used in**: MS MARCO, TREC, Robust04

**Why Not Others**:
- **BLEU/ROUGE**: Designed for generation tasks, not QA
- **BERTScore**: Requires LLM, adds cost/complexity
- **RAGAS**: Requires LLM-as-judge (planned for future)

**Bottom Line**: We use metrics that are:
1. Standard in the field (reproducible, comparable)
2. Objective (no subjective judgment)
3. Low-cost (no LLM API calls)

See: [METHODOLOGY.md Section D](./METHODOLOGY.md#d-multi-hop-reasoning-hotpotqa)

---

### Q: Why these datasets?

**A**: Standard benchmarks for QA and retrieval.

**HotpotQA**:
- **Tests**: Multi-hop reasoning (2+ steps)
- **Why**: Designed to evaluate reasoning across multiple documents
- **Limitation**: Wikipedia-only, may not generalize

**MS MARCO**:
- **Tests**: Passage ranking (single-hop)
- **Why**: Real search queries, large-scale benchmark
- **Limitation**: Binary relevance only

**Freshness Test**:
- **Tests**: Time-to-truth for updates
- **Why**: No existing benchmark for graph consolidation speed
- **Limitation**: Custom test, not standardized

**Why Not Others** (planned for future):
- **Natural Questions**: More natural queries (vs Wikipedia-style)
- **SQuAD 2.0**: Includes unanswerable questions
- **FEVER**: Fact verification (classification task)

**Bottom Line**: We prioritize:
1. Multi-hop reasoning (HotpotQA) → KP's strength
2. Passage ranking (MS MARCO) → Standard IR task
3. Freshness (custom) → Unique to graph systems

See: [METHODOLOGY.md Section D](./METHODOLOGY.md#d-multi-hop-reasoning-hotpotqa)

---

### Q: What about [other system/approach]?

**A**: We compare against a vanilla vector baseline for clarity.

**Why Simple Vector Baseline**:
- **Reproducible**: Anyone can implement with sentence-transformers + FAISS
- **No API costs**: Uses local models
- **Clear comparison**: Isolates graph vs vector difference

**What About**:

**Hybrid Systems (e.g., hybrid search in vector DBs)**:
- KP also uses hybrid search (vector + fulltext)
- Difference is graph structure, not hybrid search
- Could add as future comparison

**GraphRAG**:
- Microsoft's GraphRAG extracts graphs at query time
- KP extracts graphs at ingestion time (query-independent)
- Architectural difference, not directly comparable
- Could add as future comparison

**Proprietary Systems (e.g., Pinecone, Weaviate)**:
- Require API keys and cost money
- Not reproducible by researchers without budget
- We prioritize open, reproducible comparisons

**Other Knowledge Graphs (e.g., Neo4j + RAG)**:
- Manual schema design required
- KP extracts schema automatically
- Could add as future comparison

**Bottom Line**: We start with the **simplest meaningful baseline** (pure vector) to establish baseline performance. Future work will compare against more sophisticated systems.

See: [LIMITATIONS.md - Future Work](./LIMITATIONS.md#future-work)

---

### Q: Can I reproduce these results?

**A**: Yes! All code is open source.

**Requirements**:
```bash
pip install -r requirements.txt
```

**Minimal Example** (with mock KP, no server needed):
```bash
python bench_hotpotqa.py --n 20 --mock_kp --run_vector true
```

**Full Example** (with real KP server):
```bash
# 1. Start KP MCP server (see KP documentation)
# 2. Set environment variables
export KP_API_URL="http://localhost:8080/mcp"
export KP_API_KEY="your-api-key"
export KP_WORKSPACE_ID="your-workspace-id"
export KP_USER_ID="your-user-id"

# 3. Run benchmark
python bench_hotpotqa.py --n 100 --run_kp true --run_vector true --statistical-analysis
```

**Expected Runtime**:
- n=20: ~5-10 minutes
- n=100: ~30-45 minutes
- n=500: ~2-3 hours

**Reproducibility Checklist**:
- ✓ Fixed random seeds (seed=42)
- ✓ Deterministic sampling
- ✓ Version-pinned dependencies
- ✓ Configuration saved to JSON

**Output**:
- `output/hotpotqa_results.csv` - Per-question results
- `output/hotpotqa_summary.json` - Aggregate metrics

See: [METHODOLOGY.md Section G](./METHODOLOGY.md#g-reproducibility)

---

### Q: What hardware do I need?

**A**: Modest hardware is sufficient for small-scale tests.

**Minimum**:
- **CPU**: Modern x86_64 or ARM (e.g., Intel i5, Apple M1)
- **RAM**: 8GB (16GB recommended for n≥100)
- **Storage**: 5GB free space (for datasets and models)
- **Network**: Localhost connection to KP server (if running real KP)

**Recommended**:
- **CPU**: 4+ cores
- **RAM**: 16GB+
- **Storage**: 10GB+ (for multiple datasets)
- **GPU**: Not required (CPU-only benchmarks)

**Example Configurations**:

**Budget Laptop** (n=20):
- MacBook Air M1, 8GB RAM → ~5 minutes
- Dell XPS 13, Intel i5, 8GB RAM → ~8 minutes

**Desktop** (n=100):
- MacBook Pro M2, 16GB RAM → ~30 minutes
- Desktop i7-12700, 32GB RAM → ~25 minutes

**Server** (n=500):
- AWS c6i.2xlarge (8 vCPU, 16GB RAM) → ~2 hours
- Desktop i9-12900K, 64GB RAM → ~90 minutes

**Bottlenecks**:
- **RAM**: FAISS indexing loads all embeddings into RAM
- **CPU**: Sentence-transformer encoding is CPU-intensive
- **Network**: KP server latency (if remote)

**Recommendation**: Start with n=20 on laptop, scale to n=100+ on desktop/server

---

### Q: How long does it take to run?

**A**: Depends on sample size and hardware.

**Rough Estimates** (on modern laptop):

| Benchmark | n | Expected Time |
|-----------|---|---------------|
| HotpotQA (mock) | 20 | 3-5 min |
| HotpotQA (real) | 20 | 5-10 min |
| HotpotQA (real) | 100 | 30-45 min |
| HotpotQA (real) | 500 | 2-3 hours |
| MS MARCO | 100 | 45-60 min |
| Freshness | 1 | 10-30 min |

**Breakdown** (per question):
- **Ingestion**: 1-3s per document (one-time cost)
- **KP query**: 0.1-0.2s per query
- **Vector query**: 0.04-0.06s per query
- **Overhead**: 0.05-0.1s (metrics, logging, saving)

**Total per question**: ~0.5-1s (including both systems)

**Parallelization**: Not implemented (sequential processing)

**Recommendation**:
- Quick test: n=20 (5-10 min)
- Moderate test: n=100 (30-45 min)
- Statistical: n=500+ (2-3 hours, run overnight)

---

### Q: Why is KP slower than the vector baseline?

**A**: HTTP overhead accounts for most of the difference.

**Measured Latency** (typical):
- **KP**: 100-150ms
- **Vector Baseline**: 40-60ms
- **Difference**: ~70ms

**Breakdown**:

**KP Latency** (100-150ms):
- HTTP request: 10-20ms
- KP hybrid search: 50-90ms
- HTTP response: 10-20ms
- JSON parsing: 5-10ms
- Answer extraction: 5-10ms

**Vector Baseline Latency** (40-60ms):
- Query embedding: 15-25ms
- FAISS search: 10-20ms
- Answer extraction: 5-10ms
- **No network overhead**: 0ms

**Expected Latency with Stdio MCP** (in-process):
- **KP**: 60-110ms (removes HTTP overhead)
- **Vector Baseline**: 40-60ms
- **Difference**: ~30ms (pure search quality difference)

**Why Report HTTP Latency Anyway**:
- Realistic deployment scenario (separate MCP server)
- Easy to reproduce without modifying KP
- Acknowledged as limitation

**Recommendation**: For fair latency comparison, use stdio MCP transport

See: [LIMITATIONS.md Section 2](./LIMITATIONS.md#2-http-overhead-in-kp-latency)

---

### Q: Are the benchmark results statistically significant?

**A**: Depends on sample size and effect size.

**Statistical Significance** (p < 0.05):
- Indicates observed difference is unlikely due to random chance
- **Does not** guarantee practical importance
- Requires sufficient sample size

**Example Interpretation**:

**Case 1: Significant and Large Effect**
```
KP F1: 0.85 ± 0.03
Baseline F1: 0.78 ± 0.03
Difference: +0.07 (9% relative)
p-value: 0.002 (significant)
Cohen's d: 0.82 (large effect)
```
**Interpretation**: Strong evidence KP outperforms baseline with meaningful effect size

**Case 2: Significant but Small Effect**
```
KP F1: 0.81 ± 0.02
Baseline F1: 0.79 ± 0.02
Difference: +0.02 (2.5% relative)
p-value: 0.04 (significant)
Cohen's d: 0.21 (small effect)
```
**Interpretation**: Statistically significant but practically negligible

**Case 3: Large Difference but Not Significant**
```
KP F1: 0.85 ± 0.08 (n=10)
Baseline F1: 0.78 ± 0.08 (n=10)
Difference: +0.07 (9% relative)
p-value: 0.12 (not significant)
Cohen's d: 0.65 (medium effect)
```
**Interpretation**: Large effect but insufficient sample size (need n≥20 for power)

**Recommendation**:
- Report **both** p-value and effect size
- Use n≥100 for reliable significance testing
- Consider practical significance, not just statistical significance

See: [METHODOLOGY.md Section F](./METHODOLOGY.md#f-statistical-analysis)

---

### Q: Why not use an LLM to generate answers?

**A**: To isolate retrieval quality from generation quality.

**Current Approach**: Extractive (first-sentence heuristic)
- **Pro**: Same method for both systems (fair comparison)
- **Pro**: No LLM API cost
- **Pro**: Deterministic (reproducible)
- **Con**: May extract poor answers

**Alternative Approach**: Generative (LLM-based)
- **Pro**: Better answer quality
- **Pro**: More realistic (RAG typically uses LLM generation)
- **Con**: LLM quality dominates results
- **Con**: API cost ($0.001-0.01 per question)
- **Con**: Non-deterministic (temperature > 0)

**Example**:
```
Question: "Who directed Titanic?"
Retrieved Context (KP): "Titanic was directed by James Cameron in 1997."
Retrieved Context (Baseline): "The movie Titanic (1997) stars Leonardo DiCaprio."

Extractive (both): "Titanic was directed by James Cameron in 1997."
Generative (KP): "James Cameron directed Titanic."
Generative (Baseline): "The director is not mentioned in the retrieved context."
```

**Issue**: With LLM generation, differences may be due to:
1. Retrieval quality (what we want to measure)
2. LLM's ability to extract answers (confounding factor)
3. Random variation in generation

**Our Choice**: Use extractive method to isolate variable #1 (retrieval quality)

**Future Work**: Add `--answer_method generative` option for comparison

See: [METHODOLOGY.md Section A](./METHODOLOGY.md#a-answer-generation)

---

### Q: What's the deal with graph traversal?

**A**: It's implemented but not explicitly used in current benchmarks.

**Current Benchmark Behavior**:
```python
# What benchmarks currently do:
result = kp_adapter.query(question, k=5)  # Returns top-5 facts
answer = extract_from_top_fact(result)
```

**Graph Capability** (implemented in KP but not leveraged):
```python
# What KP can do (not used in benchmarks yet):
seed_facts = kp_adapter.query("Arthur's Magazine", k=3)
for fact in seed_facts:
    related = kp_adapter.get_related_facts(fact.id, relation_type="founded_in")
    # Follow relations to find founding date
```

**Why Not Used**:
- Current benchmark focuses on hybrid search (vector + fulltext)
- Graph traversal adds complexity to implementation
- Need to design traversal algorithm for HotpotQA

**Impact**:
- Benchmarks **underestimate** KP's graph reasoning capabilities
- KP still benefits from graph structure via:
  - Relation-aware embeddings
  - Fact consolidation
  - Graph-aware indexing

**Future Work**:
- Implement explicit multi-hop traversal algorithm
- Benchmark "graph-aware" vs "graph-naive" KP modes
- Add graph path quality metrics

See: [LIMITATIONS.md Section 4](./LIMITATIONS.md#4-no-explicit-graph-traversal-hotpotqa)

---

### Q: How do you handle updates in the freshness test?

**A**: Polling-based detection of updated facts.

**Process**:
1. **Ingest initial fact**: "Status: INITIAL"
2. **Verify initial state**: Query returns "INITIAL"
3. **Ingest update**: "Status: UPDATED"
4. **Poll periodically**: Query every 30s
5. **Detect update**: First query returning "UPDATED"
6. **Measure time-to-truth**: Elapsed time from step 3 to step 5

**Detection Method**:
```python
def poll_until_updated(question, expected_value, poll_interval=30):
    start_time = time.time()

    for attempt in range(max_attempts):
        result = adapter.query(question, k=10)

        if expected_value in result.results[0].content:
            elapsed = time.time() - start_time
            return FreshnessResult(found=True, time_to_truth=elapsed)

        time.sleep(poll_interval)

    return FreshnessResult(found=False, time_to_truth=None)
```

**Polling Interval**: 30 seconds (configurable)

**Interpretation**:
- **Measured time**: Upper bound on actual time-to-truth
- **Actual time**: May be up to 30s less than measured
- **Example**: If consolidation completes at t=10s, first poll at t=30s measures 30s

**Why Not Continuous Polling**:
- Hammers server unnecessarily
- 30s granularity is sufficient for system-level benchmarking

See: [METHODOLOGY.md Section C](./METHODOLOGY.md#c-freshness-benchmark)

---

### Q: Why do you use namespaces?

**A**: To isolate queries and prevent cross-contamination.

**Problem Without Namespaces** (MS MARCO example):
```
Query 1: "What is Python?" → Ingests 10 passages about Python
Query 2: "What is Java?" → Ingests 10 passages about Java

Without isolation:
  Query 2 searches across 20 passages (10 Python + 10 Java)
  → Incorrect! Should only search 10 Java passages

With namespaces:
  Query 1 → namespace: "msmarco_q001" → 10 Python passages
  Query 2 → namespace: "msmarco_q002" → 10 Java passages
  → Correct! Each query searches only its own 10 passages
```

**Implementation**:
```python
for query in queries:
    namespace = f"msmarco_q{query.id}"

    # Ingest passages for this query only
    kp_adapter.ingest_documents(passages, namespace=namespace)

    # Query with namespace filter
    result = kp_adapter.query(question, namespace=namespace, k=10)
```

**Why This Matters**:
- MS MARCO is a passage ranking task (rank 10 passages per query)
- Each query should only access its 10 candidate passages
- Without isolation, would mix passages across queries

**Note**: Vector baseline reinitializes for each query (inherent isolation)

See: [METHODOLOGY.md Section E](./METHODOLOGY.md#e-passage-ranking-ms-marco)

---

### Q: Can I test my own data?

**A**: Yes! Extend the benchmark suite.

**Option 1: Custom Dataset**

Implement your own benchmark following the pattern:

```python
from kp_adapter import HTTPKnowledgePlaneAdapter
from vector_baseline import VectorBaseline

# 1. Load your data
questions = load_my_questions()

# 2. Initialize systems
kp = HTTPKnowledgePlaneAdapter()
kp.initialize(mcp_url, api_key, workspace_id, user_id)

baseline = VectorBaseline()

# 3. Ingest documents
kp.ingest_documents(my_documents, namespace="my_test")
baseline.ingest_documents(my_documents)

# 4. Run queries
for q in questions:
    kp_answer, kp_latency = kp.query(q.question, namespace="my_test")
    baseline_answer, baseline_latency = baseline.query(q.question)

    # Compute metrics
    kp_em = compute_exact_match(kp_answer, q.ground_truth)
    baseline_em = compute_exact_match(baseline_answer, q.ground_truth)
```

**Option 2: Use Existing Benchmarks with Custom Documents**

Replace dataset loading with your own:

```python
# Modify bench_hotpotqa.py
def load_dataset(self):
    # Replace HuggingFace loading with your data
    questions = load_my_data()
    return [
        {
            'id': q.id,
            'question': q.question,
            'answer': q.answer,
            'context': q.documents  # Your documents here
        }
        for q in questions
    ]
```

**Requirements for Your Data**:
- Questions with ground truth answers
- Context documents (passages or facts)
- Consistent format (JSON or CSV)

**Example**: Test on internal company documentation, legal documents, medical records, etc.

See: Benchmark implementations for templates

---

### Q: What if I don't have a KP server?

**A**: Use mock mode for local testing.

**Mock Mode** (no server required):
```bash
python bench_hotpotqa.py --n 20 --mock_kp --run_vector true
```

**What Mock Adapter Does**:
- Simulates KP behavior in-memory
- Splits documents into sentence-level facts
- Creates sequential relations between facts
- Uses simple keyword matching for search

**Limitations**:
- Not real KP (doesn't test actual graph extraction)
- Simpler fact extraction (sentence splitting only)
- No background consolidation
- No real embeddings (random vectors)

**Use Cases**:
- Testing benchmark code without KP server
- CI/CD pipelines
- Quick experimentation
- Understanding benchmark flow

**Recommendation**: Use mock mode for development, real KP for evaluation

See: `kp_adapter.py` - `MockKnowledgePlaneAdapter` class

---

### Q: How do I cite this benchmark?

**A**: Use this format.

**BibTeX**:
```bibtex
@misc{knowledgeplane-benchmarks-2024,
  title={KnowledgePlane Benchmark Suite: Multi-Hop Reasoning and Passage Ranking},
  author={{KnowledgePlane Contributors}},
  year={2024},
  howpublished={\url{https://github.com/knowledgeplane/benchmarks}},
  note={Version 1.0}
}
```

**APA**:
```
KnowledgePlane Contributors. (2024). KnowledgePlane Benchmark Suite: Multi-Hop
Reasoning and Passage Ranking. https://github.com/knowledgeplane/benchmarks
```

**Chicago**:
```
KnowledgePlane Contributors. "KnowledgePlane Benchmark Suite: Multi-Hop Reasoning
and Passage Ranking." GitHub repository, 2024.
https://github.com/knowledgeplane/benchmarks.
```

**Inline Citation** (for blog posts):
```
We benchmarked KP using the official KnowledgePlane Benchmark Suite [1].

[1] https://github.com/knowledgeplane/benchmarks
```

---

### Q: Where can I get help?

**A**: Multiple support channels available.

**GitHub Issues** (preferred):
- https://github.com/knowledgeplane/benchmarks/issues
- Tag with: `question`, `bug`, `methodology`, or `help-wanted`

**Documentation**:
- [METHODOLOGY.md](./METHODOLOGY.md) - Detailed methodology
- [LIMITATIONS.md](./LIMITATIONS.md) - Known issues
- [EXAMPLE_CASE_STUDY.md](./EXAMPLE_CASE_STUDY.md) - Worked example
- [README.md](../README.md) - Quick start guide

**Common Issues**:
- "ModuleNotFoundError: No module named 'datasets'": Run `pip install -r requirements.txt`
- "Connection refused to localhost:8080": Start KP MCP server first
- "CUDA out of memory": Use CPU-only mode (default)

**Before Asking**:
1. Check FAQ (this document)
2. Search existing GitHub issues
3. Review error logs in `output/` directory

---

## Advanced Questions

### Q: How sensitive are results to hyperparameters?

**A**: Moderate sensitivity, especially chunk size and top-k.

**Chunk Size** (vector baseline):
- Tested: 256, 512, 1024 tokens
- Impact: Larger chunks → more context but noisier retrieval
- Recommendation: 512 (default, balances precision/recall)

**Chunk Overlap**:
- Tested: 0, 64, 128, 256 tokens
- Impact: More overlap → more redundant chunks but preserves context at boundaries
- Recommendation: 128 (25% overlap)

**Top-k**:
- Tested: k=1, 3, 5, 10, 20
- Impact: Higher k → more context but more noise
- Recommendation: k=5 (standard in QA literature)

**Embedding Model** (vector baseline):
- Tested: all-MiniLM-L6-v2 (384-dim), all-mpnet-base-v2 (768-dim)
- Impact: Larger model → better quality but slower
- Recommendation: all-MiniLM-L6-v2 (fast, good quality)

**Sensitivity Analysis** (planned future work):
- Ablation study varying one parameter at a time
- Report performance across parameter ranges

---

### Q: What about multilingual benchmarks?

**A**: Not currently supported, planned for future.

**Current Limitation**: English-only
- HotpotQA: English Wikipedia
- MS MARCO: English queries

**Why Not Multilingual**:
- Sentence-transformers model is English-optimized
- No multilingual QA datasets integrated yet

**Future Work**:
- Add multilingual sentence-transformers (e.g., multilingual-MiniLM)
- Integrate multilingual datasets (e.g., XQuAD, MLQA)
- Test cross-lingual retrieval (query in language A, docs in language B)

**Workaround**:
- Replace sentence-transformers model with multilingual version
- Provide your own multilingual dataset

---

### Q: How do you handle ties in ranking?

**A**: Ties are broken by document ID (lexicographic order).

**Example**:
```
Query: "What is Python?"

Results with same score:
  [Score: 0.85] Doc A: "Python is a programming language..."
  [Score: 0.85] Doc B: "Python is a snake..."

Ranking: [Doc A, Doc B] (IDs sorted alphabetically)
```

**Impact**: Minimal (ties are rare with cosine similarity)

**Alternative**: Could use secondary score (e.g., doc length, freshness)

---

### Q: What about prompt engineering?

**A**: Not applicable - benchmarks use extractive methods.

**Current**: No LLM prompts (extractive heuristic only)

**Future**: If adding generative mode, will use standardized prompt:
```
Based on the following context, answer the question concisely.

Context:
{context}

Question: {question}

Answer:
```

**Why Standardize**: Avoid prompt engineering as confounding variable

---

## Troubleshooting

### Q: "FAISS error: cannot allocate memory"

**A**: Reduce corpus size or use quantization.

**Solutions**:
1. **Reduce n**: Test with fewer questions (e.g., n=20 instead of n=500)
2. **Use quantization**: FAISS IndexIVFFlat with quantization (reduces RAM)
3. **Increase RAM**: Use machine with more RAM
4. **Use CPU-only FAISS**: Avoid GPU FAISS if running out of GPU memory

---

### Q: "Benchmark is too slow"

**A**: Optimize embedding generation and reduce sample size.

**Optimizations**:
1. **Batch embedding**: Encode multiple texts at once (already implemented)
2. **Cache embeddings**: Save embeddings to disk, reload on next run
3. **Use smaller model**: Switch from all-mpnet (768-dim) to all-MiniLM (384-dim)
4. **Reduce n**: Start with n=20, scale up if needed
5. **Use mock mode**: Skip KP server entirely

---

### Q: "Results differ from blog post"

**A**: Check version, sample size, and random seed.

**Common Causes**:
1. **Different n**: Blog used n=100, you used n=20
2. **Different seed**: Random sampling with different seed
3. **Different version**: Code updated since blog post
4. **Different hardware**: Latency varies by machine

**How to Match**:
```bash
python bench_hotpotqa.py --n 100 --seed 42 --sample-method random
```

---

## Contact

**Still have questions?**

- **GitHub Issues**: https://github.com/knowledgeplane/benchmarks/issues (preferred)
- **Tag**: Use `question` or `faq` tags
- **Documentation**: Read [METHODOLOGY.md](./METHODOLOGY.md) for details

---

**Document Version**: 1.0
**Last Updated**: 2026-02-12
**Authors**: KnowledgePlane Benchmark Suite Contributors
