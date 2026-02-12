# MS MARCO Passage Ranking Benchmark Usage Guide

## Overview

The MS MARCO (Microsoft MAchine Reading COmprehension) benchmark evaluates passage retrieval quality by comparing KnowledgePlane's graph-native approach against a vector baseline on single-hop ranking tasks.

**Key Differences from HotpotQA:**
- **Single-hop**: Questions require only one passage (vs multi-hop reasoning)
- **Ranking-focused**: Tests quality of passage ordering (vs answer extraction)
- **Different metrics**: Uses MRR, Recall@k, NDCG@k (vs EM, F1)

## Quick Start

### 1. Install Dependencies

```bash
cd tests/benchmarks
pip install -r requirements-bench.txt
```

### 2. Set Environment Variables

```bash
# For KP (if using real server)
export KP_API_URL=http://localhost:8080/mcp
export KP_API_KEY=benchmark-api-key-12345
export KP_WORKSPACE_ID=benchmark-workspace
export KP_USER_ID=benchmark-user

# For embeddings (vector baseline uses local by default)
# export OPENAI_API_KEY=sk-...  # Optional, for OpenAI embeddings
```

### 3. Run Benchmark

```bash
# Small test with mock KP (no server needed)
python bench_msmarco.py --n 20 --k 10 --mock_kp

# Full run with real KP server
python bench_msmarco.py --n 100 --k 10 --run_kp true --run_vector true

# KP only (faster)
python bench_msmarco.py --n 50 --k 10 --run_kp true --run_vector false

# Vector baseline only
python bench_msmarco.py --n 50 --k 10 --run_kp false --run_vector true
```

## Command-Line Arguments

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--n` | int | 100 | Number of queries to evaluate |
| `--k` | int | 10 | Number of passages to retrieve (for Recall@k, NDCG@k) |
| `--seed` | int | 42 | Random seed for reproducibility |
| `--run_kp` | bool | true | Run KnowledgePlane system |
| `--run_vector` | bool | true | Run vector baseline system |
| `--mock_kp` | flag | false | Use mock KP adapter (no server required) |
| `--output_dir` | str | output | Directory for output files |

## How It Works

### 1. Dataset Loading

The benchmark loads the MS MARCO passage ranking dataset (v2.1) from HuggingFace:

```python
dataset = load_dataset("ms_marco", "v2.1", split="validation")
```

Each query has:
- **Query**: The search query string
- **Passages**: List of candidate passages
- **Is_selected**: Binary relevance label (0 or 1) for each passage

Example query:
```json
{
  "query": "what is the capital of france",
  "passages": [
    {"passage_text": "Paris is the capital city of France...", "is_selected": 1},
    {"passage_text": "France is located in Western Europe...", "is_selected": 0},
    {"passage_text": "The Eiffel Tower is in Paris...", "is_selected": 0}
  ]
}
```

### 2. Document Preparation

For each query, the benchmark:
1. Extracts all passages associated with the query
2. Marks relevant passages (is_selected=1)
3. Creates passage documents ready for ingestion
4. Maintains query isolation by using query-specific namespaces

Example transformation:
```python
passages = [
  {
    "content": "Paris is the capital city of France...",
    "metadata": {
      "passage_id": "passage_0_0",
      "query_id": "0",
      "is_relevant": True,
      "source": "msmarco"
    }
  }
]
```

### 3. System Ingestion

**KnowledgePlane:**
- Passages ingested via `files_upload` MCP tool
- Facts extracted automatically by KP
- Relations created between related facts
- Stored in query-specific namespace (e.g., `msmarco_1234567890_q0`)

**Vector Baseline:**
- Passages chunked into 512-token segments with 128-token overlap
- Chunks embedded using local sentence-transformers model
- Embeddings indexed in FAISS for fast retrieval
- Separate index per query for isolation

### 4. Passage Ranking

For each query, both systems:
1. **Retrieve**: Search for top-k relevant passages
2. **Rank**: Order passages by relevance score
3. **Evaluate**: Compare ranking against ground truth using metrics

**KP ranking:**
```python
result = kp_adapter.query(
    question="what is the capital of france",
    namespace="msmarco_123_q0",
    k=10,
    search_mode="hybrid"
)
# Extract passage IDs from results (sorted by relevance)
ranked_ids = [r.metadata['passage_id'] for r in result.results]
```

**Vector ranking:**
```python
query_embedding = vector_baseline._embed_texts([query])[0]
retrieved = vector_baseline._retrieve(query_embedding, k=10)
# Extract unique passage IDs (in ranking order)
ranked_ids = [r.chunk.doc_id for r in retrieved]
```

### 5. Ranking Metrics

#### Mean Reciprocal Rank (MRR)

MRR measures how high the first relevant passage appears in the ranking.

**Formula**: `MRR = 1 / rank_of_first_relevant_passage`

**Example**:
```
Ranking: [P1, P2, P3, P4, P5]
Relevant: {P3}

First relevant at rank 3
MRR = 1/3 = 0.333
```

**Range**: 0.0 to 1.0 (higher is better)
- MRR = 1.0: First result is relevant (perfect)
- MRR = 0.5: Second result is relevant
- MRR = 0.0: No relevant results

#### Recall@k

Recall@k measures the fraction of relevant passages found in the top k results.

**Formula**: `Recall@k = |relevant_in_top_k| / |total_relevant|`

**Example**:
```
Top 10: [P1, P2, P3, P4, P5, P6, P7, P8, P9, P10]
Relevant: {P3, P7, P15}

Found in top 10: {P3, P7} = 2 passages
Total relevant: 3 passages
Recall@10 = 2/3 = 0.667
```

**Range**: 0.0 to 1.0 (higher is better)
- Recall@10 = 1.0: All relevant passages in top 10
- Recall@10 = 0.0: No relevant passages in top 10

#### NDCG@k (Normalized Discounted Cumulative Gain)

NDCG@k considers both relevance and ranking position with logarithmic discount. Better rankings of relevant passages score higher.

**Formula**:
```
DCG@k = Σ(i=1 to k) (2^relevance_i - 1) / log2(i + 1)
IDCG@k = DCG@k with perfect ranking
NDCG@k = DCG@k / IDCG@k
```

**Example**:
```
Ranking: [P1(0), P2(1), P3(0), P4(1), P5(0)]
         rel=0   rel=1   rel=0   rel=1   rel=0

DCG@5 = (2^0-1)/log2(2) + (2^1-1)/log2(3) + ... = 1.262

Ideal: [P2(1), P4(1), P1(0), P3(0), P5(0)]
IDCG@5 = (2^1-1)/log2(2) + (2^1-1)/log2(3) + ... = 1.631

NDCG@5 = 1.262 / 1.631 = 0.774
```

**Range**: 0.0 to 1.0 (higher is better)
- NDCG@10 = 1.0: Perfect ranking of all relevant passages
- NDCG@10 = 0.0: No relevant passages retrieved

## Output Files

### msmarco_results.csv

Per-query results with all metrics:

```csv
query_id,query,n_passages,n_relevant,kp_mrr,kp_recall_at_k,kp_ndcg_at_k,kp_latency_ms,vector_mrr,vector_recall_at_k,vector_ndcg_at_k,vector_latency_ms,error
0,what is capital of france,10,2,1.0000,1.0000,1.0000,234.56,0.5000,0.5000,0.6309,123.45,
1,who invented the telephone,8,1,0.3333,1.0000,0.5000,245.67,0.2500,1.0000,0.4307,134.56,
```

### msmarco_summary.json

Aggregate metrics by system:

```json
{
  "kp": {
    "avg_mrr": 0.7234,
    "avg_recall_at_k": 0.8456,
    "avg_ndcg_at_k": 0.8012,
    "avg_latency_ms": 245.3,
    "queries_evaluated": 100,
    "queries_answered": 98,
    "errors": 2
  },
  "vector": {
    "avg_mrr": 0.6512,
    "avg_recall_at_k": 0.7823,
    "avg_ndcg_at_k": 0.7234,
    "avg_latency_ms": 156.8,
    "queries_evaluated": 100,
    "queries_answered": 100,
    "errors": 0
  },
  "improvement": {
    "mrr_delta": 0.0722,
    "recall_delta": 0.0633,
    "ndcg_delta": 0.0778,
    "mrr_percent_change": 11.1,
    "recall_percent_change": 8.1,
    "ndcg_percent_change": 10.8
  },
  "config": {
    "n_queries": 100,
    "k": 10,
    "seed": 42,
    "run_kp": true,
    "run_vector": true,
    "mock_kp": false
  }
}
```

## Understanding Results

### Success Criteria

KnowledgePlane demonstrates superior passage ranking if:
- MRR improvement > 0.05 (5%)
- Recall@k improvement > 0.05 (5%)
- NDCG@k improvement > 0.05 (5%)
- Latency is comparable (<2x difference)

### Sample Output

```
============================================================
MS MARCO Passage Ranking Benchmark Results
============================================================

KnowledgePlane:
  MRR:            0.7234
  Recall@10:      0.8456
  NDCG@10:        0.8012
  Avg Latency:    245ms
  Queries:        98/100

Vector Baseline:
  MRR:            0.6512
  Recall@10:      0.7823
  NDCG@10:        0.7234
  Avg Latency:    157ms
  Queries:        100/100

Improvement:
  MRR:            +0.0722 (+11.1%)
  Recall@10:      +0.0633 (+8.1%)
  NDCG@10:        +0.0778 (+10.8%)

✓ KP demonstrates superior passage ranking!
============================================================
```

### Interpreting Metrics

**High MRR, High Recall@k:**
- System is finding relevant passages early in ranking
- Good for search applications

**Low MRR, High Recall@k:**
- System finds all relevant passages but ranks them low
- May need better ranking signals

**High MRR, Low Recall@k:**
- System finds first relevant passage but misses others
- May need to retrieve more broadly

**High NDCG, High MRR:**
- System produces well-ordered rankings
- Best overall performance

**MS MARCO vs HotpotQA Metrics:**

| Metric | MS MARCO | HotpotQA |
|--------|----------|----------|
| Primary | MRR, NDCG@10 | EM, F1 |
| Focus | Ranking quality | Answer accuracy |
| Task | Single-hop retrieval | Multi-hop reasoning |
| Gold standard | Relevant passages | Exact answer text |

## Troubleshooting

### Dataset Issues

```bash
# Pre-download dataset (MS MARCO v2.1 is large)
python -c "from datasets import load_dataset; load_dataset('ms_marco', 'v2.1', split='validation')"

# Use smaller sample for testing
python bench_msmarco.py --n 10 --mock_kp

# Check dataset cache
ls ~/.cache/huggingface/datasets/ms_marco/
```

### KP Connection Issues

```bash
# Test MCP connectivity
curl -X POST $KP_API_URL/tools/list \
  -H "Authorization: Bearer $KP_API_KEY" \
  -H "Content-Type: application/json"

# Use mock mode for testing without server
python bench_msmarco.py --n 10 --mock_kp
```

### Memory Issues

```bash
# Reduce dataset size
python bench_msmarco.py --n 20

# Reduce retrieval size
python bench_msmarco.py --n 50 --k 5

# Process queries in smaller batches (edit script to add batching)
```

### Slow Performance

```bash
# Run KP only (skip vector baseline)
python bench_msmarco.py --n 100 --run_vector false

# Use smaller embedding model (edit vector_baseline.py)
# Change: embedding_model="sentence-transformers/all-MiniLM-L6-v2"
# To:     embedding_model="sentence-transformers/paraphrase-MiniLM-L3-v2"

# Reduce k value
python bench_msmarco.py --n 100 --k 5
```

## Advanced Usage

### Custom Evaluation

```python
from bench_msmarco import MSMARCOBenchmark

# Create benchmark with custom config
benchmark = MSMARCOBenchmark(
    n_queries=200,
    k=20,
    seed=123,
    run_kp=True,
    run_vector=True,
    mock_kp=False,
    output_dir="custom_output"
)

# Run and get results
summary = benchmark.run_benchmark()

# Access individual results
for result in benchmark.results:
    print(f"Query {result.query_id}: KP MRR={result.kp_mrr}, Vector MRR={result.vector_mrr}")
```

### Batch Processing

```bash
# Run multiple seeds for statistical significance
for seed in 42 43 44 45 46; do
    python bench_msmarco.py --n 100 --seed $seed --output_dir output_seed_$seed
done

# Aggregate results
python -c "
import json
from pathlib import Path
import numpy as np

results = []
for p in Path('output_seed_*').glob('msmarco_summary.json'):
    with open(p) as f:
        results.append(json.load(f))

# Compute mean and std
kp_mrrs = [r['kp']['avg_mrr'] for r in results]
vector_mrrs = [r['vector']['avg_mrr'] for r in results]

print(f'KP MRR:     {np.mean(kp_mrrs):.4f} ± {np.std(kp_mrrs):.4f}')
print(f'Vector MRR: {np.mean(vector_mrrs):.4f} ± {np.std(vector_mrrs):.4f}')
"
```

### Varying k Values

```bash
# Test different k values to see ranking consistency
for k in 5 10 20 50; do
    python bench_msmarco.py --n 50 --k $k --output_dir output_k_$k
done
```

## Implementation Details

### Query Isolation

Each query uses a unique namespace to ensure:
- No cross-contamination between queries
- Independent evaluation
- Reproducible results

**KP namespace**: `msmarco_{timestamp}_q{query_id}`
**Vector baseline**: Separate VectorBaseline instance per query

### Passage ID Extraction

The benchmark extracts passage IDs from retrieval results to compute ranking metrics:

**KP**: Uses `metadata.passage_id` from retrieved facts
**Vector**: Uses `chunk.doc_id` from retrieved chunks

### Ranking vs Retrieval

**Retrieval**: Finding relevant passages (measured by Recall@k)
**Ranking**: Ordering passages by relevance (measured by MRR, NDCG@k)

Good retrieval + poor ranking = High Recall, Low MRR/NDCG
Poor retrieval + good ranking = Low Recall, High MRR if relevant found

## Comparison: MS MARCO vs HotpotQA

| Aspect | MS MARCO | HotpotQA |
|--------|----------|----------|
| **Task** | Passage ranking | Multi-hop QA |
| **Complexity** | Single-hop | Multi-hop (2+ steps) |
| **Evaluation** | Ranking metrics | Answer accuracy |
| **Primary Metric** | MRR | EM, F1 |
| **Secondary Metrics** | Recall@k, NDCG@k | Supporting facts |
| **Dataset Size** | 1M+ queries | 113k questions |
| **Gold Standard** | Relevant passages | Exact answers |
| **KP Advantage** | Semantic understanding | Graph traversal |
| **Use Case** | Search engines | Complex reasoning |

**When to use each:**

- **MS MARCO**: Test retrieval quality, search relevance, ranking algorithms
- **HotpotQA**: Test multi-hop reasoning, graph traversal, complex QA

## Next Steps

### Improvements

1. **Better ranking**: Use KP's relation strengths for ranking signals
2. **Query expansion**: Leverage KP's semantic understanding
3. **Passage re-ranking**: Use graph structure for re-ranking
4. **Cross-query learning**: Train on multiple queries
5. **Larger scale**: Run on full MS MARCO (1M+ queries)

### Additional Metrics

- **Precision@k**: Fraction of top-k that are relevant
- **MAP (Mean Average Precision)**: Average precision across all relevant passages
- **nDCG variants**: nDCG@1, nDCG@5, nDCG@20
- **Rank Biased Precision (RBP)**: User-focused ranking metric

### Integration with CI/CD

```yaml
# .github/workflows/benchmark.yml
name: MS MARCO Benchmark
on: [push]
jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run benchmark
        run: |
          cd tests/benchmarks
          pip install -r requirements-bench.txt
          python bench_msmarco.py --n 50 --k 10 --mock_kp
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: benchmark-results
          path: tests/benchmarks/output/
```

## References

- **MS MARCO Paper**: https://arxiv.org/abs/1611.09268
- **Dataset**: https://microsoft.github.io/msmarco/
- **Evaluation Code**: Based on official MS MARCO eval script
- **Ranking Metrics**: https://en.wikipedia.org/wiki/Evaluation_measures_(information_retrieval)

## Support

For issues or questions:
1. Check logs in console output
2. Review output CSV for individual failures
3. Open issue on GitHub with summary JSON attached
4. Include environment details (Python version, OS, dependencies)
