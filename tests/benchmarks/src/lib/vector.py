"""
Vector Baseline - Simple RAG System for KnowledgePlane Benchmarking

This module implements a straightforward vector-based RAG system as a comparison
baseline for KnowledgePlane. It uses:
- Local sentence-transformers for embeddings (no API cost)
- FAISS for fast similarity search
- Simple fixed-size chunking with overlap
- Extractive or generative answer generation

The goal is to provide a reproducible, controllable baseline that demonstrates
KP's graph-native advantages in multi-hop reasoning.
"""

import os
import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer


@dataclass
class Document:
    """
    A document to be ingested into the vector baseline.

    Attributes:
        id: Unique identifier for the document
        text: Full text content of the document
        metadata: Optional metadata (e.g., title, source)
    """
    id: str
    text: str
    metadata: Optional[Dict[str, str]] = None


@dataclass
class Chunk:
    """
    A text chunk with embedding and provenance.

    Attributes:
        text: The chunk text
        doc_id: ID of the source document
        chunk_idx: Index of this chunk within the document
        embedding: Vector embedding of the chunk (set after embedding)
        metadata: Optional metadata from the source document
    """
    text: str
    doc_id: str
    chunk_idx: int
    embedding: Optional[np.ndarray] = None
    metadata: Optional[Dict[str, str]] = None


@dataclass
class RetrievalResult:
    """
    A retrieved chunk with similarity score.

    Attributes:
        chunk: The retrieved chunk
        score: Similarity score (cosine similarity)
    """
    chunk: Chunk
    score: float


class VectorBaseline:
    """
    Simple vector-based RAG system for benchmarking.

    This class provides a minimal but functional RAG implementation:
    1. Chunks documents into fixed-size overlapping segments
    2. Embeds chunks using local sentence-transformers
    3. Indexes embeddings in FAISS for fast retrieval
    4. Retrieves top-k most similar chunks for a query
    5. Generates answers extractively or with an LLM

    Example:
        >>> baseline = VectorBaseline()
        >>> docs = [Document(id="doc1", text="Paris is the capital of France.")]
        >>> baseline.ingest_documents(docs)
        >>> answer = baseline.query("What is the capital of France?", k=5)
        >>> print(answer)
    """

    def __init__(
        self,
        embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
        chunk_size: int = 512,
        chunk_overlap: int = 50,
        use_openai_fallback: bool = False
    ):
        """
        Initialize the vector baseline system.

        Args:
            embedding_model: Name of the sentence-transformers model to use.
                           Default is all-MiniLM-L6-v2 (384-dim, fast, decent quality)
            chunk_size: Maximum number of tokens per chunk
            chunk_overlap: Number of overlapping tokens between chunks
            use_openai_fallback: If True, use OpenAI embeddings if OPENAI_API_KEY is set
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.use_openai_fallback = use_openai_fallback

        # Initialize embedding model
        if use_openai_fallback and os.getenv("OPENAI_API_KEY"):
            self.embedding_type = "openai"
            self.embedding_model_name = "text-embedding-ada-002"
            print(f"Using OpenAI embeddings: {self.embedding_model_name}")
        else:
            self.embedding_type = "sentence_transformer"
            self.embedding_model_name = embedding_model
            print(f"Loading sentence-transformer: {embedding_model}")
            self.model = SentenceTransformer(embedding_model)
            self.embedding_dim = self.model.get_sentence_embedding_dimension()
            print(f"Embedding dimension: {self.embedding_dim}")

        # Storage for chunks and index
        self.chunks: List[Chunk] = []
        self.index: Optional[faiss.Index] = None
        self.is_indexed = False

    def ingest_documents(self, docs: List[Document]) -> None:
        """
        Ingest documents into the vector baseline system.

        This method:
        1. Chunks each document into overlapping segments
        2. Generates embeddings for all chunks
        3. Builds a FAISS index for fast similarity search

        Args:
            docs: List of Document objects to ingest

        Raises:
            ValueError: If docs is empty
        """
        if not docs:
            raise ValueError("Cannot ingest empty document list")

        print(f"Ingesting {len(docs)} documents...")

        # Step 1: Chunk all documents
        all_chunks = []
        for doc in docs:
            doc_chunks = self._chunk_document(doc)
            all_chunks.extend(doc_chunks)

        print(f"Created {len(all_chunks)} chunks from {len(docs)} documents")

        # Step 2: Generate embeddings
        chunk_texts = [chunk.text for chunk in all_chunks]
        embeddings = self._embed_texts(chunk_texts)

        # Attach embeddings to chunks
        for chunk, embedding in zip(all_chunks, embeddings):
            chunk.embedding = embedding

        # Step 3: Build FAISS index
        self.chunks = all_chunks
        self._build_index()

        print(f"Indexing complete. Ready for queries.")

    def query(
        self,
        question: str,
        k: int = 5,
        mode: str = "extractive"
    ) -> str:
        """
        Query the vector baseline and generate an answer.

        Args:
            question: The question to answer
            k: Number of top chunks to retrieve
            mode: Answer generation mode:
                  - "extractive": Extract the best sentence from top chunk (default, no API cost)
                  - "generative": Use LLM to synthesize answer (requires API key)

        Returns:
            Generated answer as a string

        Raises:
            RuntimeError: If no documents have been ingested
            ValueError: If k < 1 or invalid mode
        """
        answer, _ = self.query_with_results(question, k, mode)
        return answer

    def query_with_results(
        self,
        question: str,
        k: int = 5,
        mode: str = "extractive"
    ) -> Tuple[str, List[RetrievalResult]]:
        """
        Query the vector baseline and return both the answer and retrieved chunks.

        This method is used by benchmarks to compute retrieval metrics (SF F1, etc.)
        by comparing retrieved chunks against gold evidence.

        Args:
            question: The question to answer
            k: Number of top chunks to retrieve
            mode: Answer generation mode:
                  - "extractive": Extract the best sentence from top chunk (default, no API cost)
                  - "generative": Use LLM to synthesize answer (requires API key)

        Returns:
            Tuple of (answer_string, list_of_RetrievalResult)

        Raises:
            RuntimeError: If no documents have been ingested
            ValueError: If k < 1 or invalid mode
        """
        if not self.is_indexed:
            raise RuntimeError("No documents ingested. Call ingest_documents() first.")

        if k < 1:
            raise ValueError(f"k must be >= 1, got {k}")

        if mode not in ["extractive", "generative"]:
            raise ValueError(f"Invalid mode: {mode}. Must be 'extractive' or 'generative'")

        # Step 1: Embed the question
        query_embedding = self._embed_texts([question])[0]

        # Step 2: Retrieve top-k chunks
        retrieved = self._retrieve(query_embedding, k)

        if not retrieved:
            return "No relevant information found.", []

        # Step 3: Generate answer based on mode
        if mode == "extractive":
            answer = self._generate_answer_extractive(question, retrieved)
        else:  # generative
            answer = self._generate_answer_generative(question, retrieved)

        return answer, retrieved

    def _chunk_document(self, doc: Document) -> List[Chunk]:
        """
        Chunk a single document into overlapping segments.

        Strategy:
        - Split text into sentences (sentence boundaries preserved)
        - Group sentences into chunks of approximately chunk_size tokens
        - Add overlap by including last N tokens from previous chunk

        Args:
            doc: Document to chunk

        Returns:
            List of Chunk objects
        """
        # Split into sentences (simple regex-based approach)
        sentences = self._split_into_sentences(doc.text)

        if not sentences:
            return []

        chunks = []
        current_chunk_sentences = []
        current_length = 0
        chunk_idx = 0

        for sentence in sentences:
            sentence_length = len(sentence.split())

            # If adding this sentence exceeds chunk_size, create a chunk
            if current_length + sentence_length > self.chunk_size and current_chunk_sentences:
                # Create chunk from accumulated sentences
                chunk_text = " ".join(current_chunk_sentences)
                chunks.append(Chunk(
                    text=chunk_text,
                    doc_id=doc.id,
                    chunk_idx=chunk_idx,
                    metadata=doc.metadata
                ))
                chunk_idx += 1

                # Start new chunk with overlap
                # Keep sentences that fit within overlap window
                overlap_sentences = []
                overlap_length = 0
                for s in reversed(current_chunk_sentences):
                    s_len = len(s.split())
                    if overlap_length + s_len <= self.chunk_overlap:
                        overlap_sentences.insert(0, s)
                        overlap_length += s_len
                    else:
                        break

                current_chunk_sentences = overlap_sentences
                current_length = overlap_length

            # Add sentence to current chunk
            current_chunk_sentences.append(sentence)
            current_length += sentence_length

        # Add final chunk if any sentences remain
        if current_chunk_sentences:
            chunk_text = " ".join(current_chunk_sentences)
            chunks.append(Chunk(
                text=chunk_text,
                doc_id=doc.id,
                chunk_idx=chunk_idx,
                metadata=doc.metadata
            ))

        return chunks

    def _split_into_sentences(self, text: str) -> List[str]:
        """
        Split text into sentences using simple regex.

        Args:
            text: Text to split

        Returns:
            List of sentences
        """
        # Simple sentence splitting (handles ., !, ?)
        # This is not perfect but sufficient for benchmarking
        sentence_endings = r'[.!?]+'
        sentences = re.split(sentence_endings, text)

        # Clean up and filter empty sentences
        sentences = [s.strip() for s in sentences if s.strip()]

        return sentences

    def _embed_texts(self, texts: List[str]) -> np.ndarray:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed

        Returns:
            Numpy array of shape (len(texts), embedding_dim)
        """
        if self.embedding_type == "openai":
            return self._embed_texts_openai(texts)
        else:
            return self._embed_texts_sentence_transformer(texts)

    def _embed_texts_sentence_transformer(self, texts: List[str]) -> np.ndarray:
        """
        Generate embeddings using sentence-transformers (local, no API cost).

        Args:
            texts: List of text strings to embed

        Returns:
            Numpy array of shape (len(texts), embedding_dim)
        """
        embeddings = self.model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=len(texts) > 100
        )

        # Normalize for cosine similarity
        embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

        return embeddings

    def _embed_texts_openai(self, texts: List[str]) -> np.ndarray:
        """
        Generate embeddings using OpenAI API (requires OPENAI_API_KEY).

        Args:
            texts: List of text strings to embed

        Returns:
            Numpy array of shape (len(texts), embedding_dim)
        """
        try:
            import openai
        except ImportError:
            raise ImportError("openai package required for OpenAI embeddings. Install with: pip install openai")

        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # Batch embeddings (OpenAI supports up to 2048 texts per request)
        batch_size = 2048
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            response = client.embeddings.create(
                model=self.embedding_model_name,
                input=batch
            )
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)

        embeddings = np.array(all_embeddings)

        # Normalize for cosine similarity
        embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

        return embeddings

    def _build_index(self) -> None:
        """
        Build a FAISS index from chunk embeddings.

        Uses FAISS IndexFlatIP (inner product) which is equivalent to cosine
        similarity when embeddings are normalized.
        """
        if not self.chunks:
            raise ValueError("No chunks to index")

        # Get embedding dimension from first chunk
        embedding_dim = self.chunks[0].embedding.shape[0]

        # Create FAISS index (IndexFlatIP for cosine similarity)
        self.index = faiss.IndexFlatIP(embedding_dim)

        # Add all embeddings to index
        embeddings_matrix = np.vstack([chunk.embedding for chunk in self.chunks])
        self.index.add(embeddings_matrix.astype('float32'))

        self.is_indexed = True
        print(f"Built FAISS index with {self.index.ntotal} vectors")

    def _retrieve(self, query_embedding: np.ndarray, k: int) -> List[RetrievalResult]:
        """
        Retrieve top-k most similar chunks using FAISS.

        Args:
            query_embedding: Query vector (normalized)
            k: Number of results to retrieve

        Returns:
            List of RetrievalResult objects, sorted by score (descending)
        """
        if not self.is_indexed:
            raise RuntimeError("Index not built. Call _build_index() first.")

        # Ensure k doesn't exceed number of chunks
        k = min(k, len(self.chunks))

        # Search FAISS index
        query_vector = query_embedding.reshape(1, -1).astype('float32')
        scores, indices = self.index.search(query_vector, k)

        # Build results
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx >= 0:  # Valid index
                results.append(RetrievalResult(
                    chunk=self.chunks[idx],
                    score=float(score)
                ))

        return results

    def _generate_answer_extractive(
        self,
        question: str,
        retrieved: List[RetrievalResult]
    ) -> str:
        """
        Generate answer extractively from retrieved chunks.

        Strategy: Return the highest-scoring sentence from the top chunk.
        This is simple, deterministic, and has no API cost.

        Args:
            question: The question being answered
            retrieved: Retrieved chunks with scores

        Returns:
            Extracted answer string
        """
        if not retrieved:
            return "No relevant information found."

        # Get the top-scoring chunk
        top_chunk = retrieved[0].chunk

        # Split chunk into sentences
        sentences = self._split_into_sentences(top_chunk.text)

        if not sentences:
            return top_chunk.text  # Fallback to full chunk

        # Simple heuristic: return first sentence (often contains key info)
        # In practice, you might want to score sentences by keyword overlap with question
        return sentences[0]

    def _generate_answer_generative(
        self,
        question: str,
        retrieved: List[RetrievalResult]
    ) -> str:
        """
        Generate answer using an LLM to synthesize from retrieved chunks.

        This requires an API key (Anthropic or OpenAI) and incurs cost.
        Use mode="extractive" to avoid this.

        Args:
            question: The question being answered
            retrieved: Retrieved chunks with scores

        Returns:
            Generated answer string
        """
        # Build context from top chunks
        context_parts = []
        for i, result in enumerate(retrieved[:3]):  # Use top 3 chunks
            context_parts.append(f"[{i+1}] {result.chunk.text}")

        context = "\n\n".join(context_parts)

        # Check for available LLM API
        if os.getenv("ANTHROPIC_API_KEY"):
            return self._generate_with_anthropic(question, context)
        elif os.getenv("OPENAI_API_KEY"):
            return self._generate_with_openai(question, context)
        else:
            raise RuntimeError(
                "Generative mode requires ANTHROPIC_API_KEY or OPENAI_API_KEY. "
                "Use mode='extractive' to avoid LLM calls."
            )

    def _generate_with_anthropic(self, question: str, context: str) -> str:
        """Generate answer using Anthropic Claude."""
        try:
            import anthropic
        except ImportError:
            raise ImportError("anthropic package required. Install with: pip install anthropic")

        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

        prompt = f"""Based on the following context, answer the question concisely.

Context:
{context}

Question: {question}

Answer (be concise and factual):"""

        message = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )

        return message.content[0].text.strip()

    def _generate_with_openai(self, question: str, context: str) -> str:
        """Generate answer using OpenAI GPT."""
        try:
            import openai
        except ImportError:
            raise ImportError("openai package required. Install with: pip install openai")

        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        prompt = f"""Based on the following context, answer the question concisely.

Context:
{context}

Question: {question}

Answer (be concise and factual):"""

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0
        )

        return response.choices[0].message.content.strip()

    def get_stats(self) -> Dict[str, any]:
        """
        Get statistics about the indexed corpus.

        Returns:
            Dictionary with corpus statistics
        """
        return {
            "num_chunks": len(self.chunks),
            "is_indexed": self.is_indexed,
            "embedding_model": self.embedding_model_name,
            "embedding_type": self.embedding_type,
            "chunk_size": self.chunk_size,
            "chunk_overlap": self.chunk_overlap,
            "unique_documents": len(set(chunk.doc_id for chunk in self.chunks))
        }


# Example usage and testing
if __name__ == "__main__":
    print("=== Vector Baseline Demo ===\n")

    # Create sample documents
    docs = [
        Document(
            id="doc1",
            text="Paris is the capital and most populous city of France. "
                 "With an official estimated population of 2,102,650 residents as of 1 January 2023, "
                 "Paris is the fourth-largest city in the European Union. "
                 "The City of Paris is the centre of the Île-de-France region.",
            metadata={"title": "Paris", "source": "example"}
        ),
        Document(
            id="doc2",
            text="The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France. "
                 "It is named after the engineer Gustave Eiffel, whose company designed and built the tower. "
                 "Constructed from 1887 to 1889, it was initially criticized by some of France's leading artists.",
            metadata={"title": "Eiffel Tower", "source": "example"}
        ),
        Document(
            id="doc3",
            text="London is the capital and largest city of England and the United Kingdom. "
                 "The city's population stands at approximately 9.8 million. "
                 "London is a major global city and financial center.",
            metadata={"title": "London", "source": "example"}
        )
    ]

    # Initialize baseline
    print("Initializing VectorBaseline...")
    baseline = VectorBaseline(chunk_size=100, chunk_overlap=20)

    # Ingest documents
    print("\nIngesting documents...")
    baseline.ingest_documents(docs)

    # Show stats
    print("\nCorpus Statistics:")
    stats = baseline.get_stats()
    for key, value in stats.items():
        print(f"  {key}: {value}")

    # Test queries
    print("\n=== Testing Queries ===\n")

    test_questions = [
        "What is the capital of France?",
        "Who designed the Eiffel Tower?",
        "What is the population of London?"
    ]

    for question in test_questions:
        print(f"Q: {question}")
        answer = baseline.query(question, k=3, mode="extractive")
        print(f"A: {answer}\n")

    print("=== Demo Complete ===")
