#!/usr/bin/env python3
"""
MS MARCO Passage Ranking Benchmark for KnowledgePlane

This script evaluates KnowledgePlane's passage retrieval quality against
a vector baseline using the MS MARCO passage ranking dataset.

MS MARCO tests single-hop passage ranking - given a query, rank passages
by relevance. Simpler than HotpotQA but tests core retrieval quality.

Usage:
    python bench_msmarco.py --n 100 --k 10 --run_kp true --run_vector true
    python bench_msmarco.py --n 50 --mock_kp --k 5
"""

import argparse
import csv
import json
import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from math import log2
from pathlib import Path
from typing import List, Dict, Optional, Any, Set, Tuple

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
class QueryResult:
    """Result for a single query evaluation."""
    query_id: str
    query: str
    n_passages: int
    n_relevant: int
    kp_mrr: Optional[float] = None
    kp_recall_at_k: Optional[float] = None
    kp_ndcg_at_k: Optional[float] = None
    kp_latency_ms: Optional[float] = None
    vector_mrr: Optional[float] = None
    vector_recall_at_k: Optional[float] = None
    vector_ndcg_at_k: Optional[float] = None
    vector_latency_ms: Optional[float] = None
    error: Optional[str] = None


@dataclass
class SystemMetrics:
    """Aggregate metrics for a system."""
    avg_mrr: float = 0.0
    avg_recall_at_k: float = 0.0
    avg_ndcg_at_k: float = 0.0
    avg_latency_ms: float = 0.0
    queries_evaluated: int = 0
    queries_answered: int = 0
    errors: int = 0


@dataclass
class BenchmarkSummary:
    """Complete benchmark summary."""
    kp: SystemMetrics = field(default_factory=SystemMetrics)
    vector: SystemMetrics = field(default_factory=SystemMetrics)
    improvement: Dict[str, float] = field(default_factory=dict)
    config: Dict[str, Any] = field(default_factory=dict)


class MSMARCOBenchmark:
    """
    MS MARCO passage ranking benchmark executor for KnowledgePlane.

    Loads MS MARCO queries, prepares passages, runs both KP and vector
    baseline, computes ranking metrics (MRR, Recall@k, NDCG@k), and saves results.
    """

    def __init__(
        self,
        n_queries: int = 100,
        k: int = 10,
        seed: int = 42,
        run_kp: bool = True,
        run_vector: bool = True,
        mock_kp: bool = False,
        output_dir: str = "output"
    ):
        """
        Initialize the benchmark.

        Args:
            n_queries: Number of queries to evaluate
            k: Number of passages to retrieve (for Recall@k, NDCG@k)
            seed: Random seed for reproducibility
            run_kp: Whether to run KP system
            run_vector: Whether to run vector baseline
            mock_kp: Use mock KP adapter (no server required)
            output_dir: Directory for output files
        """
        self.n_queries = n_queries
        self.k = k
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
        self.results: List[QueryResult] = []

        logger.info(f"Initialized MS MARCO benchmark: n={n_queries}, k={k}, seed={seed}")

    def load_dataset(self) -> List[Dict[str, Any]]:
        """
        Load MS MARCO passage ranking dataset from HuggingFace.

        Returns:
            List of query dicts with query, passages, and relevance labels
        """
        logger.info("Loading MS MARCO passage ranking dataset...")

        # Load dataset (using v2.1 validation split)
        dataset = load_dataset("ms_marco", "v2.1", split="validation")

        # Sample n queries deterministically
        indices = np.arange(len(dataset))
        np.random.shuffle(indices)
        selected_indices = indices[:self.n_queries]

        queries = []
        for idx in selected_indices:
            item = dataset[int(idx)]

            # Extract query and passages
            query_data = {
                'id': str(idx),
                'query': item['query'],
                'passages': []
            }

            # Process passages with relevance labels
            # MS MARCO HuggingFace structure: passages is a dict with parallel lists
            # - passages['passage_text']: list of passage strings
            # - passages['is_selected']: list of 0/1 relevance labels
            passages = item['passages']
            for i in range(len(passages['passage_text'])):
                query_data['passages'].append({
                    'id': f"passage_{idx}_{i}",
                    'text': passages['passage_text'][i],
                    'is_relevant': passages['is_selected'][i] == 1
                })

            queries.append(query_data)

        logger.info(f"Loaded {len(queries)} queries from MS MARCO")
        return queries

    def prepare_passages(
        self,
        query_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Prepare passages from MS MARCO query data.

        Args:
            query_data: Query dict with passages

        Returns:
            List of passage dicts ready for ingestion
        """
        documents = []

        for passage in query_data['passages']:
            doc = {
                'content': passage['text'],
                'filename': f"{passage['id']}.txt",
                'mimeType': 'text/plain',
                'metadata': {
                    'passage_id': passage['id'],
                    'query_id': query_data['id'],
                    'is_relevant': passage['is_relevant'],
                    'source': 'msmarco'
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

    def ingest_kp_passages(
        self,
        passages: List[Dict[str, Any]],
        namespace: str
    ) -> bool:
        """
        Ingest passages into KP system.

        Args:
            passages: List of passage dicts
            namespace: Namespace for isolation

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Ingesting {len(passages)} passages into KP...")
            start_time = time.time()

            results = self.kp_adapter.ingest_documents(passages, namespace=namespace)

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

    def ingest_vector_passages(
        self,
        passages: List[Dict[str, Any]]
    ) -> bool:
        """
        Ingest passages into vector baseline.

        Args:
            passages: List of passage dicts

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Ingesting {len(passages)} passages into vector baseline...")
            start_time = time.time()

            # Convert to Document objects
            docs = [
                Document(
                    id=passage['metadata']['passage_id'],
                    text=passage['content'],
                    metadata=passage.get('metadata', {})
                )
                for passage in passages
            ]

            self.vector_baseline.ingest_documents(docs)

            elapsed = time.time() - start_time
            stats = self.vector_baseline.get_stats()

            logger.info(
                f"Vector ingestion complete: {stats['num_chunks']} chunks "
                f"from {stats['unique_documents']} passages in {elapsed:.2f}s"
            )
            return True

        except Exception as e:
            logger.error(f"Vector ingestion failed: {e}", exc_info=True)
            return False

    def rank_passages_kp(
        self,
        query: str,
        namespace: str,
        passage_ids: List[str]
    ) -> Tuple[List[str], float]:
        """
        Rank passages using KP system.

        Args:
            query: Query string
            namespace: Namespace filter
            passage_ids: List of passage IDs to rank

        Returns:
            Tuple of (ranked_passage_ids, latency_ms)
        """
        try:
            start_time = time.time()
            result = self.kp_adapter.query(
                question=query,
                namespace=namespace,
                k=self.k,
                search_mode="hybrid"
            )
            latency_ms = (time.time() - start_time) * 1000

            # Extract passage IDs from results (sorted by relevance)
            ranked_ids = []
            for r in result.results[:self.k]:
                # Extract passage_id from metadata if available
                passage_id = r.metadata.get('passage_id') if hasattr(r, 'metadata') else None
                if passage_id:
                    ranked_ids.append(passage_id)

            return ranked_ids, latency_ms

        except Exception as e:
            logger.error(f"KP ranking failed: {e}", exc_info=True)
            return [], 0.0

    def rank_passages_vector(
        self,
        query: str,
        passage_ids: List[str]
    ) -> Tuple[List[str], float]:
        """
        Rank passages using vector baseline.

        Args:
            query: Query string
            passage_ids: List of passage IDs to rank

        Returns:
            Tuple of (ranked_passage_ids, latency_ms)
        """
        try:
            start_time = time.time()

            # Get embeddings for query
            query_embedding = self.vector_baseline._embed_texts([query])[0]

            # Retrieve top-k chunks
            retrieved = self.vector_baseline._retrieve(query_embedding, self.k)

            latency_ms = (time.time() - start_time) * 1000

            # Extract unique passage IDs (in ranking order)
            ranked_ids = []
            seen = set()
            for result in retrieved:
                passage_id = result.chunk.doc_id
                if passage_id not in seen:
                    ranked_ids.append(passage_id)
                    seen.add(passage_id)

            return ranked_ids, latency_ms

        except Exception as e:
            logger.error(f"Vector ranking failed: {e}", exc_info=True)
            return [], 0.0

    def evaluate_query(
        self,
        query_data: Dict[str, Any],
        namespace: str
    ) -> QueryResult:
        """
        Evaluate a single query on both systems.

        Args:
            query_data: Query dict from dataset
            namespace: Namespace for this query

        Returns:
            QueryResult with all metrics
        """
        query = query_data['query']
        query_id = query_data['id']

        # Get relevant passage IDs
        relevant_passages = {
            p['id'] for p in query_data['passages'] if p['is_relevant']
        }

        # Create relevance scores for NDCG
        relevance_scores = {
            p['id']: (1 if p['is_relevant'] else 0)
            for p in query_data['passages']
        }

        passage_ids = [p['id'] for p in query_data['passages']]

        result = QueryResult(
            query_id=query_id,
            query=query,
            n_passages=len(passage_ids),
            n_relevant=len(relevant_passages)
        )

        # Rank with KP
        if self.run_kp:
            try:
                kp_ranked, kp_latency = self.rank_passages_kp(query, namespace, passage_ids)
                if kp_ranked:
                    result.kp_latency_ms = kp_latency
                    result.kp_mrr = compute_mrr(kp_ranked, relevant_passages)
                    result.kp_recall_at_k = compute_recall_at_k(kp_ranked, relevant_passages, self.k)
                    result.kp_ndcg_at_k = compute_ndcg_at_k(kp_ranked, relevance_scores, self.k)
            except Exception as e:
                logger.error(f"KP evaluation failed for {query_id}: {e}")
                result.error = f"KP error: {str(e)}"

        # Rank with vector baseline
        if self.run_vector:
            try:
                vector_ranked, vector_latency = self.rank_passages_vector(query, passage_ids)
                if vector_ranked:
                    result.vector_latency_ms = vector_latency
                    result.vector_mrr = compute_mrr(vector_ranked, relevant_passages)
                    result.vector_recall_at_k = compute_recall_at_k(vector_ranked, relevant_passages, self.k)
                    result.vector_ndcg_at_k = compute_ndcg_at_k(vector_ranked, relevance_scores, self.k)
            except Exception as e:
                logger.error(f"Vector evaluation failed for {query_id}: {e}")
                result.error = f"Vector error: {str(e)}"

        return result

    def run_benchmark(self) -> BenchmarkSummary:
        """
        Run the complete benchmark.

        Returns:
            BenchmarkSummary with all results
        """
        logger.info("=" * 60)
        logger.info("Starting MS MARCO Passage Ranking Benchmark")
        logger.info("=" * 60)

        # Load dataset
        queries = self.load_dataset()

        # Create unique namespace for this run
        namespace = f"msmarco_{int(time.time())}"
        logger.info(f"Using namespace: {namespace}")

        # Process each query
        logger.info(f"Evaluating {len(queries)} queries...")

        for query_data in tqdm(queries, desc="Evaluating"):
            # Prepare passages for this query
            passages = self.prepare_passages(query_data)

            # Create query-specific namespace
            query_namespace = f"{namespace}_q{query_data['id']}"

            # Initialize systems for this query
            if self.run_kp:
                if self.kp_adapter is None:
                    self.initialize_kp_system(namespace)
                if not self.ingest_kp_passages(passages, query_namespace):
                    logger.warning(f"KP ingestion failed for query {query_data['id']}")
                    continue

            if self.run_vector:
                # Reset vector baseline for each query to ensure isolation
                self.initialize_vector_baseline()
                if not self.ingest_vector_passages(passages):
                    logger.warning(f"Vector ingestion failed for query {query_data['id']}")
                    continue

            # Evaluate query
            result = self.evaluate_query(query_data, query_namespace)
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
            kp_mrrs = [r.kp_mrr for r in self.results if r.kp_mrr is not None]
            kp_recalls = [r.kp_recall_at_k for r in self.results if r.kp_recall_at_k is not None]
            kp_ndcgs = [r.kp_ndcg_at_k for r in self.results if r.kp_ndcg_at_k is not None]
            kp_latencies = [r.kp_latency_ms for r in self.results if r.kp_latency_ms is not None]

            summary.kp = SystemMetrics(
                avg_mrr=np.mean(kp_mrrs) if kp_mrrs else 0.0,
                avg_recall_at_k=np.mean(kp_recalls) if kp_recalls else 0.0,
                avg_ndcg_at_k=np.mean(kp_ndcgs) if kp_ndcgs else 0.0,
                avg_latency_ms=np.mean(kp_latencies) if kp_latencies else 0.0,
                queries_evaluated=len(self.results),
                queries_answered=len(kp_mrrs),
                errors=len([r for r in self.results if r.error and "KP" in r.error])
            )

        # Vector metrics
        if self.run_vector:
            vector_mrrs = [r.vector_mrr for r in self.results if r.vector_mrr is not None]
            vector_recalls = [r.vector_recall_at_k for r in self.results if r.vector_recall_at_k is not None]
            vector_ndcgs = [r.vector_ndcg_at_k for r in self.results if r.vector_ndcg_at_k is not None]
            vector_latencies = [r.vector_latency_ms for r in self.results if r.vector_latency_ms is not None]

            summary.vector = SystemMetrics(
                avg_mrr=np.mean(vector_mrrs) if vector_mrrs else 0.0,
                avg_recall_at_k=np.mean(vector_recalls) if vector_recalls else 0.0,
                avg_ndcg_at_k=np.mean(vector_ndcgs) if vector_ndcgs else 0.0,
                avg_latency_ms=np.mean(vector_latencies) if vector_latencies else 0.0,
                queries_evaluated=len(self.results),
                queries_answered=len(vector_mrrs),
                errors=len([r for r in self.results if r.error and "Vector" in r.error])
            )

        # Compute improvements
        if self.run_kp and self.run_vector:
            summary.improvement = {
                'mrr_delta': summary.kp.avg_mrr - summary.vector.avg_mrr,
                'recall_delta': summary.kp.avg_recall_at_k - summary.vector.avg_recall_at_k,
                'ndcg_delta': summary.kp.avg_ndcg_at_k - summary.vector.avg_ndcg_at_k,
                'mrr_percent_change': ((summary.kp.avg_mrr - summary.vector.avg_mrr) / summary.vector.avg_mrr * 100) if summary.vector.avg_mrr > 0 else 0.0,
                'recall_percent_change': ((summary.kp.avg_recall_at_k - summary.vector.avg_recall_at_k) / summary.vector.avg_recall_at_k * 100) if summary.vector.avg_recall_at_k > 0 else 0.0,
                'ndcg_percent_change': ((summary.kp.avg_ndcg_at_k - summary.vector.avg_ndcg_at_k) / summary.vector.avg_ndcg_at_k * 100) if summary.vector.avg_ndcg_at_k > 0 else 0.0
            }

        # Store config
        summary.config = {
            'n_queries': self.n_queries,
            'k': self.k,
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
        csv_path = self.output_dir / "msmarco_results.csv"
        logger.info(f"Saving results to {csv_path}")

        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)

            # Header
            writer.writerow([
                'query_id',
                'query',
                'n_passages',
                'n_relevant',
                'kp_mrr',
                'kp_recall_at_k',
                'kp_ndcg_at_k',
                'kp_latency_ms',
                'vector_mrr',
                'vector_recall_at_k',
                'vector_ndcg_at_k',
                'vector_latency_ms',
                'error'
            ])

            # Data rows
            for result in self.results:
                writer.writerow([
                    result.query_id,
                    result.query,
                    result.n_passages,
                    result.n_relevant,
                    f"{result.kp_mrr:.4f}" if result.kp_mrr is not None else '',
                    f"{result.kp_recall_at_k:.4f}" if result.kp_recall_at_k is not None else '',
                    f"{result.kp_ndcg_at_k:.4f}" if result.kp_ndcg_at_k is not None else '',
                    f"{result.kp_latency_ms:.2f}" if result.kp_latency_ms is not None else '',
                    f"{result.vector_mrr:.4f}" if result.vector_mrr is not None else '',
                    f"{result.vector_recall_at_k:.4f}" if result.vector_recall_at_k is not None else '',
                    f"{result.vector_ndcg_at_k:.4f}" if result.vector_ndcg_at_k is not None else '',
                    f"{result.vector_latency_ms:.2f}" if result.vector_latency_ms is not None else '',
                    result.error or ''
                ])

        # Save summary JSON
        json_path = self.output_dir / "msmarco_summary.json"
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
        print("MS MARCO Passage Ranking Benchmark Results")
        print("=" * 60)

        if self.run_kp:
            print("\nKnowledgePlane:")
            print(f"  MRR:            {summary.kp.avg_mrr:.4f}")
            print(f"  Recall@{self.k}:      {summary.kp.avg_recall_at_k:.4f}")
            print(f"  NDCG@{self.k}:        {summary.kp.avg_ndcg_at_k:.4f}")
            print(f"  Avg Latency:    {summary.kp.avg_latency_ms:.0f}ms")
            print(f"  Queries:        {summary.kp.queries_answered}/{summary.kp.queries_evaluated}")
            if summary.kp.errors > 0:
                print(f"  Errors:         {summary.kp.errors}")

        if self.run_vector:
            print("\nVector Baseline:")
            print(f"  MRR:            {summary.vector.avg_mrr:.4f}")
            print(f"  Recall@{self.k}:      {summary.vector.avg_recall_at_k:.4f}")
            print(f"  NDCG@{self.k}:        {summary.vector.avg_ndcg_at_k:.4f}")
            print(f"  Avg Latency:    {summary.vector.avg_latency_ms:.0f}ms")
            print(f"  Queries:        {summary.vector.queries_answered}/{summary.vector.queries_evaluated}")
            if summary.vector.errors > 0:
                print(f"  Errors:         {summary.vector.errors}")

        if self.run_kp and self.run_vector:
            print("\nImprovement:")
            mrr_delta = summary.improvement['mrr_delta']
            recall_delta = summary.improvement['recall_delta']
            ndcg_delta = summary.improvement['ndcg_delta']
            print(f"  MRR:            {mrr_delta:+.4f} ({summary.improvement['mrr_percent_change']:+.1f}%)")
            print(f"  Recall@{self.k}:      {recall_delta:+.4f} ({summary.improvement['recall_percent_change']:+.1f}%)")
            print(f"  NDCG@{self.k}:        {ndcg_delta:+.4f} ({summary.improvement['ndcg_percent_change']:+.1f}%)")

            if mrr_delta > 0.05 and recall_delta > 0.05:
                print("\n✓ KP demonstrates superior passage ranking!")
            elif mrr_delta > 0 or recall_delta > 0:
                print("\n~ KP shows mixed results compared to baseline")
            else:
                print("\n✗ Vector baseline outperforms KP on this benchmark")

        print("\n" + "=" * 60)


# Ranking Metrics Functions

def compute_mrr(ranked_passages: List[str], relevant_passages: Set[str]) -> float:
    """
    Compute Mean Reciprocal Rank.

    MRR is the reciprocal of the rank of the first relevant passage.
    MRR = 1 if first result is relevant
    MRR = 0.5 if second result is relevant
    MRR = 0 if no relevant results

    Args:
        ranked_passages: List of passage IDs in ranking order
        relevant_passages: Set of relevant passage IDs

    Returns:
        MRR score (0.0 to 1.0)
    """
    for rank, passage_id in enumerate(ranked_passages, 1):
        if passage_id in relevant_passages:
            return 1.0 / rank
    return 0.0


def compute_recall_at_k(
    ranked_passages: List[str],
    relevant_passages: Set[str],
    k: int
) -> float:
    """
    Compute Recall@k.

    Recall@k is the fraction of relevant passages found in the top k results.

    Args:
        ranked_passages: List of passage IDs in ranking order
        relevant_passages: Set of relevant passage IDs
        k: Cutoff rank

    Returns:
        Recall@k score (0.0 to 1.0)
    """
    if not relevant_passages:
        return 0.0

    top_k = set(ranked_passages[:k])
    found = len(top_k & relevant_passages)

    return found / len(relevant_passages)


def compute_ndcg_at_k(
    ranked_passages: List[str],
    relevance_scores: Dict[str, int],
    k: int
) -> float:
    """
    Compute Normalized Discounted Cumulative Gain at k.

    NDCG considers both relevance and ranking position with logarithmic discount.
    Perfect ranking of all relevant docs gives NDCG = 1.0.

    Args:
        ranked_passages: List of passage IDs in ranking order
        relevance_scores: Dict mapping passage_id to relevance score (0 or 1)
        k: Cutoff rank

    Returns:
        NDCG@k score (0.0 to 1.0)
    """
    # Compute DCG (Discounted Cumulative Gain)
    dcg = 0.0
    for i, passage_id in enumerate(ranked_passages[:k]):
        relevance = relevance_scores.get(passage_id, 0)
        # Use log2(i+2) to match standard NDCG formula
        dcg += (2 ** relevance - 1) / log2(i + 2)

    # Compute IDCG (Ideal DCG)
    ideal_relevance = sorted(relevance_scores.values(), reverse=True)[:k]
    idcg = 0.0
    for i, relevance in enumerate(ideal_relevance):
        idcg += (2 ** relevance - 1) / log2(i + 2)

    # Return normalized DCG
    return dcg / idcg if idcg > 0 else 0.0


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="MS MARCO Passage Ranking Benchmark for KnowledgePlane",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    parser.add_argument(
        '--n',
        type=int,
        default=100,
        help='Number of queries to evaluate'
    )

    parser.add_argument(
        '--k',
        type=int,
        default=10,
        help='Number of passages to retrieve (for Recall@k, NDCG@k)'
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
        logger.error("Number of queries must be >= 1")
        return 1

    if args.k < 1:
        logger.error("k must be >= 1")
        return 1

    # Create benchmark
    benchmark = MSMARCOBenchmark(
        n_queries=args.n,
        k=args.k,
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
