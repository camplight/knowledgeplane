# KnowledgePlane Benchmarking Suite

## Overview

This benchmarking suite evaluates KnowledgePlane's core advantages:

1. **Graph-native multi-hop reasoning**: Leveraging ArangoDB's graph structure to answer complex questions requiring multiple reasoning steps
2. **Active freshness**: Automatic consolidation and knowledge card generation from updated facts
3. **Hybrid search**: Combining full-text, vector, and graph-based retrieval

We compare KnowledgePlane against a controlled vector-RAG baseline (FAISS + simple chunking) to demonstrate measurable improvements in accuracy, latency, and freshness.

## What We're Benchmarking

### Benchmark 1: HotpotQA (Multi-Hop Reasoning)
**Purpose**: Prove graph-native reasoning beats flat vector retrieval on multi-hop questions

**Dataset**: HotpotQA (distractor setting) - questions requiring 2+ reasoning steps

**Systems**:
- KnowledgePlane (graph-native with relations)
- Vector Baseline (FAISS with simple chunking)

**Metrics**:
- Exact Match (EM)
- Token-level F1
- Query latency
- Retrieved document relevance

### Benchmark 2: MS MARCO (Passage Ranking)
**Purpose**: Evaluate core passage retrieval and ranking quality on single-hop queries

**Dataset**: MS MARCO (v2.1 validation) - passage ranking with relevance labels

**Systems**:
- KnowledgePlane (semantic understanding with relations)
- Vector Baseline (FAISS with chunking)

**Metrics**:
- Mean Reciprocal Rank (MRR)
- Recall@k
- NDCG@k (Normalized Discounted Cumulative Gain)
- Query latency

### Benchmark 3: Freshness (Time-to-Truth)
**Purpose**: Measure how quickly KnowledgePlane reflects updated information

**Test**: Inject a new fact, poll until system returns it

**Metrics**:
- Time-to-truth (seconds from injection to retrieval)
- Query consistency (% queries returning updated fact)

## Quick Start

### 1. Install Dependencies

```bash
cd tests/benchmarks
pip install -r requirements-bench.txt
```

### 2. Set Environment Variables

```bash
# Required for KnowledgePlane
export KP_API_URL=http://localhost:8080
export KP_WORKSPACE_ID=benchmark-workspace
export KP_USER_ID=benchmark-user
export KP_API_KEY=benchmark-api-key-12345

# Required for embeddings (used by both KP and baseline)
export OPENAI_API_KEY=sk-...

# Optional: For answer generation (if needed)
export ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run Benchmarks

```bash
# Run ALL benchmarks with a single command
python run_all.py --n-hotpot 20 --freshness-mode skip

# Run HotpotQA benchmark (20 questions, both systems)
python bench_hotpotqa.py --n 20 --run_kp true --run_vector true

# Run MS MARCO benchmark (100 queries, both systems)
python bench_msmarco.py --n 100 --k 10 --run_kp true --run_vector true

# Run MS MARCO with mock KP (no server needed)
python bench_msmarco.py --n 20 --k 10 --mock_kp

# Run freshness benchmark (manual mode)
python bench_freshness.py --mode manual

# Run freshness benchmark (automatic mode)
python bench_freshness.py --mode api
```

## Running All Benchmarks

The easiest way to run the complete suite is with `run_all.py`:

```bash
# Quick test with mock KP (no server needed)
python run_all.py --n-hotpot 20 --mock_kp --freshness-mode skip

# Full run with real KP server
export KP_API_URL=http://localhost:8080/mcp
export KP_API_KEY=your-api-key
export KP_WORKSPACE_ID=your-workspace
export KP_USER_ID=your-user

python run_all.py \
  --n-hotpot 50 \
  --run_kp \
  --run_vector \
  --freshness-mode manual

# Large-scale run (100 questions + API freshness)
python run_all.py \
  --n-hotpot 100 \
  --top_k 10 \
  --freshness-mode api \
  --poll_interval 30 \
  --max_attempts 20
```

### What run_all.py Does

1. Runs HotpotQA benchmark (graph vs vector)
2. Runs Freshness benchmark (time-to-truth)
3. Generates combined report with:
   - All metrics from both benchmarks
   - Success criteria evaluation
   - Recommendations for next steps
4. Saves all results to `output/` directory:
   - `hotpotqa_results.csv` - Per-question results
   - `hotpotqa_summary.json` - Aggregate metrics
   - `freshness_run.json` - Freshness timing data
   - `benchmark_report_<timestamp>.json` - Combined report

### Command-Line Options

```bash
python run_all.py [OPTIONS]

HotpotQA Options:
  --n-hotpot INT        Number of questions (default: 20)
  --top_k INT           Top-k retrieval (default: 5)
  --seed INT            Random seed (default: 42)
  --mock_kp             Use mock adapter (no server needed)
  --run_kp              Run KP system (default: true)
  --run_vector          Run vector baseline (default: true)

Freshness Options:
  --freshness-mode {skip,manual,api}
                        Freshness mode (default: skip)
  --poll_interval INT   Polling interval in seconds (default: 30)
  --max_attempts INT    Max polling attempts (default: 20)

KP Connection:
  --workspace_id ID     KP workspace ID (or $KP_WORKSPACE_ID)
  --user_id ID          KP user ID (or $KP_USER_ID)
  --api_key KEY         KP API key (or $KP_API_KEY)
```

### Example Output

```
============================================================
KNOWLEDGEPLANE BENCHMARKING SUITE - FINAL REPORT
============================================================

Run completed: 2026-02-12T15:30:45.123456
Configuration: n=20, mock_kp=False

1. HotpotQA (Multi-hop Reasoning)
------------------------------------------------------------
   KnowledgePlane:
     Exact Match: 65.0%
     F1 Score:    78.5%
     Avg Latency: 450ms
   Vector Baseline:
     Exact Match: 45.0%
     F1 Score:    62.3%
     Avg Latency: 320ms
   Improvement:
     EM: +20.0 pp
     F1: +16.2 pp
     SUCCESS: >10% EM improvement achieved!

2. Freshness (Time-to-Truth)
------------------------------------------------------------
   Time-to-Truth: 90.5s (1.51 minutes)
   Attempts: 3
   Rating: EXCELLENT (< 1 minute)

============================================================
Detailed results saved to:
   - output/hotpotqa_results.csv
   - output/hotpotqa_summary.json
   - output/freshness_run.json
============================================================

Combined report saved to: output/benchmark_report_20260212_153045.json

NEXT STEPS
------------------------------------------------------------
To expand this benchmarking suite:
  - LoCoMo: Long-context multi-hop reasoning
  - MemoryBench: Memory consistency and retrieval
  - RAGAS: Retrieval-Augmented Generation Assessment
  - Competitor integration: Mem0, Supermemory, etc.
  - Scale up: Run with --n-hotpot 100 or --n-hotpot 1000
============================================================
```

## How to Run Each Benchmark

### HotpotQA Multi-Hop Benchmark

**📚 See [HOTPOTQA_USAGE.md](HOTPOTQA_USAGE.md) for detailed usage guide**

```bash
python bench_hotpotqa.py [OPTIONS]

Options:
  --n              Number of questions to evaluate (default: 20)
  --run_kp         Run KnowledgePlane system (default: true)
  --run_vector     Run vector baseline (default: true)
  --top_k          Number of documents to retrieve (default: 5)
  --seed           Random seed for reproducibility (default: 42)
  --mock_kp        Use mock KP adapter (no server required)
  --output_dir     Output directory (default: output/)
```

**Example outputs**:
- `output/hotpotqa_results.csv` - Per-question results with EM, F1, latency
- `output/hotpotqa_summary.json` - Aggregate metrics by system

**Sample output**:
```json
{
  "kp": {
    "avg_em": 0.65,
    "avg_f1": 0.78,
    "avg_latency_ms": 450,
    "questions_evaluated": 20
  },
  "vector": {
    "avg_em": 0.45,
    "avg_f1": 0.62,
    "avg_latency_ms": 320,
    "questions_evaluated": 20
  }
}
```

### MS MARCO Passage Ranking Benchmark

**📚 See [MSMARCO_USAGE.md](docs/MSMARCO_USAGE.md) for detailed usage guide**

```bash
python bench_msmarco.py [OPTIONS]

Options:
  --n              Number of queries to evaluate (default: 100)
  --k              Number of passages to retrieve (default: 10)
  --run_kp         Run KnowledgePlane system (default: true)
  --run_vector     Run vector baseline (default: true)
  --seed           Random seed for reproducibility (default: 42)
  --mock_kp        Use mock KP adapter (no server required)
  --output_dir     Output directory (default: output/)
```

**Example outputs**:
- `output/msmarco_results.csv` - Per-query results with MRR, Recall@k, NDCG@k
- `output/msmarco_summary.json` - Aggregate ranking metrics

**Sample output**:
```json
{
  "kp": {
    "avg_mrr": 0.7234,
    "avg_recall_at_k": 0.8456,
    "avg_ndcg_at_k": 0.8012,
    "avg_latency_ms": 245,
    "queries_evaluated": 100
  },
  "vector": {
    "avg_mrr": 0.6512,
    "avg_recall_at_k": 0.7823,
    "avg_ndcg_at_k": 0.7234,
    "avg_latency_ms": 157,
    "queries_evaluated": 100
  },
  "improvement": {
    "mrr_delta": 0.0722,
    "recall_delta": 0.0633,
    "ndcg_delta": 0.0778
  }
}
```

**Metrics explained**:
- **MRR (Mean Reciprocal Rank)**: Position of first relevant passage (higher is better)
- **Recall@k**: Fraction of relevant passages in top k (higher is better)
- **NDCG@k**: Ranking quality with position discount (higher is better)

### Freshness Benchmark

```bash
python bench_freshness.py [OPTIONS]

Options:
  --mode {manual,api}      Test mode (default: manual)
  --poll_interval INT      Seconds between polls (default: 30)
  --max_attempts INT       Maximum polling attempts (default: 20)
  --workspace_id ID        KP workspace ID
  --user_id ID            KP user ID
  --api_key KEY           KP API key
  --output_dir DIR        Output directory (default: output/)
```

**Manual mode workflow**:
1. Script generates unique fact ID and prints instructions
2. User creates initial fact in KP (via webapp or MCP tool)
3. User updates the fact with new value
4. Script polls KP every 30s until updated value appears
5. Script records time-to-truth

**API mode workflow**:
1. Script generates unique fact ID
2. Script ingests initial fact programmatically
3. Script ingests updated fact
4. Script polls KP every 30s until updated value appears
5. Script records time-to-truth

**Success Criteria**:
- 🌟 **EXCELLENT**: < 1 minute
- ✅ **GOOD**: < 3 minutes
- ✓ **TARGET**: < 5 minutes
- ⚠️ **SLOW**: > 5 minutes

**Example output** (`output/freshness_run.json`):
```json
{
  "test_id": "123e4567-e89b-12d3-a456-426614174000",
  "mode": "api",
  "question": "What is the status of test fact 123e4567...?",
  "old_value": "INITIAL_2026-02-12T10:00:00.123456",
  "new_value": "UPDATED_2026-02-12T10:02:30.654321",
  "namespace": "freshness_bench",
  "found": true,
  "time_to_truth_seconds": 90.5,
  "attempts": 3,
  "poll_interval_seconds": 30,
  "max_attempts": 20,
  "started_at": "2026-02-12T10:02:30.654321",
  "completed_at": "2026-02-12T10:04:01.154321",
  "timestamps": [...]
}
```

**Demo** (no live KP required):
```bash
python demo_freshness.py
```

**Full documentation**: See `FRESHNESS_BENCHMARK.md`

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `KP_API_URL` | KnowledgePlane MCP endpoint | `http://localhost:8080` |
| `KP_WORKSPACE_ID` | Workspace ID for isolation | `benchmark-workspace` |
| `KP_USER_ID` | User ID for created_by fields | `benchmark-user` |
| `KP_API_KEY` | API key for authentication | `benchmark-api-key-12345` |
| `OPENAI_API_KEY` | OpenAI API key for embeddings | `sk-...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key for LLM calls | None |
| `KP_MCP_TRANSPORT` | MCP transport type | `sse` |
| `VECTOR_BASELINE_INDEX` | FAISS index file path | `output/faiss_index.bin` |
| `VECTOR_BASELINE_CHUNK_SIZE` | Chunk size for baseline | `512` |
| `VECTOR_BASELINE_CHUNK_OVERLAP` | Chunk overlap for baseline | `128` |

## Architecture

### Directory Structure

```
tests/benchmarks/
├── README.md                   # This file
├── requirements-bench.txt      # Python dependencies
├── .gitignore                  # Exclude output and cache
├── output/                     # Results directory
│   ├── .gitkeep
│   ├── hotpotqa_results.csv
│   ├── hotpotqa_summary.json
│   ├── msmarco_results.csv
│   ├── msmarco_summary.json
│   └── freshness_run.json
├── bench_hotpotqa.py          # HotpotQA benchmark script
├── bench_msmarco.py           # MS MARCO benchmark script
├── bench_freshness.py         # Freshness benchmark script
├── kp_adapter.py              # KnowledgePlane adapter interface
├── vector_baseline.py         # FAISS baseline implementation
├── run_all.py                 # Run all benchmarks
├── docs/                       # Documentation
│   ├── HOTPOTQA_USAGE.md      # HotpotQA guide
│   ├── MSMARCO_USAGE.md       # MS MARCO guide
│   ├── MSMARCO_QUICKREF.md    # MS MARCO quick reference
│   └── FRESHNESS_BENCHMARK.md # Freshness guide
├── demos/                      # Demo scripts
│   ├── demo_msmarco.py        # MS MARCO interactive demo
│   └── demo_freshness.py      # Freshness demo
└── tests/                      # Unit tests
    └── test_msmarco_metrics.py # MS MARCO metric tests
```

### Component Overview

#### `kp_adapter.py`
Provides clean interface to KnowledgePlane:
```python
from kp_adapter import KnowledgePlaneAdapter

adapter = KnowledgePlaneAdapter()
await adapter.initialize(config={
    "mcp_url": "http://localhost:8080/mcp",
    "api_key": "...",
    "workspace_id": "...",
    "user_id": "..."
})

# Ingest documents
result = await adapter.ingest_document({
    "filename": "doc.txt",
    "content": "Paris is the capital of France.",
    "mime_type": "text/plain"
})

# Query facts
results = await adapter.query_facts({
    "query": "What is the capital of France?",
    "k": 5,
    "search_mode": "hybrid"
})

# Get related facts (graph traversal)
relations = await adapter.get_related_facts(fact_id="fact_123")
```

#### `vector_baseline.py`
Provides comparable vector-RAG baseline:
```python
from vector_baseline import VectorBaseline

baseline = VectorBaseline()
await baseline.initialize(config={
    "embedding_model": "text-embedding-3-small",
    "chunk_size": 512,
    "chunk_overlap": 128,
    "index_path": "output/faiss_index.bin"
})

# Ingest documents
await baseline.ingest_documents([
    {"content": "Paris is the capital of France.", "metadata": {...}}
])

# Query
results = await baseline.query(
    query="What is the capital of France?",
    k=5
)
```

## Plugging in Real KP Client

### If KP is Running

1. Set environment variables (see above)
2. Verify KP is accessible: `curl $KP_API_URL/health`
3. Create workspace and user (see below)
4. Run benchmarks normally

### Creating Benchmark Workspace

```bash
# Option 1: Via webapp UI
# Navigate to http://localhost:3000, create workspace "benchmark-workspace"

# Option 2: Via direct DB access (requires ArangoDB access)
# See setup script: scripts/setup_benchmark_workspace.py
```

### If KP is Not Running

The adapters include a mock mode for testing the benchmark framework:
```python
adapter = KnowledgePlaneAdapter(mock=True)
await adapter.initialize({})  # No config needed in mock mode

# All operations work but use in-memory storage
result = await adapter.ingest_document({...})
results = await adapter.query_facts({...})
```

## Expected Outputs and Interpretation

### HotpotQA Results

**CSV Format** (`hotpotqa_results.csv`):
```csv
question_id,question,answer,system,predicted_answer,em,f1,latency_ms,retrieved_docs
hotpot_001,Who is the director of...,John Doe,kp,John Doe,1.0,1.0,450,5
hotpot_001,Who is the director of...,John Doe,vector,Jane Smith,0.0,0.33,320,5
```

**Interpretation**:
- **EM (Exact Match)**: 1.0 = perfect match, 0.0 = no match
- **F1**: Token-level overlap (0-1), accounts for partial matches
- **Latency**: Query time in milliseconds (lower is better)
- **Retrieved docs**: Number of documents used for answering

**Success Criteria**:
- KP should achieve >10% higher EM than vector baseline on multi-hop questions
- KP should achieve >15% higher F1 on complex questions
- Latency should be comparable (<2x difference)

### Freshness Results

**JSON Format** (`freshness_run.json`):
```json
{
  "time_to_truth_seconds": 270,
  "successful_polls": 9,
  "total_polls": 9,
  "consistency_rate": 1.0
}
```

**Interpretation**:
- **time_to_truth_seconds**: How long until KP returned the new fact
- **consistency_rate**: % of polls that returned correct answer after first success
- **Target**: <5 minutes time-to-truth for active freshness

## Troubleshooting

### KP Connection Issues

```bash
# Test MCP connectivity
curl -X POST $KP_API_URL/mcp \
  -H "Authorization: Bearer $KP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Should return list of MCP tools
```

### Missing Dependencies

```bash
# Reinstall with specific versions
pip install -r requirements-bench.txt --force-reinstall

# Check FAISS installation
python -c "import faiss; print(faiss.__version__)"
```

### OpenAI API Errors

```bash
# Verify API key
python -c "import openai; openai.api_key='$OPENAI_API_KEY'; print(openai.Model.list())"

# Use alternative embedding model
export EMBEDDING_MODEL=text-embedding-3-small  # Smaller, cheaper
```

### Slow Performance

```bash
# Reduce dataset size
python bench_hotpotqa.py --n 10  # Start small

# Disable vector baseline (faster)
python bench_hotpotqa.py --n 20 --run_vector false

# Increase batch size
export BATCH_SIZE=10  # Process multiple questions in parallel
```

### Permission Errors

```bash
# Ensure output directory exists and is writable
mkdir -p output
chmod 755 output

# Check workspace access
# User must be a member of the workspace with appropriate permissions
```

## Next Steps

After proving the core benchmarks, expand to:

### Additional Benchmarks
- **LoCoMo**: Long-context multi-document reasoning
- **MemoryBench**: Consistency and retrieval over time
- **RAGAS**: Retrieval-Augmented Generation Assessment
- **Scalability**: Performance with 10k, 100k, 1M facts

### Competitor Integration
- **Mem0**: Memory management system
- **Supermemory**: Personal knowledge base
- **GraphRAG**: Microsoft's graph-based RAG
- **LangChain**: Standard RAG pipelines

### Advanced Features
- **Multi-turn conversations**: Test knowledge retention across turns
- **Contradiction detection**: Handling conflicting facts
- **Source attribution**: Citation accuracy
- **Fact verification**: Checking fact accuracy against ground truth

## Contributing

To add a new benchmark:

1. Create `bench_<name>.py` following existing patterns
2. Define clear metrics and evaluation criteria
3. Add output format to README
4. Update `run_all.py` to include new benchmark
5. Document environment variables and dependencies

## References

- HotpotQA Dataset: https://hotpotqa.github.io/
- KnowledgePlane Docs: /docs/api.md
- FAISS Documentation: https://github.com/facebookresearch/faiss
- Sentence Transformers: https://www.sbert.net/

## License

Same as KnowledgePlane main repository.
