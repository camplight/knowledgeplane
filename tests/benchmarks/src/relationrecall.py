#!/usr/bin/env python3
"""
RelationRecall Benchmark for KnowledgePlane (AI Librarian)

This benchmark evaluates KnowledgePlane's CardConsolidator ability to
auto-discover relations between facts - our key differentiator vs Mem0/Zep.

Process:
1. Create facts with known ground-truth relations
2. Wait for CardConsolidator to process and discover relations
3. Compare extracted relations against ground truth
4. Compute Relation Precision, Recall, and F1 scores

Datasets:
- synthetic: 15 thematic clusters with clear semantic relations (default)
- redocred: Re-DocRED dataset from HuggingFace (+13 F1 over DocRED)

Evaluation:
- Standard P/R/F1 on relation pairs
- NLI-verified metrics using DeBERTa entailment (optional)

Usage:
    # Quick test with synthetic data
    python relationrecall.py --n 10

    # Full benchmark with consolidation wait
    python relationrecall.py --n 100 --consolidation-timeout 600

    # Using Re-DocRED dataset
    python relationrecall.py --n 20 --dataset redocred

    # With NLI verification
    python relationrecall.py --n 10 --use-nli

    # Mock mode (no server required)
    python relationrecall.py --n 20 --mock
"""

import argparse
import csv
import json
import logging
import os
import random
import re
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple, Set
import requests

import numpy as np
from tqdm import tqdm

from lib.adapter import (
    HTTPKnowledgePlaneAdapter,
    MockKnowledgePlaneAdapter,
    KnowledgePlaneAdapter,
    cleanup_benchmark_facts_by_prefix,
)

# Optional imports for advanced features
try:
    from lib.redocred_loader import load_redocred_with_relations
    REDOCRED_AVAILABLE = True
except ImportError:
    REDOCRED_AVAILABLE = False
    load_redocred_with_relations = None

try:
    from lib.nli_verifier import NLIVerifier
    NLI_AVAILABLE = True
except ImportError:
    NLI_AVAILABLE = False
    NLIVerifier = type(None)  # Placeholder for type hints


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# =====================================================================
# Synthetic Test Data
# =====================================================================

# Ground truth relation types used by CardConsolidator
# Must match the types in @knowledgeplane/aimodel constants.ts
RELATION_TYPES = [
    "references",
    "depends_on",
    "related_to",
    "part_of",
    "causes",
    "enables",
    "contradicts",
    "supports",
]


def generate_synthetic_corpus(n_clusters: int = 10, facts_per_cluster: int = 3, seed: int = 42) -> Tuple[List[Dict], List[Dict]]:
    """
    Generate synthetic facts with known ground-truth relations.

    Each cluster contains facts that are semantically related and should be
    linked by the CardConsolidator. We generate clear, obvious relationships
    to test the system's basic relation extraction capabilities.

    Args:
        n_clusters: Number of thematic clusters to generate
        facts_per_cluster: Number of facts per cluster
        seed: Random seed for reproducibility

    Returns:
        Tuple of (facts, ground_truth_relations)
    """
    random.seed(seed)
    np.random.seed(seed)

    # Predefined knowledge clusters with clear relationships
    knowledge_templates = [
        # Technology cluster
        {
            "theme": "python_programming",
            "facts": [
                "Python is a high-level programming language created by Guido van Rossum.",
                "Python supports multiple programming paradigms including procedural, object-oriented, and functional programming.",
                "Python uses indentation for code blocks instead of curly braces like C or Java.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "enables"},
                {"from": 0, "to": 2, "type": "causes"},
            ]
        },
        {
            "theme": "machine_learning",
            "facts": [
                "Machine learning is a subset of artificial intelligence that enables computers to learn from data.",
                "Neural networks are computing systems inspired by biological neural networks in the brain.",
                "Deep learning uses multiple layers of neural networks to model complex patterns.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "related_to"},
                {"from": 1, "to": 2, "type": "enables"},
            ]
        },
        # Science cluster
        {
            "theme": "climate_change",
            "facts": [
                "Climate change refers to long-term shifts in global temperatures and weather patterns.",
                "Greenhouse gases trap heat in Earth's atmosphere, contributing to global warming.",
                "Rising sea levels are a direct consequence of melting ice caps and thermal expansion.",
            ],
            "relations": [
                {"from": 1, "to": 0, "type": "causes"},
                {"from": 0, "to": 2, "type": "causes"},
            ]
        },
        {
            "theme": "photosynthesis",
            "facts": [
                "Photosynthesis is the process by which plants convert sunlight into chemical energy.",
                "Chlorophyll is the green pigment in plants that absorbs light energy for photosynthesis.",
                "Plants produce oxygen as a byproduct of photosynthesis.",
            ],
            "relations": [
                {"from": 1, "to": 0, "type": "enables"},
                {"from": 0, "to": 2, "type": "causes"},
            ]
        },
        # History cluster
        {
            "theme": "industrial_revolution",
            "facts": [
                "The Industrial Revolution began in Britain in the late 18th century.",
                "Steam engines were a key invention that powered factories during the Industrial Revolution.",
                "Urbanization accelerated as workers moved from rural areas to factory towns.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "enables"},
                {"from": 1, "to": 2, "type": "causes"},
            ]
        },
        {
            "theme": "world_war_2",
            "facts": [
                "World War II was a global conflict that lasted from 1939 to 1945.",
                "The Allied Powers included Britain, the United States, and the Soviet Union.",
                "The war ended with the unconditional surrender of Nazi Germany and Japan.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "part_of"},
                {"from": 1, "to": 2, "type": "causes"},
            ]
        },
        # Geography cluster
        {
            "theme": "amazon_rainforest",
            "facts": [
                "The Amazon Rainforest is the world's largest tropical rainforest, spanning nine countries.",
                "The Amazon River basin contains 20% of Earth's freshwater.",
                "Deforestation threatens millions of species that depend on the Amazon ecosystem.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "part_of"},
                {"from": 0, "to": 2, "type": "related_to"},
            ]
        },
        {
            "theme": "plate_tectonics",
            "facts": [
                "Plate tectonics describes the movement of Earth's lithospheric plates.",
                "Earthquakes occur when tectonic plates suddenly slip past each other.",
                "Mountain ranges form when tectonic plates collide and push upward.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "causes"},
                {"from": 0, "to": 2, "type": "causes"},
            ]
        },
        # Economics cluster
        {
            "theme": "supply_demand",
            "facts": [
                "The law of supply and demand determines prices in a market economy.",
                "When demand exceeds supply, prices tend to increase.",
                "Price equilibrium occurs when quantity supplied equals quantity demanded.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "causes"},
                {"from": 1, "to": 2, "type": "related_to"},
            ]
        },
        {
            "theme": "inflation",
            "facts": [
                "Inflation is the rate at which prices for goods and services rise over time.",
                "Central banks use interest rates to control inflation levels.",
                "Hyperinflation can destabilize economies and erode savings.",
            ],
            "relations": [
                {"from": 1, "to": 0, "type": "related_to"},
                {"from": 0, "to": 2, "type": "causes"},
            ]
        },
        # Biology cluster
        {
            "theme": "dna_genetics",
            "facts": [
                "DNA is a molecule that carries genetic instructions for all living organisms.",
                "Genes are segments of DNA that code for specific proteins.",
                "Mutations are changes in DNA sequence that can be inherited.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "part_of"},
                {"from": 1, "to": 2, "type": "related_to"},
            ]
        },
        {
            "theme": "evolution",
            "facts": [
                "Evolution is the process by which species change over successive generations.",
                "Natural selection favors organisms with traits that enhance survival and reproduction.",
                "Fossil records provide evidence of evolutionary changes over millions of years.",
            ],
            "relations": [
                {"from": 1, "to": 0, "type": "enables"},
                {"from": 2, "to": 0, "type": "supports"},
            ]
        },
        # Physics cluster
        {
            "theme": "relativity",
            "facts": [
                "Einstein's theory of relativity revolutionized our understanding of space and time.",
                "Special relativity shows that the speed of light is constant for all observers.",
                "General relativity describes gravity as curvature in spacetime.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "part_of"},
                {"from": 0, "to": 2, "type": "part_of"},
            ]
        },
        {
            "theme": "quantum_mechanics",
            "facts": [
                "Quantum mechanics describes behavior of matter and energy at atomic scales.",
                "The uncertainty principle limits simultaneous knowledge of position and momentum.",
                "Quantum entanglement links particles regardless of distance between them.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "part_of"},
                {"from": 0, "to": 2, "type": "enables"},
            ]
        },
        # Medicine cluster
        {
            "theme": "vaccines",
            "facts": [
                "Vaccines stimulate the immune system to protect against infectious diseases.",
                "Herd immunity occurs when a sufficient proportion of a population is immune.",
                "mRNA vaccines represent a new technology that provides genetic instructions to cells.",
            ],
            "relations": [
                {"from": 0, "to": 1, "type": "causes"},
                {"from": 2, "to": 0, "type": "part_of"},
            ]
        },
    ]

    # Select clusters for this run
    selected = random.sample(knowledge_templates, min(n_clusters, len(knowledge_templates)))

    facts = []
    ground_truth_relations = []
    fact_id_counter = 0

    for cluster_idx, cluster in enumerate(selected):
        theme = cluster["theme"]
        cluster_fact_ids = []

        # Create facts
        for fact_idx, content in enumerate(cluster["facts"][:facts_per_cluster]):
            fact = {
                "content": content,
                "metadata": {
                    "theme": theme,
                    "cluster_idx": cluster_idx,
                    "fact_idx": fact_idx,
                },
                "local_id": f"fact_{fact_id_counter}",
            }
            facts.append(fact)
            cluster_fact_ids.append(fact_id_counter)
            fact_id_counter += 1

        # Create ground truth relations (using local indices within cluster)
        for rel in cluster["relations"]:
            if rel["from"] < len(cluster_fact_ids) and rel["to"] < len(cluster_fact_ids):
                ground_truth_relations.append({
                    "from_local_id": cluster_fact_ids[rel["from"]],
                    "to_local_id": cluster_fact_ids[rel["to"]],
                    "type": rel["type"],
                    "theme": theme,
                })

    logger.info(f"Generated {len(facts)} facts in {len(selected)} clusters with {len(ground_truth_relations)} ground truth relations")
    return facts, ground_truth_relations


# =====================================================================
# Data Classes
# =====================================================================

@dataclass
class RelationMetrics:
    """Metrics for relation extraction evaluation."""
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    total_predicted: int = 0
    total_expected: int = 0
    # NLI-verified metrics (optional)
    nli_precision: Optional[float] = None
    nli_recall: Optional[float] = None
    nli_f1: Optional[float] = None
    nli_verified_count: Optional[int] = None


@dataclass
class ClusterResult:
    """Result for a single thematic cluster."""
    theme: str
    facts_created: int = 0
    relations_expected: int = 0
    relations_found: int = 0
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    error: Optional[str] = None


@dataclass
class BenchmarkSummary:
    """Complete benchmark summary."""
    overall_metrics: RelationMetrics = field(default_factory=RelationMetrics)
    cluster_results: List[ClusterResult] = field(default_factory=list)
    config: Dict[str, Any] = field(default_factory=dict)
    timing: Dict[str, float] = field(default_factory=dict)
    consolidation_triggered: bool = False
    consolidation_completed: bool = False


# =====================================================================
# Benchmark Class
# =====================================================================

class RelationRecallBenchmark:
    """
    Benchmark for evaluating KnowledgePlane's relation extraction.

    This benchmark:
    1. Generates synthetic facts with known relations
    2. Ingests facts via KP REST API
    3. Triggers/waits for CardConsolidator to run
    4. Fetches created relations via API
    5. Computes precision/recall/F1 against ground truth
    """

    def __init__(
        self,
        n_clusters: int = 10,
        facts_per_cluster: int = 3,
        seed: int = 42,
        mock: bool = False,
        output_dir: str = "output",
        consolidation_timeout: int = 300,
        consolidation_poll_interval: int = 10,
        mode: str = "smart",
        dataset: str = "synthetic",
        use_nli: bool = False,
    ):
        """
        Initialize the benchmark.

        Args:
            n_clusters: Number of thematic clusters to create
            facts_per_cluster: Number of facts per cluster
            seed: Random seed for reproducibility
            mock: Use mock adapter (no server required)
            output_dir: Directory for output files
            consolidation_timeout: Max seconds to wait for consolidation
            consolidation_poll_interval: Seconds between consolidation checks
            mode: "smart" (reuse cached data) or "fresh" (always start clean)
            dataset: Dataset to use (synthetic, redocred)
            use_nli: Enable NLI-based relation verification
        """
        self.n_clusters = n_clusters
        self.facts_per_cluster = facts_per_cluster
        self.seed = seed
        self.mock = mock
        self.output_dir = Path(output_dir)
        self.consolidation_timeout = consolidation_timeout
        self.consolidation_poll_interval = consolidation_poll_interval
        self.mode = mode
        self.dataset = dataset
        self.use_nli = use_nli

        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Set random seed
        np.random.seed(seed)
        random.seed(seed)

        # Initialize adapter
        self.adapter: Optional[KnowledgePlaneAdapter] = None

        # Results storage
        self.cluster_results: List[ClusterResult] = []
        self.facts: List[Dict] = []
        self.ground_truth_relations: List[Dict] = []
        self.local_to_kp_id: Dict[int, str] = {}  # Map local_id -> KP fact ID

        # NLI verifier (lazy-loaded)
        self.nli_verifier: Optional[NLIVerifier] = None
        if use_nli:
            if not NLI_AVAILABLE:
                logger.warning("NLI verification requested but nli_verifier not available")
                self.use_nli = False
            else:
                logger.info("NLI verification enabled")

        logger.info(
            f"Initialized RelationRecall benchmark: clusters={n_clusters}, "
            f"facts/cluster={facts_per_cluster}, seed={seed}, mode={mode}, "
            f"dataset={dataset}, use_nli={use_nli}"
        )

    def preflight_checks(self) -> bool:
        """
        Run preflight checks to ensure environment is ready.

        Returns:
            True if all checks pass, False otherwise
        """
        if self.mock:
            logger.info("Preflight: Mock mode enabled, skipping service checks")
            return True

        logger.info("=" * 60)
        logger.info("Running Preflight Checks")
        logger.info("=" * 60)

        api_url = os.environ.get("KP_API_URL", "http://localhost:8081")
        checks_passed = True
        warnings = []

        # Check 1: REST API reachable
        logger.info(f"[1/4] KP REST API at {api_url}...")
        try:
            response = requests.get(f"{api_url}/health", timeout=5)
            if response.status_code == 200:
                logger.info("  REST API is healthy")
            else:
                logger.error(f"  REST API returned status {response.status_code}")
                checks_passed = False
        except requests.exceptions.ConnectionError:
            logger.error(f"  Cannot connect to REST API at {api_url}")
            checks_passed = False
        except Exception as e:
            logger.error(f"  REST API check failed: {e}")
            checks_passed = False

        # Check 2: API credentials
        logger.info("[2/4] API credentials...")
        api_key = os.environ.get("KP_API_KEY")
        workspace_id = os.environ.get("KP_WORKSPACE_ID")

        if api_key:
            logger.info("  API key set")
        else:
            logger.error("  KP_API_KEY missing")
            checks_passed = False

        if workspace_id:
            logger.info(f"  Workspace: {workspace_id}")
        else:
            logger.error("  KP_WORKSPACE_ID missing")
            checks_passed = False

        # Check 3: OpenAI key (for relation extraction)
        logger.info("[3/4] OpenAI configuration...")
        openai_key = os.environ.get("OPENAI_API_KEY")
        if openai_key and openai_key.startswith("sk-"):
            logger.info("  OpenAI API key configured")
        else:
            logger.warning("  OPENAI_API_KEY not set - CardConsolidator may not work")
            warnings.append("No OpenAI key for relation extraction")

        # Check 4: Background worker
        logger.info("[4/4] Background worker status...")
        logger.info("  Background worker status cannot be verified directly")
        logger.info("  Ensure npm run dev:background-workers is running")
        warnings.append("Background worker not verified")

        logger.info("=" * 60)
        if checks_passed:
            logger.info("All critical checks passed")
            if warnings:
                logger.info(f"  Warnings: {', '.join(warnings)}")
        else:
            logger.error("PREFLIGHT FAILED - cannot proceed")
        logger.info("=" * 60)

        return checks_passed

    def initialize_adapter(self, namespace: str) -> None:
        """Initialize the KP adapter."""
        if self.mock:
            logger.info("Initializing mock adapter...")
            self.adapter = MockKnowledgePlaneAdapter()
            self.adapter.initialize(
                mcp_url="mock://localhost",
                api_key="mock_key",
                workspace_id=namespace,
                user_id="benchmark_user"
            )
        else:
            logger.info("Initializing HTTP adapter...")
            self.adapter = HTTPKnowledgePlaneAdapter()

            mcp_url = os.getenv("KP_API_URL", "http://localhost:8081")
            api_key = os.getenv("KP_API_KEY", "benchmark-api-key")
            workspace_id = os.getenv("KP_WORKSPACE_ID", namespace)
            user_id = os.getenv("KP_USER_ID", "benchmark-user")

            self.adapter.initialize(
                mcp_url=mcp_url,
                api_key=api_key,
                workspace_id=workspace_id,
                user_id=user_id
            )

        logger.info("Adapter initialized successfully")

    def load_test_data(self) -> Tuple[List[Dict], List[Dict]]:
        """
        Load test data (facts with ground truth relations).

        Supports:
        - synthetic: Built-in thematic clusters (default)
        - redocred: Re-DocRED dataset from HuggingFace

        Returns:
            Tuple of (facts, ground_truth_relations)
        """
        if self.dataset == "redocred":
            if not REDOCRED_AVAILABLE:
                logger.warning("Re-DocRED not available, falling back to synthetic")
                self.dataset = "synthetic"
            else:
                logger.info("Loading Re-DocRED dataset...")
                facts, relations = load_redocred_with_relations(
                    n_documents=self.n_clusters,
                    seed=self.seed,
                    min_facts_per_doc=self.facts_per_cluster,
                    max_facts_per_doc=self.facts_per_cluster * 2,
                )
                self.facts = facts
                self.ground_truth_relations = relations
                logger.info(f"Loaded {len(facts)} facts with {len(relations)} ground truth relations from Re-DocRED")
                return facts, relations

        # Default: synthetic data
        logger.info("Generating synthetic test data...")

        facts, relations = generate_synthetic_corpus(
            n_clusters=self.n_clusters,
            facts_per_cluster=self.facts_per_cluster,
            seed=self.seed
        )

        self.facts = facts
        self.ground_truth_relations = relations

        logger.info(f"Loaded {len(facts)} facts with {len(relations)} ground truth relations")
        return facts, relations

    def ingest_facts(self, namespace: str) -> bool:
        """
        Ingest facts via KP API.

        Args:
            namespace: Namespace for this benchmark run

        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Ingesting {len(self.facts)} facts into KP...")

        try:
            start_time = time.time()

            for fact in tqdm(self.facts, desc="Ingesting facts"):
                # Add namespace to metadata
                metadata = fact.get("metadata", {}).copy()
                metadata["namespace"] = namespace

                doc = {
                    "content": fact["content"],
                    "metadata": metadata,
                    "filename": f"fact_{fact['local_id']}.txt",
                    "mimeType": "text/plain",
                }

                results = self.adapter.ingest_documents([doc], namespace=namespace)

                if results and results[0].fact_ids:
                    fact_id = results[0].fact_ids[0]
                    local_id = int(fact["local_id"].replace("fact_", ""))
                    self.local_to_kp_id[local_id] = fact_id

            elapsed = time.time() - start_time
            logger.info(f"Ingestion complete: {len(self.local_to_kp_id)} facts in {elapsed:.2f}s")

            return True

        except Exception as e:
            logger.error(f"Ingestion failed: {e}")
            return False

    def trigger_consolidation(self) -> bool:
        """
        Trigger the CardConsolidator worker.

        Returns:
            True if trigger succeeded, False otherwise
        """
        if self.mock:
            logger.info("Mock mode: skipping consolidation trigger")
            return True

        logger.info("Triggering CardConsolidator...")

        try:
            api_url = os.getenv("KP_API_URL", "http://localhost:8081")
            arango_url = os.environ.get("ARANGO_URL", "http://localhost:8529")

            # Create a worker trigger in the database
            trigger_url = f"{arango_url}/_db/knowledgeplane/_api/document/worker_triggers"

            trigger_doc = {
                "worker_name": "card-consolidator",
                "status": "pending",
                "created_at": datetime.utcnow().isoformat() + "Z",
            }

            response = requests.post(
                trigger_url,
                json=trigger_doc,
                auth=("root", "root"),
                timeout=10
            )

            if response.status_code in (201, 202):
                logger.info("CardConsolidator trigger created successfully")
                return True
            else:
                logger.warning(f"Failed to create trigger: {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Failed to trigger consolidation: {e}")
            return False

    def wait_for_consolidation(self, namespace: str) -> bool:
        """
        Wait for CardConsolidator to process facts.

        Args:
            namespace: Namespace to monitor

        Returns:
            True if consolidation completed, False if timeout
        """
        if self.mock:
            # Mock adapter: simulate relation creation
            self._create_mock_relations()
            return True

        logger.info(f"Waiting for consolidation (timeout: {self.consolidation_timeout}s)...")

        start_time = time.time()
        api_url = os.getenv("KP_API_URL", "http://localhost:8081")
        workspace_id = os.getenv("KP_WORKSPACE_ID")

        # Get username/email from adapter for consistent auth
        username = getattr(self.adapter, 'username', 'bench_default')
        email = getattr(self.adapter, 'email', 'bench_default@benchmark.local')

        # Get benchmark's fact IDs for precise relation detection
        benchmark_fact_ids = list(self.local_to_kp_id.values()) if self.local_to_kp_id else []
        logger.info(f"Querying relations: api_url={api_url}, workspace_id={workspace_id}, tracking {len(benchmark_fact_ids)} facts")

        last_relation_count = 0
        stable_count = 0

        while time.time() - start_time < self.consolidation_timeout:
            elapsed = int(time.time() - start_time)

            try:
                # Use direct DB query to count relations between our benchmark's facts
                # This is more reliable than REST API and avoids counting old relations
                if benchmark_fact_ids:
                    relations = self._get_relations_for_facts(benchmark_fact_ids)
                    current_count = len(relations)
                else:
                    # Fallback to REST API if no fact IDs (shouldn't happen)
                    response = requests.get(
                        f"{api_url}/api/relations",
                        params={
                            "workspace_id": workspace_id,
                            "username": username,
                            "email": email,
                            "limit": 1000,
                        },
                        timeout=10
                    )
                    if response.status_code == 200:
                        relations = response.json().get("relations", [])
                        current_count = len(relations)
                    else:
                        logger.warning(f"[{elapsed}s] API returned {response.status_code}")
                        current_count = 0

                logger.info(f"[{elapsed}s] Relations found: {current_count}")

                # Check if count is stable (consolidation complete)
                if current_count > 0 and current_count == last_relation_count:
                    stable_count += 1
                    if stable_count >= 3:  # Stable for 3 checks
                        logger.info(f"Consolidation complete: {current_count} relations created")
                        return True
                else:
                    stable_count = 0

                last_relation_count = current_count

            except Exception as e:
                elapsed = int(time.time() - start_time)
                logger.warning(f"[{elapsed}s] Error checking relations: {e}")

            time.sleep(self.consolidation_poll_interval)

        # Timeout - try direct DB query as fallback
        logger.warning(f"Consolidation timeout after {self.consolidation_timeout}s")
        logger.info("Attempting direct database query as fallback...")

        try:
            db_count = self._count_relations_direct(workspace_id)
            if db_count > 0:
                logger.warning(f"Found {db_count} relations via direct DB query - REST API may have issues")
        except Exception as e:
            logger.debug(f"Direct DB query failed: {e}")

        return False

    def _count_relations_direct(self, workspace_id: str) -> int:
        """Direct database query to count relations (debugging fallback)."""
        arango_url = os.environ.get("ARANGO_URL", "http://localhost:8529")
        db_name = os.environ.get("ARANGO_DB_NAME", "knowledgeplane")

        query = {
            "query": """
                FOR r IN relations
                FILTER r.workspace_id == @workspace_id AND r.deleted_at == null
                RETURN 1
            """,
            "bindVars": {"workspace_id": workspace_id}
        }

        response = requests.post(
            f"{arango_url}/_db/{db_name}/_api/cursor",
            json=query,
            auth=("root", "root"),
            timeout=10
        )

        if response.status_code == 201:
            return len(response.json().get("result", []))
        return 0

    def _create_mock_relations(self) -> None:
        """Create mock relations for testing without a server."""
        # In mock mode, simulate that the CardConsolidator found 80% of relations
        for rel in self.ground_truth_relations:
            if random.random() < 0.8:  # 80% success rate
                from_id = self.local_to_kp_id.get(rel["from_local_id"])
                to_id = self.local_to_kp_id.get(rel["to_local_id"])

                if from_id and to_id:
                    # Add to mock adapter's relations
                    rel_id = f"rel_{len(self.adapter.relations)}"
                    self.adapter.relations[rel_id] = {
                        "id": rel_id,
                        "from_fact": from_id,
                        "to_fact": to_id,
                        "type": rel["type"],
                    }

    def get_created_relations(self, namespace: str) -> List[Dict]:
        """
        Fetch relations created by CardConsolidator.

        Args:
            namespace: Namespace to query

        Returns:
            List of relation dicts
        """
        if self.mock:
            return list(self.adapter.relations.values())

        logger.info("Fetching created relations...")

        api_url = os.getenv("KP_API_URL", "http://localhost:8081")
        workspace_id = os.getenv("KP_WORKSPACE_ID")

        # Get username/email from adapter for consistent auth
        username = getattr(self.adapter, 'username', 'bench_default')
        email = getattr(self.adapter, 'email', 'bench_default@benchmark.local')

        relations = []

        # First try REST API
        try:
            response = requests.get(
                f"{api_url}/api/relations",
                params={
                    "workspace_id": workspace_id,
                    "username": username,
                    "email": email,
                    "limit": 1000,
                },
                timeout=30
            )

            if response.status_code == 200:
                relations = response.json().get("relations", [])
                logger.info(f"Retrieved {len(relations)} relations via REST API")
            else:
                logger.warning(f"REST API returned {response.status_code}: {response.text[:200]}")

        except Exception as e:
            logger.warning(f"REST API error: {e}")

        # Fallback to direct DB query by fact IDs (more reliable)
        if not relations and self.local_to_kp_id:
            logger.info("Attempting direct database query by fact IDs...")
            try:
                benchmark_fact_ids = list(self.local_to_kp_id.values())
                relations = self._get_relations_for_facts(benchmark_fact_ids)
                if relations:
                    logger.info(f"Retrieved {len(relations)} relations via direct DB query")
            except Exception as e:
                logger.warning(f"Direct DB query failed: {e}")

        # Note: _get_relations_for_facts already filters to benchmark's facts
        return relations

    def _get_relations_direct(self, workspace_id: str) -> List[Dict]:
        """Direct database query to get relations (fallback)."""
        arango_url = os.environ.get("ARANGO_URL", "http://localhost:8529")
        db_name = os.environ.get("ARANGO_DB_NAME", "knowledgeplane")

        query = {
            "query": """
                FOR r IN relations
                FILTER r.workspace_id == @workspace_id AND r.deleted_at == null
                RETURN {
                    id: r._id,
                    from_fact: r.from_fact,
                    to_fact: r.to_fact,
                    type: r.type,
                    workspace_id: r.workspace_id
                }
            """,
            "bindVars": {"workspace_id": workspace_id}
        }

        response = requests.post(
            f"{arango_url}/_db/{db_name}/_api/cursor",
            json=query,
            auth=("root", "root"),
            timeout=30
        )

        if response.status_code == 201:
            return response.json().get("result", [])
        return []

    def _get_relations_for_facts(self, fact_ids: List[str]) -> List[Dict]:
        """Get relations involving specific fact IDs (more precise for benchmark)."""
        if not fact_ids:
            return []

        arango_url = os.environ.get("ARANGO_URL", "http://localhost:8529")
        db_name = os.environ.get("ARANGO_DB_NAME", "knowledgeplane")

        query = {
            "query": """
                FOR r IN relations
                FILTER r.deleted_at == null
                FILTER r.from_fact IN @fact_ids AND r.to_fact IN @fact_ids
                RETURN {
                    id: r._id,
                    from_fact: r.from_fact,
                    to_fact: r.to_fact,
                    type: r.type,
                    workspace_id: r.workspace_id
                }
            """,
            "bindVars": {"fact_ids": fact_ids}
        }

        response = requests.post(
            f"{arango_url}/_db/{db_name}/_api/cursor",
            json=query,
            auth=("root", "root"),
            timeout=30
        )

        if response.status_code == 201:
            return response.json().get("result", [])
        return []

    def compute_metrics(self, created_relations: List[Dict]) -> RelationMetrics:
        """
        Compute relation extraction metrics.

        Args:
            created_relations: Relations created by CardConsolidator

        Returns:
            RelationMetrics with precision, recall, F1
        """
        # Build set of created relation tuples (from, to)
        # We match based on fact IDs, ignoring relation type for now
        created_pairs: Set[Tuple[str, str]] = set()

        for rel in created_relations:
            from_fact = rel.get("from_fact", "")
            to_fact = rel.get("to_fact", "")

            # Normalize fact IDs
            if "/" in from_fact:
                from_fact = from_fact.split("/")[-1]
            if "/" in to_fact:
                to_fact = to_fact.split("/")[-1]

            created_pairs.add((from_fact, to_fact))

        # Build set of expected relation tuples
        expected_pairs: Set[Tuple[str, str]] = set()

        for rel in self.ground_truth_relations:
            from_local = rel["from_local_id"]
            to_local = rel["to_local_id"]

            from_kp = self.local_to_kp_id.get(from_local, "")
            to_kp = self.local_to_kp_id.get(to_local, "")

            # Normalize IDs
            if "/" in from_kp:
                from_kp = from_kp.split("/")[-1]
            if "/" in to_kp:
                to_kp = to_kp.split("/")[-1]

            if from_kp and to_kp:
                expected_pairs.add((from_kp, to_kp))

        # Calculate metrics
        true_positives = len(created_pairs & expected_pairs)
        false_positives = len(created_pairs - expected_pairs)
        false_negatives = len(expected_pairs - created_pairs)

        precision = true_positives / len(created_pairs) if created_pairs else 0.0
        recall = true_positives / len(expected_pairs) if expected_pairs else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        metrics = RelationMetrics(
            precision=precision,
            recall=recall,
            f1=f1,
            true_positives=true_positives,
            false_positives=false_positives,
            false_negatives=false_negatives,
            total_predicted=len(created_pairs),
            total_expected=len(expected_pairs),
        )

        logger.info(
            f"Relation metrics: P={precision:.3f} R={recall:.3f} F1={f1:.3f} "
            f"(TP={true_positives} FP={false_positives} FN={false_negatives})"
        )

        # NLI verification (optional)
        if self.use_nli and NLI_AVAILABLE:
            metrics = self._compute_nli_verified_metrics(created_relations, metrics)

        return metrics

    def _compute_nli_verified_metrics(
        self,
        created_relations: List[Dict],
        base_metrics: RelationMetrics,
    ) -> RelationMetrics:
        """
        Enhance metrics with NLI verification scores.

        Args:
            created_relations: Relations to verify
            base_metrics: Base metrics to enhance

        Returns:
            RelationMetrics with NLI scores added
        """
        logger.info("Running NLI verification on relations...")

        # Lazy-load verifier
        if self.nli_verifier is None:
            self.nli_verifier = NLIVerifier()

        # Build fact text mapping
        fact_texts = {}
        for fact in self.facts:
            local_id = int(fact["local_id"].replace("fact_", ""))
            fact_texts[local_id] = fact["content"]

        # Verify ground truth relations
        gt_verifications = self.nli_verifier.verify_relation_batch(
            self.ground_truth_relations, fact_texts, fact_texts
        )

        verified_gt_count = sum(1 for v in gt_verifications if v.get("is_valid", False))

        # Convert created relations to local format for verification
        created_local = []
        kp_to_local = {v: k for k, v in self.local_to_kp_id.items()}

        for rel in created_relations:
            from_fact = rel.get("from_fact", "")
            to_fact = rel.get("to_fact", "")

            # Normalize and map back to local IDs
            if "/" in from_fact:
                from_fact = from_fact.split("/")[-1]
            if "/" in to_fact:
                to_fact = to_fact.split("/")[-1]

            # Find local IDs
            from_local = None
            to_local = None
            for local_id, kp_id in self.local_to_kp_id.items():
                kp_id_norm = kp_id.split("/")[-1] if "/" in kp_id else kp_id
                if kp_id_norm == from_fact:
                    from_local = local_id
                if kp_id_norm == to_fact:
                    to_local = local_id

            if from_local is not None and to_local is not None:
                created_local.append({
                    "from_local_id": from_local,
                    "to_local_id": to_local,
                    "type": rel.get("type", "related_to"),
                })

        # Verify created relations
        if created_local:
            pred_verifications = self.nli_verifier.verify_relation_batch(
                created_local, fact_texts, fact_texts
            )
            verified_pred_count = sum(1 for v in pred_verifications if v.get("is_valid", False))
        else:
            verified_pred_count = 0

        # Compute NLI-verified precision
        nli_precision = verified_pred_count / len(created_relations) if created_relations else 0.0

        # Compute NLI-verified recall (against verified ground truth)
        nli_recall = verified_pred_count / verified_gt_count if verified_gt_count > 0 else 0.0

        nli_f1 = 2 * nli_precision * nli_recall / (nli_precision + nli_recall) if (nli_precision + nli_recall) > 0 else 0.0

        logger.info(
            f"NLI-verified metrics: P={nli_precision:.3f} R={nli_recall:.3f} F1={nli_f1:.3f} "
            f"(verified: {verified_pred_count}/{len(created_relations)} predicted, "
            f"{verified_gt_count}/{len(self.ground_truth_relations)} ground truth)"
        )

        # Update metrics with NLI scores
        base_metrics.nli_precision = nli_precision
        base_metrics.nli_recall = nli_recall
        base_metrics.nli_f1 = nli_f1
        base_metrics.nli_verified_count = verified_pred_count

        return base_metrics

    def run_benchmark(self) -> BenchmarkSummary:
        """
        Run the complete benchmark.

        Returns:
            BenchmarkSummary with all results
        """
        # Preflight checks
        if not self.preflight_checks():
            raise RuntimeError("Preflight checks failed")

        benchmark_start = time.time()

        logger.info("=" * 60)
        logger.info("Starting RelationRecall Benchmark")
        logger.info("=" * 60)

        # Create namespace
        if self.mode == "smart":
            namespace = f"relationrecall_n{self.n_clusters}_seed{self.seed}"
        else:
            namespace = f"relationrecall_{int(time.time())}"

        logger.info(f"Using namespace: {namespace}")

        # Initialize adapter
        self.initialize_adapter(namespace)

        # Load test data
        self.load_test_data()

        # Ingest facts
        ingest_start = time.time()
        if not self.ingest_facts(namespace):
            raise RuntimeError("Fact ingestion failed")
        ingest_time = time.time() - ingest_start

        # Trigger consolidation
        consolidation_start = time.time()
        triggered = self.trigger_consolidation()

        # Wait for consolidation
        completed = self.wait_for_consolidation(namespace)
        consolidation_time = time.time() - consolidation_start

        # Get created relations
        created_relations = self.get_created_relations(namespace)

        # Compute metrics
        metrics = self.compute_metrics(created_relations)

        # Build summary
        total_time = time.time() - benchmark_start

        summary = BenchmarkSummary(
            overall_metrics=metrics,
            config={
                "n_clusters": self.n_clusters,
                "facts_per_cluster": self.facts_per_cluster,
                "seed": self.seed,
                "mode": self.mode,
                "dataset": self.dataset,
                "use_nli": self.use_nli,
                "namespace": namespace,
                "mock": self.mock,
                "timestamp": datetime.now().isoformat(),
            },
            timing={
                "total_seconds": total_time,
                "ingest_seconds": ingest_time,
                "consolidation_seconds": consolidation_time,
            },
            consolidation_triggered=triggered,
            consolidation_completed=completed,
        )

        # Save results
        self._save_results(summary)

        # Cleanup
        if self.adapter:
            self.adapter.close()

        logger.info("Benchmark complete!")
        return summary

    def _save_results(self, summary: BenchmarkSummary) -> None:
        """Save results to output files."""
        # Save summary JSON
        json_path = self.output_dir / "relationrecall_summary.json"
        logger.info(f"Saving summary to {json_path}")

        # Convert metrics to dict, handling None values
        metrics_dict = asdict(summary.overall_metrics)
        # Clean up None values for JSON
        metrics_dict = {k: v for k, v in metrics_dict.items() if v is not None}

        with open(json_path, 'w') as f:
            json.dump({
                "metrics": metrics_dict,
                "config": summary.config,
                "timing": summary.timing,
                "consolidation_triggered": summary.consolidation_triggered,
                "consolidation_completed": summary.consolidation_completed,
            }, f, indent=2)

        # Save detailed CSV
        csv_path = self.output_dir / "relationrecall_details.csv"
        logger.info(f"Saving details to {csv_path}")

        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([
                "from_local_id", "to_local_id", "type", "theme",
                "from_kp_id", "to_kp_id", "was_found"
            ])

            for rel in self.ground_truth_relations:
                from_kp = self.local_to_kp_id.get(rel["from_local_id"], "")
                to_kp = self.local_to_kp_id.get(rel["to_local_id"], "")

                # TODO: Check if this relation was actually found
                was_found = "unknown"

                writer.writerow([
                    rel["from_local_id"],
                    rel["to_local_id"],
                    rel["type"],
                    rel["theme"],
                    from_kp,
                    to_kp,
                    was_found,
                ])

        # Archive run
        self._archive_run(summary)

    def _archive_run(self, summary: BenchmarkSummary) -> None:
        """Archive benchmark run to runs/ directory."""
        runs_dir = Path("runs")
        runs_dir.mkdir(exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_dir = runs_dir / f"{timestamp}_relationrecall_n{self.n_clusters}"
        run_dir.mkdir(exist_ok=True)

        # Copy output files
        import shutil
        for src_file in self.output_dir.glob("relationrecall_*"):
            shutil.copy(src_file, run_dir / src_file.name)

        logger.info(f"Archived run to {run_dir}")

    def print_summary(self, summary: BenchmarkSummary) -> None:
        """Print benchmark summary to console."""
        print("\n" + "=" * 60)
        print("RelationRecall Benchmark Results (AI Librarian)")
        print("=" * 60)

        m = summary.overall_metrics
        print("\nRelation Extraction Metrics:")
        print(f"  Precision:     {m.precision * 100:.1f}%")
        print(f"  Recall:        {m.recall * 100:.1f}%")
        print(f"  F1 Score:      {m.f1 * 100:.1f}%  <- KEY METRIC")
        print(f"\n  True Positives:  {m.true_positives}")
        print(f"  False Positives: {m.false_positives}")
        print(f"  False Negatives: {m.false_negatives}")
        print(f"  Total Predicted: {m.total_predicted}")
        print(f"  Total Expected:  {m.total_expected}")

        # NLI-verified metrics (if available)
        if m.nli_precision is not None:
            print("\nNLI-Verified Metrics:")
            print(f"  NLI Precision: {m.nli_precision * 100:.1f}%")
            print(f"  NLI Recall:    {m.nli_recall * 100:.1f}%")
            print(f"  NLI F1 Score:  {m.nli_f1 * 100:.1f}%")
            print(f"  Verified:      {m.nli_verified_count}/{m.total_predicted} relations")

        print("\nConfiguration:")
        print(f"  Clusters:      {summary.config.get('n_clusters')}")
        print(f"  Facts/Cluster: {summary.config.get('facts_per_cluster')}")
        print(f"  Dataset:       {summary.config.get('dataset', 'synthetic')}")
        print(f"  Seed:          {summary.config.get('seed')}")
        print(f"  Mode:          {summary.config.get('mode')}")
        print(f"  NLI Enabled:   {summary.config.get('use_nli', False)}")

        print("\nTiming:")
        print(f"  Total Time:    {summary.timing.get('total_seconds', 0):.1f}s")
        print(f"  Ingestion:     {summary.timing.get('ingest_seconds', 0):.1f}s")
        print(f"  Consolidation: {summary.timing.get('consolidation_seconds', 0):.1f}s")

        print("\nStatus:")
        print(f"  Consolidation Triggered: {'Yes' if summary.consolidation_triggered else 'No'}")
        print(f"  Consolidation Completed: {'Yes' if summary.consolidation_completed else 'No'}")

        print("\n" + "=" * 60)


# =====================================================================
# CLI
# =====================================================================

def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="RelationRecall Benchmark for KnowledgePlane",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    parser.add_argument(
        '--n',
        type=int,
        default=10,
        help='Number of thematic clusters to create'
    )

    parser.add_argument(
        '--facts-per-cluster',
        type=int,
        default=3,
        help='Number of facts per cluster'
    )

    parser.add_argument(
        '--seed',
        type=int,
        default=42,
        help='Random seed for reproducibility'
    )

    parser.add_argument(
        '--dataset',
        type=str,
        choices=['synthetic', 'redocred'],
        default='synthetic',
        help='Dataset to use: synthetic (built-in), redocred (HuggingFace Re-DocRED)'
    )

    parser.add_argument(
        '--use-nli',
        action='store_true',
        help='Enable NLI-based relation verification (requires transformers, torch)'
    )

    parser.add_argument(
        '--mock',
        action='store_true',
        help='Use mock adapter (no server required)'
    )

    parser.add_argument(
        '--output_dir',
        type=str,
        default='output',
        help='Directory for output files'
    )

    parser.add_argument(
        '--consolidation-timeout',
        type=int,
        default=300,
        help='Max seconds to wait for CardConsolidator'
    )

    parser.add_argument(
        '--consolidation-poll-interval',
        type=int,
        default=10,
        help='Seconds between consolidation status checks'
    )

    parser.add_argument(
        '--mode',
        type=str,
        choices=['smart', 'fresh'],
        default='smart',
        help='Execution mode: smart (reuse cache) or fresh (always clean)'
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    # Validate arguments
    if args.n < 1:
        logger.error("Number of clusters must be >= 1")
        return 1

    # Check dataset availability
    if args.dataset == 'redocred' and not REDOCRED_AVAILABLE:
        logger.warning("Re-DocRED loader not available, falling back to synthetic")
        logger.info("Install with: pip install datasets")
        args.dataset = 'synthetic'

    # Check NLI availability
    if args.use_nli and not NLI_AVAILABLE:
        logger.warning("NLI verifier not available, disabling NLI verification")
        logger.info("Install with: pip install transformers torch")
        args.use_nli = False

    # Create benchmark
    benchmark = RelationRecallBenchmark(
        n_clusters=args.n,
        facts_per_cluster=args.facts_per_cluster,
        seed=args.seed,
        mock=args.mock,
        output_dir=args.output_dir,
        consolidation_timeout=args.consolidation_timeout,
        consolidation_poll_interval=args.consolidation_poll_interval,
        mode=args.mode,
        dataset=args.dataset,
        use_nli=args.use_nli,
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
