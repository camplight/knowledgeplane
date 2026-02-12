# Vector Baseline - Simple RAG System

This is a straightforward vector-based Retrieval-Augmented Generation (RAG) system implemented as a comparison baseline for KnowledgePlane benchmarking.

## Overview

The Vector Baseline provides a minimal but functional RAG implementation:

1. **Chunking**: Fixed-size chunks with overlap for context preservation
2. **Embedding**: Local sentence-transformers (no API cost) or OpenAI embeddings
3. **Indexing**: FAISS for fast cosine similarity search
4. **Retrieval**: Top-k most similar chunks
5. **Answer Generation**: Extractive (free) or generative (requires LLM API)

## Architecture

```
Document → Chunking → Embedding → FAISS Index
                                       ↓
Query → Embedding → Similarity Search → Top-k Chunks → Answer
```

## Installation

```bash
cd tests/benchmarks
pip install -r requirements-bench.txt
```

### Required Dependencies

- `sentence-transformers` - Local embedding generation
- `faiss-cpu` - Fast similarity search
- `numpy` - Numerical operations

### Optional Dependencies

- `anthropic` - For generative mode with Claude
- `openai` - For generative mode with GPT or alternative embeddings

## Quick Start

### Basic Usage

```python
from vector_baseline import VectorBaseline, Document

# Initialize
baseline = VectorBaseline()

# Create documents
docs = [
    Document(
        id="doc1",
        text="Paris is the capital of France.",
        metadata={"source": "wikipedia"}
    ),
    Document(
        id="doc2",
        text="The Eiffel Tower was built in 1889.",
        metadata={"source": "wikipedia"}
    )
]

# Ingest documents
baseline.ingest_documents(docs)

# Query
answer = baseline.query("What is the capital of France?", k=5)
print(answer)
```

### Configuration Options

```python
# Custom configuration
baseline = VectorBaseline(
    embedding_model="sentence-transformers/all-MiniLM-L6-v2",  # Model name
    chunk_size=512,          # Max tokens per chunk
    chunk_overlap=50,        # Overlapping tokens
    use_openai_fallback=False  # Use OpenAI if API key set
)
```

### Answer Generation Modes

**Extractive Mode (Default - No API Cost)**
```python
# Returns the highest-scoring sentence from top chunk
answer = baseline.query(question, k=5, mode="extractive")
```

**Generative Mode (Requires API Key)**
```python
# Uses LLM to synthesize answer from retrieved chunks
# Requires ANTHROPIC_API_KEY or OPENAI_API_KEY in environment
answer = baseline.query(question, k=5, mode="generative")
```

## Demo Script

Run the interactive demo to see the vector baseline in action:

```bash
# Basic demo (extractive mode, no API cost)
python demo_vector_baseline.py

# Generative mode (requires API key)
python demo_vector_baseline.py --mode generative

# Retrieve more chunks
python demo_vector_baseline.py --k 10
```

The demo will:
1. Create a sample corpus of 8 documents
2. Ingest and index them
3. Run 8 test queries
4. Display answers and performance metrics

## Testing

Run the test suite:

```bash
pytest test_vector_baseline.py -v
```

Test coverage includes:
- Document ingestion and chunking
- Embedding generation
- FAISS indexing
- Retrieval functionality
- Answer generation
- Edge cases and error handling

## API Reference

### VectorBaseline

#### `__init__(embedding_model, chunk_size, chunk_overlap, use_openai_fallback)`

Initialize the vector baseline system.

**Parameters:**
- `embedding_model` (str): Sentence-transformers model name. Default: `"sentence-transformers/all-MiniLM-L6-v2"`
- `chunk_size` (int): Maximum tokens per chunk. Default: `512`
- `chunk_overlap` (int): Overlapping tokens between chunks. Default: `50`
- `use_openai_fallback` (bool): Use OpenAI if API key available. Default: `False`

#### `ingest_documents(docs)`

Ingest documents into the system.

**Parameters:**
- `docs` (List[Document]): List of documents to ingest

**Raises:**
- `ValueError`: If docs is empty

#### `query(question, k, mode)`

Query the system and generate an answer.

**Parameters:**
- `question` (str): Question to answer
- `k` (int): Number of chunks to retrieve. Default: `5`
- `mode` (str): Answer generation mode (`"extractive"` or `"generative"`). Default: `"extractive"`

**Returns:**
- `str`: Generated answer

**Raises:**
- `RuntimeError`: If no documents have been ingested
- `ValueError`: If k < 1 or invalid mode

#### `get_stats()`

Get statistics about the indexed corpus.

**Returns:**
- `Dict[str, any]`: Dictionary with corpus statistics

### Document

Dataclass representing a document.

**Attributes:**
- `id` (str): Unique identifier
- `text` (str): Full text content
- `metadata` (Optional[Dict[str, str]]): Optional metadata

### Chunk

Dataclass representing a text chunk.

**Attributes:**
- `text` (str): Chunk text
- `doc_id` (str): Source document ID
- `chunk_idx` (int): Index within document
- `embedding` (Optional[np.ndarray]): Vector embedding
- `metadata` (Optional[Dict[str, str]]): Metadata from source

## Chunking Strategy

The baseline uses a simple but effective chunking approach:

1. **Split into sentences** using regex (preserves natural boundaries)
2. **Group sentences** into chunks of ~512 tokens
3. **Add overlap** by including last N tokens from previous chunk
4. **Preserve context** by avoiding mid-sentence splits

Example:
```
Document: "Sentence 1. Sentence 2. Sentence 3. Sentence 4."

Chunk 1: "Sentence 1. Sentence 2."
Chunk 2: "Sentence 2. Sentence 3. Sentence 4."  # Overlaps with Sentence 2
```

## Embedding Strategy

### Local Embeddings (Default)

- **Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Dimension**: 384
- **Speed**: Fast (~5ms per sentence on CPU)
- **Quality**: Good for most use cases
- **Cost**: Free (runs locally)

### OpenAI Embeddings (Optional)

- **Model**: `text-embedding-ada-002`
- **Dimension**: 1536
- **Speed**: Depends on API latency
- **Quality**: Excellent
- **Cost**: ~$0.0001 per 1K tokens

To use OpenAI embeddings:
```python
import os
os.environ["OPENAI_API_KEY"] = "your-key"

baseline = VectorBaseline(use_openai_fallback=True)
```

## Retrieval Strategy

Uses FAISS `IndexFlatIP` (inner product) with normalized embeddings:

- **Normalization**: All vectors are L2-normalized
- **Similarity**: Cosine similarity (via inner product)
- **Algorithm**: Brute-force exact search
- **Speed**: Very fast for datasets < 1M vectors

## Answer Generation

### Extractive (Default)

Simple, deterministic, and free:

1. Get top-scoring chunk
2. Split into sentences
3. Return first sentence (usually contains key info)

**Pros**: Fast, free, deterministic
**Cons**: May miss context from multiple chunks

### Generative (Optional)

Uses LLM to synthesize from multiple chunks:

1. Retrieve top 3 chunks
2. Build context prompt
3. Call LLM (Claude Haiku or GPT-3.5-turbo)
4. Return synthesized answer

**Pros**: Better quality, can combine info from multiple chunks
**Cons**: Requires API key, costs money, slower

## Performance Characteristics

On a typical laptop (M1 MacBook):

| Operation | Time | Notes |
|-----------|------|-------|
| Chunking | 10ms/doc | Depends on doc size |
| Embedding | 5ms/chunk | For all-MiniLM-L6-v2 |
| Indexing | 1ms/1000 chunks | FAISS IndexFlatIP |
| Query (embed) | 5ms | Single query vector |
| Query (search) | <1ms | For <10K chunks |
| Total query time | ~10-50ms | Extractive mode |

## Limitations

1. **No Multi-Hop Reasoning**: Cannot connect facts across documents
2. **Fixed Chunking**: Doesn't adapt to document structure
3. **No Reranking**: Simple top-k retrieval without refinement
4. **Extractive Quality**: First sentence heuristic is naive
5. **No Freshness**: Static index, requires full re-ingestion for updates

These limitations are **intentional** - they demonstrate where graph-native systems like KnowledgePlane can excel.

## Comparison to KnowledgePlane

| Feature | Vector Baseline | KnowledgePlane |
|---------|----------------|----------------|
| Multi-hop reasoning | ❌ No | ✅ Graph-native |
| Active freshness | ❌ Static | ✅ Background sync |
| Structured facts | ❌ Text chunks | ✅ Entity-relation graph |
| Reranking | ❌ No | ✅ Graph algorithms |
| Cost | 💰 Free (local) | 💰 Free (local) |
| Setup complexity | ⚙️ Simple | ⚙️ Moderate |

## Environment Variables

```bash
# Optional: Use OpenAI embeddings instead of local
OPENAI_API_KEY=sk-...

# Optional: For generative answer mode
ANTHROPIC_API_KEY=sk-ant-...
# OR
OPENAI_API_KEY=sk-...
```

## Troubleshooting

### Import Error: sentence-transformers

```bash
pip install sentence-transformers
```

### Import Error: faiss

```bash
# For CPU-only version (recommended)
pip install faiss-cpu

# For GPU version (if CUDA available)
pip install faiss-gpu
```

### Out of Memory

Reduce chunk size or process documents in batches:

```python
baseline = VectorBaseline(chunk_size=256)  # Smaller chunks
```

### Slow Embedding

The first run downloads the model (~80MB). Subsequent runs are fast.

## Next Steps

1. **Integrate into benchmarks**: Use this baseline in `bench_hotpotqa.py`
2. **Add metrics**: Implement EM and F1 scoring
3. **Compare to KP**: Run side-by-side benchmarks
4. **Expand corpus**: Test with larger datasets

## License

Part of the KnowledgePlane project. See main repository for license information.
