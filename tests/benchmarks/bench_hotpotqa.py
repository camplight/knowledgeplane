#!/usr/bin/env python3
"""
HotpotQA Multi-Hop Reasoning Benchmark for KnowledgePlane

This script evaluates KnowledgePlane's graph-native multi-hop reasoning against
a vector baseline using the HotpotQA dataset (distractor setting).

HotpotQA requires answering questions that need 2+ reasoning steps across
multiple documents, making it ideal for evaluating graph-based reasoning.

Usage:
    python bench_hotpotqa.py --n 20 --run_kp true --run_vector true
    python bench_hotpotqa.py --n 50 --mock_kp --top_k 10
"""

import argparse
import csv
import json
import logging
import os
import random
import re
import string
import time
from collections import Counter
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple

import numpy as np
from datasets import load_dataset
from tqdm import tqdm

from kp_adapter import (
    HTTPKnowledgePlaneAdapter,
    MockKnowledgePlaneAdapter,
    KnowledgePlaneAdapter
)

# Import vector baseline only if needed (lazy import to avoid dependency issues)
VectorBaseline = None
Document = None
try:
    from vector_baseline import VectorBaseline, Document
except ImportError:
    pass  # Will fail later if --mode vector is used


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class QuestionResult:
    """Result for a single question evaluation."""
    question_id: str
    question: str
    ground_truth: str
    kp_answer: Optional[str] = None
    kp_em: Optional[float] = None
    kp_f1: Optional[float] = None
    kp_latency_ms: Optional[float] = None
    vector_answer: Optional[str] = None
    vector_em: Optional[float] = None
    vector_f1: Optional[float] = None
    vector_latency_ms: Optional[float] = None
    error: Optional[str] = None


@dataclass
class SystemMetrics:
    """Aggregate metrics for a system."""
    avg_em: float = 0.0
    avg_f1: float = 0.0
    avg_latency_ms: float = 0.0
    questions_evaluated: int = 0
    questions_answered: int = 0
    errors: int = 0


@dataclass
class BenchmarkSummary:
    """Complete benchmark summary."""
    kp: SystemMetrics = field(default_factory=SystemMetrics)
    vector: SystemMetrics = field(default_factory=SystemMetrics)
    improvement: Dict[str, float] = field(default_factory=dict)
    config: Dict[str, Any] = field(default_factory=dict)
    timing: Dict[str, float] = field(default_factory=dict)
    statistical_analysis: Optional[Dict[str, Any]] = None


class HotpotQABenchmark:
    """
    HotpotQA benchmark executor for KnowledgePlane.

    Loads HotpotQA questions, prepares documents, runs both KP and vector
    baseline, computes metrics (EM, F1), and saves detailed results.
    """

    def __init__(
        self,
        n_questions: int = 20,
        top_k: int = 5,
        seed: int = 42,
        run_kp: bool = True,
        run_vector: bool = True,
        mock_kp: bool = False,
        output_dir: str = "output",
        sample_method: str = "random",
        batch_size: Optional[int] = None,
        statistical_analysis: bool = False,
        mode: str = "timestamped"
    ):
        """
        Initialize the benchmark.

        Args:
            n_questions: Number of questions to evaluate
            top_k: Number of documents to retrieve
            seed: Random seed for reproducibility
            run_kp: Whether to run KP system
            run_vector: Whether to run vector baseline
            mock_kp: Use mock KP adapter (no server required)
            output_dir: Directory for output files
            sample_method: Sampling method ("random", "first", "stratified")
            batch_size: Process in batches (None = all at once)
            statistical_analysis: Run full statistical analysis
            mode: Namespace mode ("cached" or "timestamped")
                  - cached: Use fixed namespace, reuse embeddings across runs (fast)
                  - timestamped: Fresh namespace each run (full pipeline benchmark)
        """
        self.n_questions = n_questions
        self.top_k = top_k
        self.seed = seed
        self.run_kp = run_kp
        self.run_vector = run_vector
        self.mock_kp = mock_kp
        self.output_dir = Path(output_dir)
        self.sample_method = sample_method
        self.batch_size = batch_size
        self.statistical_analysis = statistical_analysis
        self.mode = mode

        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Set random seed for reproducibility
        np.random.seed(seed)
        random.seed(seed)

        # Initialize adapters
        self.kp_adapter: Optional[KnowledgePlaneAdapter] = None
        self.vector_baseline: Optional[VectorBaseline] = None

        # Results storage
        self.results: List[QuestionResult] = []

        # Timing storage
        self.question_times: List[float] = []

        logger.info(
            f"Initialized HotpotQA benchmark: n={n_questions}, k={top_k}, "
            f"seed={seed}, sample_method={sample_method}"
        )

    def preflight_checks(self) -> bool:
        """
        Comprehensive preflight checks for reliable benchmark execution.

        Checks:
        1. KP REST API is accessible
        2. Database is accessible and healthy
        3. Vector index status (drops blocking indexes automatically)
        4. API credentials configured
        5. OpenAI key for embeddings
        6. Background worker status warning

        Returns:
            True if all critical checks pass, False otherwise
        """
        import requests

        if self.mock_kp or not self.run_kp:
            logger.info("✓ Preflight: Mock mode or KP disabled, skipping service checks")
            return True

        logger.info("=" * 60)
        logger.info("Running Preflight Checks (6 checks)")
        logger.info("=" * 60)

        api_url = os.environ.get("KP_API_URL", "http://localhost:8081")
        arango_url = os.environ.get("ARANGO_URL", "http://localhost:8529")
        checks_passed = True
        warnings = []

        # ═══════════════════════════════════════════════════════════
        # Check 1: REST API reachable
        # ═══════════════════════════════════════════════════════════
        logger.info(f"[1/6] KP REST API at {api_url}...")
        try:
            response = requests.get(f"{api_url}/health", timeout=5)
            if response.status_code == 200:
                logger.info(f"  ✓ REST API is healthy")
            else:
                logger.error(f"  ✗ REST API returned status {response.status_code}")
                checks_passed = False
        except requests.exceptions.ConnectionError:
            logger.error(f"  ✗ Cannot connect to REST API at {api_url}")
            logger.error(f"    Start it with: npm run dev")
            checks_passed = False
        except Exception as e:
            logger.error(f"  ✗ REST API check failed: {e}")
            checks_passed = False

        # ═══════════════════════════════════════════════════════════
        # Check 2: Database is accessible
        # ═══════════════════════════════════════════════════════════
        logger.info(f"[2/6] ArangoDB at {arango_url}...")
        db_accessible = False
        db_url = arango_url
        try:
            # Try Docker internal hostname first (for containerized benchmarks)
            for try_url in [arango_url.replace("localhost", "host.docker.internal"), arango_url]:
                try:
                    response = requests.get(f"{try_url}/_api/version", auth=("root", "root"), timeout=5)
                    if response.status_code == 200:
                        version = response.json().get("version", "unknown")
                        logger.info(f"  ✓ ArangoDB v{version} accessible")
                        db_accessible = True
                        db_url = try_url
                        break
                except:
                    continue
            if not db_accessible:
                logger.warning(f"  ⚠ Cannot verify ArangoDB directly")
                warnings.append("Database direct access not verified")
        except Exception as e:
            logger.warning(f"  ⚠ Database check: {e}")
            warnings.append("Database health uncertain")

        # ═══════════════════════════════════════════════════════════
        # Check 3: Vector index status (auto-fix!)
        # ═══════════════════════════════════════════════════════════
        logger.info(f"[3/6] Vector index status...")
        if db_accessible:
            try:
                # Check if blocking vector index exists
                response = requests.get(
                    f"{db_url}/_db/knowledgeplane/_api/index/facts/idx_facts_embedding_vector",
                    auth=("root", "root"),
                    timeout=5
                )
                if response.status_code == 200:
                    logger.warning(f"  ⚠ Blocking vector index found - auto-dropping...")
                    del_response = requests.delete(
                        f"{db_url}/_db/knowledgeplane/_api/index/facts/idx_facts_embedding_vector",
                        auth=("root", "root"),
                        timeout=5
                    )
                    if del_response.status_code == 200:
                        logger.info(f"  ✓ Vector index dropped (facts can be ingested)")
                    else:
                        logger.error(f"  ✗ Failed to drop vector index")
                        warnings.append("Vector index may block inserts")
                elif response.status_code == 404:
                    logger.info(f"  ✓ No blocking vector index")
                else:
                    logger.info(f"  ✓ Vector index check passed")
            except Exception as e:
                logger.warning(f"  ⚠ Could not verify vector index: {e}")
                warnings.append("Vector index status unknown")
        else:
            logger.warning(f"  ⚠ Skipped (no DB access)")
            warnings.append("Vector index not checked")

        # ═══════════════════════════════════════════════════════════
        # Check 4: API credentials
        # ═══════════════════════════════════════════════════════════
        logger.info(f"[4/6] API credentials...")
        api_key = os.environ.get("KP_API_KEY")
        workspace_id = os.environ.get("KP_WORKSPACE_ID")
        user_id = os.environ.get("KP_USER_ID")

        if api_key:
            logger.info(f"  ✓ API key set")
        else:
            logger.error(f"  ✗ KP_API_KEY missing")
            checks_passed = False

        if workspace_id:
            logger.info(f"  ✓ Workspace: {workspace_id}")
        else:
            logger.error(f"  ✗ KP_WORKSPACE_ID missing")
            checks_passed = False

        if not user_id:
            warnings.append("KP_USER_ID not set")

        # ═══════════════════════════════════════════════════════════
        # Check 5: OpenAI API key
        # ═══════════════════════════════════════════════════════════
        logger.info(f"[5/6] OpenAI configuration...")
        openai_key = os.environ.get("OPENAI_API_KEY")
        if openai_key and openai_key.startswith("sk-"):
            logger.info(f"  ✓ OpenAI API key configured")
        elif openai_key:
            logger.warning(f"  ⚠ OpenAI key format unusual")
            warnings.append("OpenAI key may be invalid")
        else:
            logger.warning(f"  ⚠ OPENAI_API_KEY not set")
            warnings.append("No OpenAI key - embeddings won't generate")

        # ═══════════════════════════════════════════════════════════
        # Check 6: Background worker warning
        # ═══════════════════════════════════════════════════════════
        logger.info(f"[6/6] Background worker status...")
        logger.info(f"  ⚠ Cannot verify worker - if embeddings timeout:")
        logger.info(f"    Run: npm run dev:background-workers")
        warnings.append("Background worker not verified")

        # ═══════════════════════════════════════════════════════════
        # Summary
        # ═══════════════════════════════════════════════════════════
        logger.info("=" * 60)
        if checks_passed:
            logger.info("✓ All critical checks passed")
            if warnings:
                logger.info(f"  Warnings ({len(warnings)}): {', '.join(warnings[:3])}")
        else:
            logger.error("✗ PREFLIGHT FAILED - cannot proceed")
            logger.error("  Quick fix: npm run dev && source .env.benchmark")
        logger.info("=" * 60)

        return checks_passed

    def load_dataset(self) -> List[Dict[str, Any]]:
        """
        Load HotpotQA dataset from HuggingFace.

        Returns:
            List of question dicts with context, question, answer, and supporting facts
        """
        logger.info("Loading HotpotQA dataset (distractor setting)...")

        # Load dataset
        dataset = load_dataset("hotpot_qa", "distractor", split="validation")

        # Convert to list for sampling
        all_items = []
        for item in dataset:
            all_items.append({
                'id': item['id'],
                'question': item['question'],
                'answer': item['answer'],
                'type': item['type'],
                'level': item['level'],
                'context': item['context'],
                'supporting_facts': item['supporting_facts']
            })

        # Sample questions based on method
        if self.sample_method == "first":
            questions = all_items[:self.n_questions]
        elif self.sample_method == "stratified":
            questions = self._stratified_sample(all_items, self.n_questions)
        else:  # random
            questions = self._random_sample(all_items, self.n_questions)

        logger.info(
            f"Loaded {len(questions)} questions from HotpotQA "
            f"using {self.sample_method} sampling"
        )
        return questions

    def _random_sample(
        self,
        items: List[Dict[str, Any]],
        n: int
    ) -> List[Dict[str, Any]]:
        """
        Random sampling of questions.

        Args:
            items: All available items
            n: Number to sample

        Returns:
            Sampled items
        """
        if n >= len(items):
            return items

        indices = list(range(len(items)))
        random.shuffle(indices)
        return [items[i] for i in indices[:n]]

    def _stratified_sample(
        self,
        items: List[Dict[str, Any]],
        n: int
    ) -> List[Dict[str, Any]]:
        """
        Stratified sampling ensuring diversity in difficulty/type.

        HotpotQA has 'level' field: easy, medium, hard
        Sample proportionally from each level.

        Args:
            items: All available items
            n: Number to sample

        Returns:
            Stratified sample of items
        """
        # Group by level
        by_level = {}
        for item in items:
            level = item.get('level', 'medium')
            if level not in by_level:
                by_level[level] = []
            by_level[level].append(item)

        # Calculate samples per level (proportional)
        samples = []
        for level, level_items in by_level.items():
            level_proportion = len(level_items) / len(items)
            level_n = int(n * level_proportion)

            # Sample from this level
            if level_n > 0:
                if level_n >= len(level_items):
                    samples.extend(level_items)
                else:
                    samples.extend(random.sample(level_items, level_n))

        # If we need more samples to reach n, randomly sample remaining
        if len(samples) < n:
            remaining = [item for item in items if item not in samples]
            additional_needed = n - len(samples)
            if additional_needed <= len(remaining):
                samples.extend(random.sample(remaining, additional_needed))
            else:
                samples.extend(remaining)

        # Shuffle to avoid grouping by level
        random.shuffle(samples)

        return samples[:n]

    def prepare_documents(
        self,
        context: Dict[str, List]
    ) -> List[Dict[str, Any]]:
        """
        Prepare documents from HotpotQA context.

        Each context entry is [title, [sentences]]. We create one document
        per title with all sentences concatenated.

        Args:
            context: Dict with 'title' and 'sentences' keys from HotpotQA dataset

        Returns:
            List of document dicts ready for ingestion
        """
        documents = []

        # HotpotQA context format: {'title': ['Title1', 'Title2'], 'sentences': [['sent1'], ['sent2']]}
        titles = context.get('title', [])
        sentences_list = context.get('sentences', [])

        for title, sentences in zip(titles, sentences_list):
            # Concatenate all sentences
            content = " ".join(sentences)

            # Create document
            doc = {
                'content': content,
                'filename': f"{title}.txt",
                'mimeType': 'text/plain',
                'metadata': {
                    'title': title,
                    'source': 'hotpotqa',
                    'num_sentences': str(len(sentences))  # Convert to string for Fact model
                }
            }
            documents.append(doc)

        return documents

    def initialize_kp_system(self, namespace: str) -> None:
        """
        Initialize KnowledgePlane adapter.

        Args:
            namespace: Namespace for this benchmark run
        """
        if self.mock_kp:
            logger.info("Initializing mock KP adapter...")
            self.kp_adapter = MockKnowledgePlaneAdapter()
            self.kp_adapter.initialize(
                mcp_url="mock://localhost",
                api_key="mock_key",
                workspace_id=namespace,
                user_id="benchmark_user"
            )
        else:
            logger.info("Initializing HTTP KP adapter...")
            self.kp_adapter = HTTPKnowledgePlaneAdapter()

            # Get config from environment
            mcp_url = os.getenv("KP_API_URL", "http://localhost:8080/mcp")
            api_key = os.getenv("KP_API_KEY", "benchmark-api-key-12345")
            workspace_id = os.getenv("KP_WORKSPACE_ID", namespace)
            user_id = os.getenv("KP_USER_ID", "benchmark-user")

            self.kp_adapter.initialize(
                mcp_url=mcp_url,
                api_key=api_key,
                workspace_id=workspace_id,
                user_id=user_id
            )

        logger.info("KP adapter initialized successfully")

    def initialize_vector_baseline(self) -> None:
        """Initialize vector baseline system."""
        logger.info("Initializing vector baseline...")

        self.vector_baseline = VectorBaseline(
            chunk_size=512,
            chunk_overlap=128,
            use_openai_fallback=False  # Use local embeddings by default
        )

        logger.info("Vector baseline initialized successfully")

    def ingest_kp_documents(
        self,
        documents: List[Dict[str, Any]],
        namespace: str
    ) -> bool:
        """
        Ingest documents into KP system.

        Args:
            documents: List of document dicts
            namespace: Namespace for isolation

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Ingesting {len(documents)} documents into KP...")
            start_time = time.time()

            results = self.kp_adapter.ingest_documents(documents, namespace=namespace)

            elapsed = time.time() - start_time
            total_facts = sum(r.facts_created for r in results)
            total_relations = sum(r.relations_created for r in results)

            logger.info(
                f"KP ingestion complete: {total_facts} facts, "
                f"{total_relations} relations in {elapsed:.2f}s"
            )
            return True

        except Exception as e:
            logger.error(f"KP ingestion failed: {e}", exc_info=True)
            return False

    def ingest_vector_documents(
        self,
        documents: List[Dict[str, Any]]
    ) -> bool:
        """
        Ingest documents into vector baseline.

        Args:
            documents: List of document dicts

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Ingesting {len(documents)} documents into vector baseline...")
            start_time = time.time()

            # Convert to Document objects
            docs = [
                Document(
                    id=f"doc_{i}",
                    text=doc['content'],
                    metadata=doc.get('metadata', {})
                )
                for i, doc in enumerate(documents)
            ]

            self.vector_baseline.ingest_documents(docs)

            elapsed = time.time() - start_time
            stats = self.vector_baseline.get_stats()

            logger.info(
                f"Vector ingestion complete: {stats['num_chunks']} chunks "
                f"from {stats['unique_documents']} documents in {elapsed:.2f}s"
            )
            return True

        except Exception as e:
            logger.error(f"Vector ingestion failed: {e}", exc_info=True)
            return False

    def query_kp_system(
        self,
        question: str,
        namespace: str
    ) -> Tuple[Optional[str], float]:
        """
        Query KP system and extract answer.

        Args:
            question: Question to ask
            namespace: Namespace filter

        Returns:
            Tuple of (answer, latency_ms)
        """
        try:
            start_time = time.time()
            result = self.kp_adapter.query(
                question=question,
                namespace=namespace,
                k=self.top_k,
                search_mode="hybrid"
            )
            latency_ms = (time.time() - start_time) * 1000

            # Extract answer from results
            if result.results:
                # Simple strategy: concatenate top results and extract answer
                context = " ".join([r.content for r in result.results[:3]])
                answer = self._extract_answer_from_context(question, context)
            else:
                answer = "No answer found"

            return answer, latency_ms

        except Exception as e:
            logger.error(f"KP query failed: {e}", exc_info=True)
            return None, 0.0

    def query_vector_system(
        self,
        question: str
    ) -> Tuple[Optional[str], float]:
        """
        Query vector baseline and extract answer.

        Args:
            question: Question to ask

        Returns:
            Tuple of (answer, latency_ms)
        """
        try:
            start_time = time.time()
            answer = self.vector_baseline.query(
                question=question,
                k=self.top_k,
                mode="extractive"
            )
            latency_ms = (time.time() - start_time) * 1000

            return answer, latency_ms

        except Exception as e:
            logger.error(f"Vector query failed: {e}", exc_info=True)
            return None, 0.0

    def _extract_answer_from_context(
        self,
        question: str,
        context: str
    ) -> str:
        """
        Extract answer from context using simple heuristics.

        This is a simplified extraction. In production, you might use
        a QA model or more sophisticated methods.

        Args:
            question: Question being asked
            context: Retrieved context

        Returns:
            Extracted answer string
        """
        # Split into sentences
        sentences = re.split(r'[.!?]+', context)
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            return "No answer found"

        # Simple heuristic: return first sentence (often contains answer)
        # In a real system, you'd use NER, keyword matching, or a QA model
        return sentences[0]

    def evaluate_question(
        self,
        question_data: Dict[str, Any],
        namespace: str
    ) -> QuestionResult:
        """
        Evaluate a single question on both systems.

        Args:
            question_data: Question dict from dataset
            namespace: Namespace for this question

        Returns:
            QuestionResult with all metrics
        """
        question = question_data['question']
        ground_truth = question_data['answer']
        question_id = question_data['id']

        result = QuestionResult(
            question_id=question_id,
            question=question,
            ground_truth=ground_truth
        )

        # Query KP system
        if self.run_kp:
            try:
                kp_answer, kp_latency = self.query_kp_system(question, namespace)
                if kp_answer:
                    result.kp_answer = kp_answer
                    result.kp_latency_ms = kp_latency
                    result.kp_em = compute_exact_match(kp_answer, ground_truth)
                    result.kp_f1 = compute_f1(kp_answer, ground_truth)
            except Exception as e:
                logger.error(f"KP evaluation failed for {question_id}: {e}")
                result.error = f"KP error: {str(e)}"

        # Query vector system
        if self.run_vector:
            try:
                vector_answer, vector_latency = self.query_vector_system(question)
                if vector_answer:
                    result.vector_answer = vector_answer
                    result.vector_latency_ms = vector_latency
                    result.vector_em = compute_exact_match(vector_answer, ground_truth)
                    result.vector_f1 = compute_f1(vector_answer, ground_truth)
            except Exception as e:
                logger.error(f"Vector evaluation failed for {question_id}: {e}")
                result.error = f"Vector error: {str(e)}"

        return result

    def run_benchmark(self) -> BenchmarkSummary:
        """
        Run the complete benchmark.

        Returns:
            BenchmarkSummary with all results
        """
        # Run preflight checks before anything else
        if not self.preflight_checks():
            logger.error("Aborting benchmark due to failed preflight checks")
            raise RuntimeError("Preflight checks failed. See errors above.")

        benchmark_start_time = time.time()

        logger.info("=" * 60)
        logger.info("Starting HotpotQA Benchmark")
        logger.info("=" * 60)

        # Load dataset
        questions = self.load_dataset()

        # Create namespace based on mode
        if self.mode in ("cached", "seed"):
            # Fixed namespace for cached/seed mode (deterministic with seed)
            namespace = f"hotpotqa_validation_seed{self.seed}"
            if self.mode == "seed":
                logger.info(f"SEED MODE: Using namespace {namespace} (will ingest + trigger embeddings, skip evaluation)")
            else:
                logger.info(f"CACHED MODE: Using namespace {namespace}")
        else:
            # Timestamped namespace for fresh runs
            namespace = f"hotpotqa_{int(time.time())}"
            logger.info(f"TIMESTAMPED MODE: Using namespace {namespace}")

        # Prepare documents from all questions
        logger.info("Preparing documents...")
        all_documents = []
        for q in questions:
            docs = self.prepare_documents(q['context'])
            all_documents.extend(docs)

        # Deduplicate by title
        seen_titles = set()
        unique_documents = []
        for doc in all_documents:
            title = doc['metadata']['title']
            if title not in seen_titles:
                seen_titles.add(title)
                unique_documents.append(doc)

        logger.info(f"Prepared {len(unique_documents)} unique documents")

        # Initialize systems
        if self.run_kp:
            self.initialize_kp_system(namespace)

            # Check if cached namespace already has data with embeddings
            skip_ingestion = False
            if self.mode == "cached" and not self.mock_kp:
                skip_ingestion = self._check_cached_data_exists(namespace, len(unique_documents))

            if skip_ingestion:
                logger.info(f"✓ Using cached embeddings from namespace: {namespace}")
            else:
                if not self.ingest_kp_documents(unique_documents, namespace):
                    logger.warning("KP ingestion failed, skipping KP evaluation")
                    self.run_kp = False
                elif not self.mock_kp:
                    # Trigger embedding generation via REST API
                    logger.info("Triggering embedding generation via REST API...")
                    self._trigger_embeddings(namespace)

                    if self.mode == "seed":
                        # Seed mode: don't wait, just trigger and exit early
                        logger.info("=" * 60)
                        logger.info("SEED MODE COMPLETE")
                        logger.info(f"Namespace: {namespace}")
                        logger.info(f"Documents ingested: {len(unique_documents)}")
                        logger.info("Embeddings triggered - run background worker to generate")
                        logger.info("Then use: --mode cached for fast evaluation")
                        logger.info("=" * 60)
                        return BenchmarkSummary(
                            config={"mode": "seed", "namespace": namespace, "documents": len(unique_documents)},
                            timing={"seed_time": time.time() - benchmark_start_time}
                        )
                    else:
                        # Wait for embeddings to be generated
                        logger.info("Waiting for embeddings to be generated...")
                        self._wait_for_embeddings(namespace, timeout=300)

        if self.run_vector:
            self.initialize_vector_baseline()
            if not self.ingest_vector_documents(unique_documents):
                logger.warning("Vector ingestion failed, skipping vector evaluation")
                self.run_vector = False

        # Evaluate questions (with or without batching)
        logger.info(f"Evaluating {len(questions)} questions...")

        if self.batch_size and self.batch_size < len(questions):
            self._evaluate_in_batches(questions, namespace)
        else:
            self._evaluate_all_questions(questions, namespace)

        # Compute summary metrics
        summary = self._compute_summary()

        # Add timing information
        benchmark_elapsed = time.time() - benchmark_start_time
        summary.timing = {
            'total_seconds': benchmark_elapsed,
            'avg_per_question': benchmark_elapsed / len(questions) if questions else 0
        }

        # Run statistical analysis if requested
        if self.statistical_analysis and self.run_kp and self.run_vector:
            try:
                from statistical_analysis import BenchmarkAnalysis

                # Collect F1 scores
                kp_f1_scores = [r.kp_f1 for r in self.results if r.kp_f1 is not None]
                vector_f1_scores = [r.vector_f1 for r in self.results if r.vector_f1 is not None]

                if len(kp_f1_scores) >= 2 and len(vector_f1_scores) >= 2:
                    analyzer = BenchmarkAnalysis(
                        kp_f1_scores,
                        vector_f1_scores,
                        metric_name="F1"
                    )
                    stats = analyzer.full_analysis()
                    summary.statistical_analysis = stats

                    logger.info("\nStatistical analysis complete")
                else:
                    logger.warning("Insufficient data for statistical analysis (need >= 2 samples)")
            except ImportError:
                logger.warning(
                    "Statistical analysis requested but statistical_analysis.py not available. "
                    "Skipping statistical analysis."
                )

        # Save results
        self._save_results(summary)

        # Cleanup
        if self.kp_adapter:
            self.kp_adapter.close()

        logger.info("Benchmark complete!")
        return summary

    def _check_cached_data_exists(self, namespace: str, expected_doc_count: int) -> bool:
        """
        Check if cached namespace already has facts with embeddings.

        Args:
            namespace: Namespace to check
            expected_doc_count: Expected number of documents

        Returns:
            True if data exists with embeddings, False otherwise
        """
        try:
            # Use generic queries that should match any document with embeddings
            test_queries = ["information", "the", "history", "person", "film"]

            for query in test_queries:
                result = self.kp_adapter.query(
                    question=query,
                    namespace=namespace,
                    k=10
                )

                # Check if we got results with actual scores (indicating embeddings exist)
                if result.results:
                    scored_results = [r for r in result.results if r.score and r.score > 0]
                    if len(scored_results) >= 3:  # Need at least 3 results with embeddings
                        logger.info(f"✓ Cached namespace verified: {len(scored_results)} facts with embeddings (query='{query}')")
                        return True

            logger.info(f"Cached namespace has no/insufficient embeddings yet")
            return False

        except Exception as e:
            logger.warning(f"Error checking cached data: {e}")
            return False

    def _trigger_embeddings(self, namespace: str) -> bool:
        """
        Trigger embedding generation via REST API.

        Args:
            namespace: Namespace to generate embeddings for

        Returns:
            True if trigger succeeded, False otherwise
        """
        try:
            import requests
            url = f"{self.kp_adapter.api_url}/api/facts/trigger-embeddings?workspace_id={self.kp_adapter.workspace_id}"
            headers = {
                'Content-Type': 'application/json',
                'knowledgeplane-key': self.kp_adapter.api_key
            }
            data = {
                'namespace': namespace
            }

            response = requests.post(url, json=data, headers=headers, timeout=30)
            response.raise_for_status()
            result = response.json()

            triggered_count = result.get('triggered_count', 0)
            logger.info(f"✓ Triggered embedding generation for {triggered_count} facts")
            return True

        except Exception as e:
            logger.error(f"Failed to trigger embeddings: {e}")
            return False

    def _wait_for_embeddings(self, namespace: str, timeout: int = 300) -> bool:
        """
        Wait for embeddings to be generated for facts in namespace.

        Uses aggressive polling with multiple detection strategies:
        1. Check if ANY results return from semantic search
        2. Track progress by logging result counts
        3. Succeed on first positive result

        Args:
            namespace: Namespace to monitor
            timeout: Maximum wait time in seconds

        Returns:
            True if embeddings ready, False if timeout
        """
        logger.info(f"Waiting for embeddings in namespace={namespace} (timeout: {timeout}s)...")
        start_time = time.time()
        poll_interval = 3  # Check every 3 seconds (more aggressive)
        min_required_results = 1  # Just need 1 result with embedding

        # Multiple test queries for better coverage
        test_queries = [
            "information about",  # Generic
            "located in",  # Geographic
            "born in",  # Biographical
            "the film",  # Entertainment
            "history",  # General
        ]

        last_log_time = 0
        while time.time() - start_time < timeout:
            for test_query in test_queries:
                try:
                    result = self.kp_adapter.query(
                        question=test_query,
                        namespace=namespace,
                        k=10  # Request more to increase hit chance
                    )

                    # Check if we got ANY results with scores
                    if result.results:
                        # Count results with actual scores
                        scored_results = [r for r in result.results if r.score and r.score > 0]
                        if len(scored_results) >= min_required_results:
                            elapsed = int(time.time() - start_time)
                            top_score = scored_results[0].score
                            logger.info(f"✓ Embeddings ready after {elapsed}s!")
                            logger.info(f"  Query: '{test_query}' → {len(scored_results)} results, top_score={top_score:.4f}")
                            return True

                except Exception as e:
                    # Don't spam debug logs
                    pass

            # Log progress every 10 seconds
            elapsed = int(time.time() - start_time)
            if elapsed - last_log_time >= 10:
                logger.info(f"Waiting for embeddings... ({elapsed}s/{timeout}s)")
                last_log_time = elapsed

            time.sleep(poll_interval)

        logger.error(f"Timeout waiting for embeddings after {timeout}s")
        return False

    def _evaluate_all_questions(
        self,
        questions: List[Dict[str, Any]],
        namespace: str
    ) -> None:
        """
        Evaluate all questions at once with progress tracking.

        Args:
            questions: List of questions to evaluate
            namespace: Namespace for KP queries
        """
        for i, question_data in enumerate(tqdm(questions, desc="Evaluating")):
            q_start = time.time()

            # Log question start
            logger.info(f"[BENCHMARK] Question {i+1}/{len(questions)}: {question_data['question'][:80]}...")

            result = self.evaluate_question(question_data, namespace)
            self.results.append(result)

            q_elapsed = time.time() - q_start
            self.question_times.append(q_elapsed)

            # Log question result
            kp_f1_str = f"{result.kp_f1:.3f}" if result.kp_f1 is not None else "N/A"
            logger.info(
                f"[BENCHMARK] Question {i+1} complete: "
                f"kp_f1={kp_f1_str} "
                f"time={q_elapsed:.2f}s"
            )

            # Print ETA every 10 questions (for large runs)
            if i > 0 and (i + 1) % 10 == 0 and len(questions) > 50:
                avg_time = np.mean(self.question_times)
                remaining = len(questions) - (i + 1)
                eta_seconds = remaining * avg_time
                eta_minutes = eta_seconds / 60
                logger.info(
                    f"  Progress: {i+1}/{len(questions)} questions "
                    f"({(i+1)/len(questions)*100:.1f}%) - "
                    f"ETA: {eta_minutes:.1f} minutes"
                )

    def _evaluate_in_batches(
        self,
        questions: List[Dict[str, Any]],
        namespace: str
    ) -> None:
        """
        Evaluate questions in batches to manage memory.

        Args:
            questions: List of questions to evaluate
            namespace: Namespace for KP queries
        """
        logger.info(f"Processing in batches of {self.batch_size}...")

        for batch_idx in range(0, len(questions), self.batch_size):
            batch_end = min(batch_idx + self.batch_size, len(questions))
            batch = questions[batch_idx:batch_end]

            logger.info(
                f"Processing batch {batch_idx // self.batch_size + 1}: "
                f"questions {batch_idx+1}-{batch_end}"
            )

            for question_data in tqdm(batch, desc=f"Batch {batch_idx // self.batch_size + 1}"):
                q_start = time.time()
                result = self.evaluate_question(question_data, namespace)
                self.results.append(result)

                q_elapsed = time.time() - q_start
                self.question_times.append(q_elapsed)

            # Save intermediate results
            if batch_end < len(questions):
                self._save_intermediate_results(batch_idx, batch_end)

    def _save_intermediate_results(self, batch_start: int, batch_end: int) -> None:
        """
        Save intermediate results during batch processing.

        Args:
            batch_start: Start index of batch
            batch_end: End index of batch
        """
        csv_path = self.output_dir / f"hotpotqa_partial_{batch_end}.csv"
        logger.info(f"Saving intermediate results to {csv_path}")

        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)

            # Header
            writer.writerow([
                'question_id', 'question', 'ground_truth',
                'kp_answer', 'kp_em', 'kp_f1', 'kp_latency_ms',
                'vector_answer', 'vector_em', 'vector_f1', 'vector_latency_ms',
                'error'
            ])

            # Data rows
            for result in self.results:
                writer.writerow([
                    result.question_id,
                    result.question,
                    result.ground_truth,
                    result.kp_answer or '',
                    f"{result.kp_em:.4f}" if result.kp_em is not None else '',
                    f"{result.kp_f1:.4f}" if result.kp_f1 is not None else '',
                    f"{result.kp_latency_ms:.2f}" if result.kp_latency_ms is not None else '',
                    result.vector_answer or '',
                    f"{result.vector_em:.4f}" if result.vector_em is not None else '',
                    f"{result.vector_f1:.4f}" if result.vector_f1 is not None else '',
                    f"{result.vector_latency_ms:.2f}" if result.vector_latency_ms is not None else '',
                    result.error or ''
                ])

    def _compute_summary(self) -> BenchmarkSummary:
        """
        Compute aggregate metrics from individual results.

        Returns:
            BenchmarkSummary with system metrics
        """
        summary = BenchmarkSummary()

        # KP metrics
        if self.run_kp:
            kp_ems = [r.kp_em for r in self.results if r.kp_em is not None]
            kp_f1s = [r.kp_f1 for r in self.results if r.kp_f1 is not None]
            kp_latencies = [r.kp_latency_ms for r in self.results if r.kp_latency_ms is not None]

            summary.kp = SystemMetrics(
                avg_em=np.mean(kp_ems) if kp_ems else 0.0,
                avg_f1=np.mean(kp_f1s) if kp_f1s else 0.0,
                avg_latency_ms=np.mean(kp_latencies) if kp_latencies else 0.0,
                questions_evaluated=len(self.results),
                questions_answered=len(kp_ems),
                errors=len([r for r in self.results if r.error and "KP" in r.error])
            )

        # Vector metrics
        if self.run_vector:
            vector_ems = [r.vector_em for r in self.results if r.vector_em is not None]
            vector_f1s = [r.vector_f1 for r in self.results if r.vector_f1 is not None]
            vector_latencies = [r.vector_latency_ms for r in self.results if r.vector_latency_ms is not None]

            summary.vector = SystemMetrics(
                avg_em=np.mean(vector_ems) if vector_ems else 0.0,
                avg_f1=np.mean(vector_f1s) if vector_f1s else 0.0,
                avg_latency_ms=np.mean(vector_latencies) if vector_latencies else 0.0,
                questions_evaluated=len(self.results),
                questions_answered=len(vector_ems),
                errors=len([r for r in self.results if r.error and "Vector" in r.error])
            )

        # Compute improvements
        if self.run_kp and self.run_vector:
            summary.improvement = {
                'em_delta': summary.kp.avg_em - summary.vector.avg_em,
                'f1_delta': summary.kp.avg_f1 - summary.vector.avg_f1,
                'em_percent_change': ((summary.kp.avg_em - summary.vector.avg_em) / summary.vector.avg_em * 100) if summary.vector.avg_em > 0 else 0.0,
                'f1_percent_change': ((summary.kp.avg_f1 - summary.vector.avg_f1) / summary.vector.avg_f1 * 100) if summary.vector.avg_f1 > 0 else 0.0
            }

        # Store config
        summary.config = {
            'n_questions': self.n_questions,
            'top_k': self.top_k,
            'seed': self.seed,
            'run_kp': self.run_kp,
            'run_vector': self.run_vector,
            'mock_kp': self.mock_kp,
            'sample_method': self.sample_method,
            'batch_size': self.batch_size,
            'statistical_analysis': self.statistical_analysis,
            'timestamp': datetime.now().isoformat()
        }

        return summary

    def _save_results(self, summary: BenchmarkSummary) -> None:
        """
        Save results to CSV and JSON files.

        Args:
            summary: Benchmark summary with metrics
        """
        # Save detailed CSV
        csv_path = self.output_dir / "hotpotqa_results.csv"
        logger.info(f"Saving results to {csv_path}")

        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)

            # Header
            writer.writerow([
                'question_id',
                'question',
                'ground_truth',
                'kp_answer',
                'kp_em',
                'kp_f1',
                'kp_latency_ms',
                'vector_answer',
                'vector_em',
                'vector_f1',
                'vector_latency_ms',
                'error'
            ])

            # Data rows
            for result in self.results:
                writer.writerow([
                    result.question_id,
                    result.question,
                    result.ground_truth,
                    result.kp_answer or '',
                    f"{result.kp_em:.4f}" if result.kp_em is not None else '',
                    f"{result.kp_f1:.4f}" if result.kp_f1 is not None else '',
                    f"{result.kp_latency_ms:.2f}" if result.kp_latency_ms is not None else '',
                    result.vector_answer or '',
                    f"{result.vector_em:.4f}" if result.vector_em is not None else '',
                    f"{result.vector_f1:.4f}" if result.vector_f1 is not None else '',
                    f"{result.vector_latency_ms:.2f}" if result.vector_latency_ms is not None else '',
                    result.error or ''
                ])

        # Save summary JSON
        json_path = self.output_dir / "hotpotqa_summary.json"
        logger.info(f"Saving summary to {json_path}")

        # Convert dataclasses to dicts
        summary_dict = {
            'kp': asdict(summary.kp) if self.run_kp else None,
            'vector': asdict(summary.vector) if self.run_vector else None,
            'improvement': summary.improvement,
            'config': summary.config,
            'timing': summary.timing,
            'statistical_analysis': summary.statistical_analysis
        }

        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(summary_dict, f, indent=2)

    def print_summary(self, summary: BenchmarkSummary) -> None:
        """
        Print benchmark summary to console.

        Args:
            summary: Benchmark summary with metrics
        """
        print("\n" + "=" * 60)
        print("HotpotQA Benchmark Results")
        print("=" * 60)

        # Check for seed mode
        if summary.config.get('mode') == 'seed':
            print("\n🌱 SEED MODE - Data ingested, no evaluation performed")
            print(f"  Namespace: {summary.config.get('namespace', 'N/A')}")
            print(f"  Documents: {summary.config.get('documents', 0)}")
            print("\n  Next step: Run with --mode cached for fast evaluation")
            print("=" * 60)
            return

        if self.run_kp:
            print("\nKnowledgePlane:")
            print(f"  Exact Match:    {summary.kp.avg_em * 100:.1f}%")
            print(f"  F1 Score:       {summary.kp.avg_f1 * 100:.1f}%")
            print(f"  Avg Latency:    {summary.kp.avg_latency_ms:.0f}ms")
            print(f"  Questions:      {summary.kp.questions_answered}/{summary.kp.questions_evaluated}")
            if summary.kp.errors > 0:
                print(f"  Errors:         {summary.kp.errors}")

        if self.run_vector:
            print("\nVector Baseline:")
            print(f"  Exact Match:    {summary.vector.avg_em * 100:.1f}%")
            print(f"  F1 Score:       {summary.vector.avg_f1 * 100:.1f}%")
            print(f"  Avg Latency:    {summary.vector.avg_latency_ms:.0f}ms")
            print(f"  Questions:      {summary.vector.questions_answered}/{summary.vector.questions_evaluated}")
            if summary.vector.errors > 0:
                print(f"  Errors:         {summary.vector.errors}")

        if self.run_kp and self.run_vector:
            print("\nImprovement:")
            em_delta = summary.improvement['em_delta']
            f1_delta = summary.improvement['f1_delta']
            print(f"  EM:             {em_delta:+.1f} percentage points ({summary.improvement['em_percent_change']:+.1f}%)")
            print(f"  F1:             {f1_delta:+.1f} percentage points ({summary.improvement['f1_percent_change']:+.1f}%)")

            if em_delta > 0 and f1_delta > 0:
                print("\n✓ KP demonstrates superior multi-hop reasoning!")
            elif em_delta > 0 or f1_delta > 0:
                print("\n~ KP shows mixed results compared to baseline")
            else:
                print("\n✗ Vector baseline outperforms KP on this benchmark")

        # Print timing information
        if summary.timing:
            print("\nTiming:")
            if 'seed_time' in summary.timing:
                # Seed mode
                print(f"  Seed Time:      {summary.timing['seed_time']:.1f}s")
            elif 'total_seconds' in summary.timing:
                # Normal evaluation mode
                print(f"  Total Time:     {summary.timing['total_seconds']:.1f}s")
                print(f"  Avg/Question:   {summary.timing.get('avg_per_question', 0):.2f}s")

        print("\n" + "=" * 60)

        # Print statistical analysis if available
        if summary.statistical_analysis:
            try:
                from statistical_analysis import BenchmarkAnalysis

                # Reconstruct analyzer for printing
                kp_f1_scores = [r.kp_f1 for r in self.results if r.kp_f1 is not None]
                vector_f1_scores = [r.vector_f1 for r in self.results if r.vector_f1 is not None]

                analyzer = BenchmarkAnalysis(
                    kp_f1_scores,
                    vector_f1_scores,
                    metric_name="F1"
                )
                analyzer.print_report()
            except ImportError:
                logger.warning("Cannot print statistical analysis report (module not available)")


# Scoring Functions

def normalize_answer(text: str) -> str:
    """
    Normalize text for answer comparison.

    Removes articles, punctuation, extra whitespace, and converts to lowercase.
    This is the standard normalization used in SQuAD and HotpotQA evaluation.

    Args:
        text: Text to normalize

    Returns:
        Normalized text
    """
    # Lowercase
    text = text.lower()

    # Remove articles
    text = re.sub(r'\b(a|an|the)\b', ' ', text)

    # Remove punctuation
    text = text.translate(str.maketrans('', '', string.punctuation))

    # Remove extra whitespace
    text = ' '.join(text.split())

    return text


def compute_exact_match(prediction: str, ground_truth: str) -> float:
    """
    Compute exact match score.

    Returns 1.0 if normalized prediction equals normalized ground truth,
    0.0 otherwise.

    Args:
        prediction: Predicted answer
        ground_truth: Ground truth answer

    Returns:
        Exact match score (0.0 or 1.0)
    """
    return 1.0 if normalize_answer(prediction) == normalize_answer(ground_truth) else 0.0


def compute_f1(prediction: str, ground_truth: str) -> float:
    """
    Compute token-level F1 score.

    Computes precision and recall over normalized tokens, then returns
    their harmonic mean (F1 score).

    Args:
        prediction: Predicted answer
        ground_truth: Ground truth answer

    Returns:
        F1 score (0.0 to 1.0)
    """
    pred_tokens = normalize_answer(prediction).split()
    truth_tokens = normalize_answer(ground_truth).split()

    # Handle empty cases
    if len(pred_tokens) == 0 or len(truth_tokens) == 0:
        return 1.0 if pred_tokens == truth_tokens else 0.0

    # Count token overlaps
    pred_counter = Counter(pred_tokens)
    truth_counter = Counter(truth_tokens)

    # Compute overlap
    overlap = sum((pred_counter & truth_counter).values())

    # Compute precision and recall
    precision = overlap / len(pred_tokens)
    recall = overlap / len(truth_tokens)

    # Compute F1
    if precision + recall == 0:
        return 0.0

    f1 = 2 * precision * recall / (precision + recall)
    return f1


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="HotpotQA Multi-Hop Reasoning Benchmark for KnowledgePlane",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    parser.add_argument(
        '--n',
        type=int,
        default=20,
        help='Number of questions to evaluate (20=quick test, 100=moderate, 500+=statistical)'
    )

    parser.add_argument(
        '--top_k',
        type=int,
        default=5,
        help='Number of documents to retrieve per query'
    )

    parser.add_argument(
        '--seed',
        type=int,
        default=42,
        help='Random seed for reproducibility'
    )

    parser.add_argument(
        '--sample-method',
        type=str,
        choices=['random', 'first', 'stratified'],
        default='random',
        help='Sampling method: random (shuffled), first (sequential), stratified (balanced by difficulty)'
    )

    parser.add_argument(
        '--batch-size',
        type=int,
        default=None,
        help='Process in batches for memory efficiency (default: process all at once)'
    )

    parser.add_argument(
        '--statistical-analysis',
        action='store_true',
        help='Run full statistical analysis with confidence intervals and hypothesis testing'
    )

    parser.add_argument(
        '--run_kp',
        type=lambda x: x.lower() == 'true',
        default=True,
        help='Run KnowledgePlane system (true/false)'
    )

    parser.add_argument(
        '--run_vector',
        type=lambda x: x.lower() == 'true',
        default=True,
        help='Run vector baseline system (true/false)'
    )

    parser.add_argument(
        '--mock_kp',
        action='store_true',
        help='Use mock KP adapter (no server required)'
    )

    parser.add_argument(
        '--output_dir',
        type=str,
        default='output',
        help='Directory for output files'
    )

    parser.add_argument(
        '--mode',
        type=str,
        choices=['cached', 'timestamped', 'seed'],
        default='timestamped',
        help='''Namespace mode:
  - cached: Reuse existing embeddings (fastest, requires prior seed run)
  - timestamped: Fresh namespace each run (full pipeline, slow)
  - seed: Ingest data + trigger embeddings, skip evaluation (prep for cached mode)'''
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    # Validate arguments
    if not args.run_kp and not args.run_vector:
        logger.error("At least one system (--run_kp or --run_vector) must be enabled")
        return 1

    if args.n < 1:
        logger.error("Number of questions must be >= 1")
        return 1

    # Create benchmark
    benchmark = HotpotQABenchmark(
        n_questions=args.n,
        top_k=args.top_k,
        seed=args.seed,
        run_kp=args.run_kp,
        run_vector=args.run_vector,
        mock_kp=args.mock_kp,
        output_dir=args.output_dir,
        sample_method=args.sample_method,
        batch_size=args.batch_size,
        statistical_analysis=args.statistical_analysis,
        mode=args.mode
    )

    # Run benchmark
    try:
        summary = benchmark.run_benchmark()
        benchmark.print_summary(summary)
        return 0
    except Exception as e:
        logger.error(f"Benchmark failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit(main())
