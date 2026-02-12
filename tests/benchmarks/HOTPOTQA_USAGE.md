# HotpotQA Benchmark Usage Guide

## Overview

The HotpotQA benchmark evaluates multi-hop reasoning capabilities by comparing KnowledgePlane's graph-native approach against a vector baseline on questions requiring multiple reasoning steps.

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
python bench_hotpotqa.py --n 20 --mock_kp

# Full run with real KP server
python bench_hotpotqa.py --n 50 --run_kp true --run_vector true

# KP only (faster)
python bench_hotpotqa.py --n 100 --run_kp true --run_vector false

# Vector baseline only
python bench_hotpotqa.py --n 100 --run_kp false --run_vector true
```

## Command-Line Arguments

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--n` | int | 20 | Number of questions to evaluate |
| `--top_k` | int | 5 | Number of documents to retrieve per query |
| `--seed` | int | 42 | Random seed for reproducibility |
| `--run_kp` | bool | true | Run KnowledgePlane system |
| `--run_vector` | bool | true | Run vector baseline system |
| `--mock_kp` | flag | false | Use mock KP adapter (no server required) |
| `--output_dir` | str | output | Directory for output files |

## How It Works

### 1. Dataset Loading

The benchmark loads the HotpotQA dataset (distractor setting) from HuggingFace:

```python
dataset = load_dataset("hotpot_qa", "distractor", split="validation")
```

Each question has:
- **Question**: The question to answer
- **Answer**: Ground truth answer
- **Context**: List of [title, sentences] providing background
- **Supporting facts**: Which sentences are needed to answer
- **Type**: Question type (bridge, comparison)
- **Level**: Difficulty level (easy, medium, hard)

### 2. Document Preparation

For each question, the benchmark:
1. Extracts all context documents (title + sentences)
2. Concatenates sentences for each title into a single document
3. Deduplicates documents across questions
4. Creates document objects ready for ingestion

Example context transformation:
```
Input:  [["Paris", ["Paris is the capital.", "It has 2M people."]],
         ["France", ["France is in Europe."]]]

Output: [
  {"content": "Paris is the capital. It has 2M people.", "metadata": {"title": "Paris"}},
  {"content": "France is in Europe.", "metadata": {"title": "France"}}
]
```

### 3. System Ingestion

**KnowledgePlane:**
- Documents ingested via `files_upload` MCP tool
- Facts extracted automatically by KP
- Relations created between related facts
- Stored in unique namespace (e.g., `hotpotqa_1234567890`)

**Vector Baseline:**
- Documents chunked into 512-token segments with 128-token overlap
- Chunks embedded using local sentence-transformers model
- Embeddings indexed in FAISS for fast retrieval
- No graph structure - flat vector space

### 4. Question Evaluation

For each question, both systems:
1. **Retrieve**: Search for top-k relevant documents/facts
2. **Extract**: Extract answer from retrieved content
3. **Score**: Compare against ground truth using EM and F1

**KP retrieval:**
```python
result = kp_adapter.query(
    question="Who is the director of...",
    namespace="hotpotqa_123",
    k=5,
    search_mode="hybrid"
)
```

**Vector retrieval:**
```python
answer = vector_baseline.query(
    question="Who is the director of...",
    k=5,
    mode="extractive"
)
```

### 5. Scoring Metrics

**Exact Match (EM):**
- Normalize both prediction and ground truth (lowercase, remove articles/punctuation)
- Return 1.0 if they match exactly, 0.0 otherwise
- Strict metric - requires perfect match

**Token F1:**
- Tokenize normalized answers
- Compute precision: `overlap / len(prediction_tokens)`
- Compute recall: `overlap / len(ground_truth_tokens)`
- Compute F1: `2 * precision * recall / (precision + recall)`
- Softer metric - gives partial credit

Example:
```
Ground truth: "The Eiffel Tower"
Prediction:   "Eiffel Tower in Paris"

Normalization:
  GT:   "eiffel tower"
  Pred: "eiffel tower paris"

Token overlap: ["eiffel", "tower"]
Precision: 2/3 = 0.667
Recall:    2/2 = 1.000
F1:        2 * 0.667 * 1.0 / (0.667 + 1.0) = 0.800
EM:        0.0 (not exact match)
```

## Output Files

### hotpotqa_results.csv

Per-question results with all metrics:

```csv
question_id,question,ground_truth,kp_answer,kp_em,kp_f1,kp_latency_ms,vector_answer,vector_em,vector_f1,vector_latency_ms,error
5a8b57f25542995d1e6f1371,Who is the director...,John Smith,John Smith,1.0000,1.0000,234.56,The director John Smith,0.0000,0.6667,123.45,
```

### hotpotqa_summary.json

Aggregate metrics by system:

```json
{
  "kp": {
    "avg_em": 0.45,
    "avg_f1": 0.67,
    "avg_latency_ms": 234.5,
    "questions_evaluated": 20,
    "questions_answered": 19,
    "errors": 1
  },
  "vector": {
    "avg_em": 0.30,
    "avg_f1": 0.52,
    "avg_latency_ms": 156.3,
    "questions_evaluated": 20,
    "questions_answered": 20,
    "errors": 0
  },
  "improvement": {
    "em_delta": 0.15,
    "f1_delta": 0.15,
    "em_percent_change": 50.0,
    "f1_percent_change": 28.8
  },
  "config": {
    "n_questions": 20,
    "top_k": 5,
    "seed": 42,
    "run_kp": true,
    "run_vector": true,
    "mock_kp": false
  }
}
```

## Understanding Results

### Success Criteria

KnowledgePlane demonstrates superior multi-hop reasoning if:
- EM improvement > 10 percentage points
- F1 improvement > 15 percentage points
- Latency is comparable (<2x difference)

### Sample Output

```
============================================================
HotpotQA Benchmark Results
============================================================

KnowledgePlane:
  Exact Match:    45.0%
  F1 Score:       67.2%
  Avg Latency:    234ms
  Questions:      19/20

Vector Baseline:
  Exact Match:    30.0%
  F1 Score:       52.1%
  Avg Latency:    156ms
  Questions:      20/20

Improvement:
  EM:             +15.0 percentage points (+50.0%)
  F1:             +15.1 percentage points (+28.9%)

✓ KP demonstrates superior multi-hop reasoning!
============================================================
```

### Interpreting Metrics

**High EM, High F1:**
- System is accurately extracting precise answers
- Good for factoid questions

**Low EM, High F1:**
- System is finding relevant information but not exact phrasing
- May need better answer extraction

**High EM, Low F1:**
- Unusual - indicates exact matches but poor partial matches
- May indicate lucky guesses or limited coverage

**Low EM, Low F1:**
- System is struggling to find relevant information
- May need better retrieval or ingestion

## Troubleshooting

### KP Connection Issues

```bash
# Test MCP connectivity
curl -X POST $KP_API_URL/tools/list \
  -H "Authorization: Bearer $KP_API_KEY" \
  -H "Content-Type: application/json"

# Use mock mode for testing without server
python bench_hotpotqa.py --n 10 --mock_kp
```

### Memory Issues

```bash
# Reduce dataset size
python bench_hotpotqa.py --n 10

# Reduce retrieval size
python bench_hotpotqa.py --n 20 --top_k 3
```

### Slow Performance

```bash
# Run KP only (skip vector baseline)
python bench_hotpotqa.py --n 50 --run_vector false

# Use smaller embedding model (edit vector_baseline.py)
# Change: embedding_model="sentence-transformers/all-MiniLM-L6-v2"
# To:     embedding_model="sentence-transformers/paraphrase-MiniLM-L3-v2"
```

### Dataset Download Issues

```bash
# Pre-download dataset
python -c "from datasets import load_dataset; load_dataset('hotpot_qa', 'distractor', split='validation')"

# Use cached dataset (automatically used after first download)
# Location: ~/.cache/huggingface/datasets/
```

## Advanced Usage

### Custom Evaluation

```python
from bench_hotpotqa import HotpotQABenchmark

# Create benchmark with custom config
benchmark = HotpotQABenchmark(
    n_questions=100,
    top_k=10,
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
    print(f"{result.question}: KP F1={result.kp_f1}, Vector F1={result.vector_f1}")
```

### Batch Processing

```bash
# Run multiple seeds for statistical significance
for seed in 42 43 44 45 46; do
    python bench_hotpotqa.py --n 50 --seed $seed --output_dir output_seed_$seed
done

# Aggregate results
python -c "
import json
from pathlib import Path

results = []
for p in Path('output_seed_*').glob('hotpotqa_summary.json'):
    with open(p) as f:
        results.append(json.load(f))

# Compute mean and std
import numpy as np
kp_ems = [r['kp']['avg_em'] for r in results]
print(f'KP EM: {np.mean(kp_ems):.3f} ± {np.std(kp_ems):.3f}')
"
```

### Filtering by Question Type

```python
from bench_hotpotqa import HotpotQABenchmark

benchmark = HotpotQABenchmark(n_questions=100)
questions = benchmark.load_dataset()

# Filter by type
bridge_questions = [q for q in questions if q['type'] == 'bridge']
comparison_questions = [q for q in questions if q['type'] == 'comparison']

# Filter by difficulty
easy_questions = [q for q in questions if q['level'] == 'easy']
hard_questions = [q for q in questions if q['level'] == 'hard']
```

## Implementation Details

### Answer Extraction

The benchmark uses a simple extractive approach for both systems:
1. Retrieve top-k documents/facts
2. Concatenate top-3 results
3. Extract first sentence as answer

**Note**: This is intentionally simple to ensure fair comparison. Both systems use the same extraction logic. For production use, you'd want:
- Named entity recognition
- Keyword matching
- QA model (BERT, etc.)
- LLM-based extraction

### Namespace Isolation

Each benchmark run uses a unique namespace (timestamp-based) to ensure:
- No cross-contamination between runs
- Reproducible results
- Easy cleanup

KP stores namespace in fact metadata:
```python
metadata = {
    'namespace': 'hotpotqa_1707728400',
    'title': 'Paris',
    'source': 'hotpotqa'
}
```

Vector baseline doesn't have native namespaces, so we ingest all documents into the same index. For true isolation, create separate VectorBaseline instances.

## Next Steps

### Improvements

1. **Better answer extraction**: Use NER or QA models
2. **Graph traversal**: Leverage KP's relations for multi-hop
3. **Confidence scores**: Track answer confidence
4. **Error analysis**: Categorize failure modes
5. **Larger scale**: Run on full HotpotQA (100k+ questions)

### Additional Metrics

- **Retrieval precision**: How many retrieved docs are supporting facts?
- **Retrieval recall**: What % of supporting facts were retrieved?
- **Answer diversity**: How many unique answers were generated?
- **Hop count**: Did answer require 1, 2, or 3+ hops?

### Integration with CI/CD

```yaml
# .github/workflows/benchmark.yml
name: HotpotQA Benchmark
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
          python bench_hotpotqa.py --n 20 --mock_kp
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: benchmark-results
          path: tests/benchmarks/output/
```

## References

- **HotpotQA Paper**: https://arxiv.org/abs/1809.09600
- **Dataset**: https://hotpotqa.github.io/
- **Evaluation Code**: Based on official HotpotQA eval script
- **SQuAD Metrics**: https://rajpurkar.github.io/SQuAD-explorer/

## Support

For issues or questions:
1. Check logs in console output
2. Review output CSV for individual failures
3. Open issue on GitHub with summary JSON attached
4. Include environment details (Python version, OS, dependencies)
