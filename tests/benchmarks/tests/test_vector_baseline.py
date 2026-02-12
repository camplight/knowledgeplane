"""
Unit tests for the Vector Baseline system.

This test suite validates:
- Document ingestion and chunking
- Embedding generation
- FAISS indexing
- Retrieval functionality
- Answer generation (extractive mode)
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))


import pytest
import numpy as np
from vector_baseline import VectorBaseline, Document, Chunk


@pytest.fixture
def sample_documents():
    """Create sample documents for testing."""
    return [
        Document(
            id="doc1",
            text="Paris is the capital of France. It is known for the Eiffel Tower. "
                 "The city has a population of over 2 million people. "
                 "Paris is located in northern France on the Seine River.",
            metadata={"title": "Paris", "source": "test"}
        ),
        Document(
            id="doc2",
            text="The Eiffel Tower was built in 1889. It was designed by Gustave Eiffel. "
                 "The tower stands 330 meters tall. It is one of the most visited monuments in the world.",
            metadata={"title": "Eiffel Tower", "source": "test"}
        ),
        Document(
            id="doc3",
            text="London is the capital of England. It is the largest city in the UK. "
                 "London has a population of nearly 9 million people. "
                 "The city is a global financial center.",
            metadata={"title": "London", "source": "test"}
        )
    ]


@pytest.fixture
def baseline():
    """Create a VectorBaseline instance with small chunks for testing."""
    return VectorBaseline(chunk_size=50, chunk_overlap=10)


def test_initialization():
    """Test VectorBaseline initialization."""
    baseline = VectorBaseline()
    assert baseline.chunk_size == 512
    assert baseline.chunk_overlap == 50
    assert baseline.is_indexed is False
    assert len(baseline.chunks) == 0


def test_chunking(baseline, sample_documents):
    """Test document chunking."""
    doc = sample_documents[0]
    chunks = baseline._chunk_document(doc)

    assert len(chunks) > 0
    assert all(isinstance(c, Chunk) for c in chunks)
    assert all(c.doc_id == doc.id for c in chunks)
    assert all(c.metadata == doc.metadata for c in chunks)

    # Check chunk indices are sequential
    for i, chunk in enumerate(chunks):
        assert chunk.chunk_idx == i


def test_sentence_splitting(baseline):
    """Test sentence splitting."""
    text = "First sentence. Second sentence! Third sentence? Fourth sentence."
    sentences = baseline._split_into_sentences(text)

    assert len(sentences) == 4
    assert "First sentence" in sentences[0]
    assert "Second sentence" in sentences[1]


def test_embedding_generation(baseline):
    """Test embedding generation."""
    texts = ["This is a test.", "Another test sentence."]
    embeddings = baseline._embed_texts(texts)

    assert embeddings.shape[0] == len(texts)
    assert embeddings.shape[1] > 0  # Has embedding dimension

    # Check normalization (should be unit vectors)
    norms = np.linalg.norm(embeddings, axis=1)
    assert np.allclose(norms, 1.0, atol=1e-5)


def test_document_ingestion(baseline, sample_documents):
    """Test full document ingestion pipeline."""
    baseline.ingest_documents(sample_documents)

    assert baseline.is_indexed is True
    assert len(baseline.chunks) > 0
    assert baseline.index is not None
    assert baseline.index.ntotal == len(baseline.chunks)

    # Check all chunks have embeddings
    assert all(chunk.embedding is not None for chunk in baseline.chunks)


def test_retrieval(baseline, sample_documents):
    """Test retrieval functionality."""
    baseline.ingest_documents(sample_documents)

    query = "What is the capital of France?"
    results = baseline._retrieve(baseline._embed_texts([query])[0], k=3)

    assert len(results) <= 3
    assert all(hasattr(r, 'chunk') for r in results)
    assert all(hasattr(r, 'score') for r in results)

    # Scores should be in descending order
    scores = [r.score for r in results]
    assert scores == sorted(scores, reverse=True)


def test_extractive_query(baseline, sample_documents):
    """Test extractive question answering."""
    baseline.ingest_documents(sample_documents)

    # Test various questions
    questions = [
        "What is the capital of France?",
        "When was the Eiffel Tower built?",
        "What is the population of London?"
    ]

    for question in questions:
        answer = baseline.query(question, k=3, mode="extractive")
        assert isinstance(answer, str)
        assert len(answer) > 0
        assert answer != "No relevant information found."


def test_empty_document_list(baseline):
    """Test handling of empty document list."""
    with pytest.raises(ValueError, match="Cannot ingest empty document list"):
        baseline.ingest_documents([])


def test_query_before_ingestion(baseline):
    """Test querying before documents are ingested."""
    with pytest.raises(RuntimeError, match="No documents ingested"):
        baseline.query("test question")


def test_invalid_k_parameter(baseline, sample_documents):
    """Test invalid k parameter."""
    baseline.ingest_documents(sample_documents)

    with pytest.raises(ValueError, match="k must be >= 1"):
        baseline.query("test", k=0)


def test_invalid_mode(baseline, sample_documents):
    """Test invalid answer generation mode."""
    baseline.ingest_documents(sample_documents)

    with pytest.raises(ValueError, match="Invalid mode"):
        baseline.query("test", mode="invalid_mode")


def test_stats(baseline, sample_documents):
    """Test statistics gathering."""
    baseline.ingest_documents(sample_documents)
    stats = baseline.get_stats()

    assert stats["num_chunks"] > 0
    assert stats["is_indexed"] is True
    assert stats["unique_documents"] == len(sample_documents)
    assert stats["chunk_size"] == baseline.chunk_size
    assert stats["chunk_overlap"] == baseline.chunk_overlap


def test_chunk_overlap(baseline):
    """Test that chunks have proper overlap."""
    doc = Document(
        id="test",
        text="First sentence. Second sentence. Third sentence. "
             "Fourth sentence. Fifth sentence. Sixth sentence."
    )

    chunks = baseline._chunk_document(doc)

    if len(chunks) > 1:
        # Check that consecutive chunks share some text
        for i in range(len(chunks) - 1):
            chunk1_words = set(chunks[i].text.split())
            chunk2_words = set(chunks[i+1].text.split())
            overlap = chunk1_words & chunk2_words
            # Should have at least some overlap
            assert len(overlap) > 0


def test_metadata_preservation(baseline, sample_documents):
    """Test that metadata is preserved through chunking."""
    baseline.ingest_documents(sample_documents)

    for chunk in baseline.chunks:
        # Find original document
        orig_doc = next(d for d in sample_documents if d.id == chunk.doc_id)
        assert chunk.metadata == orig_doc.metadata


def test_deterministic_embeddings(baseline):
    """Test that embeddings are deterministic."""
    texts = ["Test sentence one.", "Test sentence two."]

    embeddings1 = baseline._embed_texts(texts)
    embeddings2 = baseline._embed_texts(texts)

    assert np.allclose(embeddings1, embeddings2, atol=1e-6)


def test_retrieval_relevance(baseline, sample_documents):
    """Test that retrieval returns relevant results."""
    baseline.ingest_documents(sample_documents)

    # Query about Paris should retrieve chunks from Paris documents
    query = "Tell me about Paris and its population"
    results = baseline._retrieve(baseline._embed_texts([query])[0], k=5)

    # Check that top results contain Paris-related content
    top_texts = [r.chunk.text.lower() for r in results[:2]]
    assert any("paris" in text for text in top_texts)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
