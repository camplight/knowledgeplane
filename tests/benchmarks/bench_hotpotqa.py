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
import re
import string
import time
from collections import Counter
from dataclasses import dataclass, field, asdict
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
from vector_baseline import VectorBaseline, Document


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
        output_dir: str = "output"
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
        """
        self.n_questions = n_questions
        self.top_k = top_k
        self.seed = seed
        self.run_kp = run_kp
        self.run_vector = run_vector
        self.mock_kp = mock_kp
        self.output_dir = Path(output_dir)

        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Set random seed for reproducibility
        np.random.seed(seed)

        # Initialize adapters
        self.kp_adapter: Optional[KnowledgePlaneAdapter] = None
        self.vector_baseline: Optional[VectorBaseline] = None

        # Results storage
        self.results: List[QuestionResult] = []

        logger.info(f"Initialized HotpotQA benchmark: n={n_questions}, k={top_k}, seed={seed}")

    def load_dataset(self) -> List[Dict[str, Any]]:
        """
        Load HotpotQA dataset from HuggingFace.

        Returns:
            List of question dicts with context, question, answer, and supporting facts
        """
        logger.info("Loading HotpotQA dataset (distractor setting)...")

        # Load dataset
        dataset = load_dataset("hotpot_qa", "distractor", split="validation")

        # Sample n questions deterministically
        indices = np.arange(len(dataset))
        np.random.shuffle(indices)
        selected_indices = indices[:self.n_questions]

        questions = []
        for idx in selected_indices:
            item = dataset[int(idx)]
            questions.append({
                'id': item['id'],
                'question': item['question'],
                'answer': item['answer'],
                'type': item['type'],
                'level': item['level'],
                'context': item['context'],  # List of [title, [sentences]]
                'supporting_facts': item['supporting_facts']  # List of [title, sent_idx]
            })

        logger.info(f"Loaded {len(questions)} questions from HotpotQA")
        return questions

    def prepare_documents(
        self,
        context: List[Tuple[str, List[str]]]
    ) -> List[Dict[str, Any]]:
        """
        Prepare documents from HotpotQA context.

        Each context entry is [title, [sentences]]. We create one document
        per title with all sentences concatenated.

        Args:
            context: List of [title, sentences] tuples

        Returns:
            List of document dicts ready for ingestion
        """
        documents = []

        for title, sentences in context:
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
                    'num_sentences': len(sentences)
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
        logger.info("=" * 60)
        logger.info("Starting HotpotQA Benchmark")
        logger.info("=" * 60)

        # Load dataset
        questions = self.load_dataset()

        # Create unique namespace for this run
        namespace = f"hotpotqa_{int(time.time())}"
        logger.info(f"Using namespace: {namespace}")

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
            if not self.ingest_kp_documents(unique_documents, namespace):
                logger.warning("KP ingestion failed, skipping KP evaluation")
                self.run_kp = False

        if self.run_vector:
            self.initialize_vector_baseline()
            if not self.ingest_vector_documents(unique_documents):
                logger.warning("Vector ingestion failed, skipping vector evaluation")
                self.run_vector = False

        # Evaluate questions
        logger.info(f"Evaluating {len(questions)} questions...")
        for question_data in tqdm(questions, desc="Evaluating"):
            result = self.evaluate_question(question_data, namespace)
            self.results.append(result)

        # Compute summary metrics
        summary = self._compute_summary()

        # Save results
        self._save_results(summary)

        # Cleanup
        if self.kp_adapter:
            self.kp_adapter.close()

        logger.info("Benchmark complete!")
        return summary

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
            'mock_kp': self.mock_kp
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
            'config': summary.config
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

        print("\n" + "=" * 60)


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
        help='Number of questions to evaluate'
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
        output_dir=args.output_dir
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
