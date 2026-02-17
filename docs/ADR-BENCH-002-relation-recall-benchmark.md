# ADR-BENCH-002: RelationRecall@k Benchmark Design

**Status:** Draft
**Date:** 2026-02-17
**Author:** Research Agent
**Context:** Design benchmark to evaluate KnowledgePlane's AI Librarian (CardConsolidator) automatic relation discovery

## Executive Summary

This document designs the **RelationRecall@k benchmark** - a PRIMARY DIFFERENTIATOR benchmark for KnowledgePlane that evaluates the CardConsolidator's ability to automatically discover semantic relations between facts.

Unlike retrieval benchmarks (HotpotQA, MS MARCO) which test search quality, RelationRecall@k tests KnowledgePlane's unique value proposition: **automatic knowledge graph construction**.

---

## 1. Problem Statement

### What We're Testing

The CardConsolidator (`/Users/altras/home/dev/knowledgeplane/apps/background-workers/src/workers/card-consolidator.ts`) performs two key operations:

1. **Relation Discovery** (`createFactRelations`): Uses AI to identify meaningful relationships between facts
2. **Fact Consolidation** (`consolidateCluster`): Groups related facts into KnowledgeCards

The benchmark focuses on **Relation Discovery** - measuring how well the AI identifies ground-truth relations.

### Why This Matters

| Capability | HotpotQA Tests | RelationRecall Tests |
|------------|----------------|---------------------|
| Vector search | Yes | No |
| Graph traversal | Partial | Yes |
| Auto relation discovery | No | **Yes (Primary)** |
| Knowledge synthesis | No | Yes |

---

## 2. CardConsolidator Analysis

### Current Implementation

From `/Users/altras/home/dev/knowledgeplane/apps/background-workers/src/workers/card-consolidator.ts`:

```typescript
// Line 415-473: AI-based relation identification
private async identifyRelationsWithAI(facts: any[]): Promise<Array<{
  from_content: string;
  to_content: string;
  type: string;
  metadata?: Record<string, any>;
}>> {
  const systemPrompt = `You are a knowledge graph relation identification agent...

  For each pair of facts that are related, identify:
  - The type of relationship (e.g., "references", "depends_on", "related_to",
    "part_of", "causes", "enables", "contradicts", "supports", etc.)
  - Any relevant metadata about the relationship

  Only identify relationships that are meaningful and useful.
  Don't create relations for every possible pair - focus on significant connections.`;

  // Uses GPT-4o by default
  const chatOptions: ChatCompletionOptions = {
    model: process.env.OPENAI_MODEL || "gpt-4o",
    temperature: 0.5,
    responseFormat: "json_object",
  };
}
```

### Supported Relation Types

From the prompt and codebase analysis:
- `references` - Fact A mentions/cites Fact B
- `depends_on` - Fact A requires Fact B to be true
- `related_to` - General semantic similarity
- `part_of` - Fact A is a component of Fact B
- `causes` - Fact A leads to Fact B
- `enables` - Fact A makes Fact B possible
- `contradicts` - Facts are in conflict
- `supports` - Fact A provides evidence for Fact B

### Processing Flow

```
Facts (unconsolidated)
    -> createFactRelations(facts)
        -> identifyRelationsWithAI(batch of 20)
        -> FactRelation.create() for each
    -> groupRelatedFacts() via graph traversal
    -> consolidateCluster() into KnowledgeCards
```

---

## 3. Data Source Recommendations

### Primary: DocRED (Document-Level Relation Extraction Dataset)

**Why DocRED:**
- 132,375 entities and 56,354 relational facts from Wikipedia
- Human-annotated (gold standard)
- Document-level relations (matches KP's fact-to-fact model)
- 96 relation types from Wikidata
- Available on HuggingFace: `thunlp/docred`

**DocRED Structure:**
```json
{
  "title": "Wikipedia article title",
  "vertexSet": [
    [{"name": "entity1", "sent_id": 0, "pos": [0, 3], "type": "PER"}]
  ],
  "labels": [
    {"r": "P26", "h": 0, "t": 1, "evidence": [0, 1]}
  ],
  "sents": [["Sentence", "1", "tokens"], ["Sentence", "2", "tokens"]]
}
```

**Adaptation Strategy:**
- Convert each sentence to a KP fact
- Use `labels` as ground-truth relations
- Map Wikidata relation types (P26, P31, etc.) to KP types

### Secondary: TACRED (TAC Knowledge Base Population)

**Why TACRED:**
- 106,264 examples from newswire/web
- 41 relation types (e.g., `per:schools_attended`, `org:members`)
- Sentence-level annotations
- Label-corrected version available

**Best for:** Testing specific relation type coverage

### Tertiary: Synthetic Wikidata Injection

**For controlled experiments:**
- Extract entity pairs with known relations from Wikidata
- Generate fact pairs from Wikipedia sentences mentioning both entities
- Known ground truth, controllable difficulty

---

## 4. Evaluation Methodology

### 4.1 Primary Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| **Relation Precision@k** | `CorrectEdges / CreatedEdges` | >0.85 |
| **Relation Recall@k** | `FoundEdges / ExpectedEdges` | >0.70 |
| **Relation F1@k** | `2 * P * R / (P + R)` | >0.75 |

Where `k` = number of facts processed per batch (default: 100)

### 4.2 Type-Specific Metrics

For each relation type `t`:
- `Precision_t`: Correct edges of type t / Created edges of type t
- `Recall_t`: Found edges of type t / Expected edges of type t
- `Type Confusion Matrix`: Which types get mispredicted as which

### 4.3 Evaluation Without Human Annotation

Three strategies to evaluate quality without manual labeling:

#### Strategy A: Entailment-Based Verification (Primary)

Use an NLI model to verify that created relations are supported by source facts.

```python
def verify_relation_with_nli(
    from_fact: str,
    to_fact: str,
    relation_type: str
) -> float:
    """
    Use NLI model to score if relation is entailed by facts.

    Returns:
        Entailment score (0.0-1.0)
    """
    # Template the relation as a hypothesis
    hypothesis = RELATION_TEMPLATES[relation_type].format(
        subject=extract_subject(from_fact),
        object=extract_object(to_fact)
    )

    # Premise = concatenation of source facts
    premise = f"{from_fact} {to_fact}"

    # Run NLI model (e.g., deberta-v3-large-mnli)
    result = nli_model(premise, hypothesis)

    return result['entailment']
```

**Relation Templates:**
```python
RELATION_TEMPLATES = {
    "references": "{subject} mentions or refers to {object}",
    "depends_on": "{subject} requires {object} to be true",
    "causes": "{subject} leads to or causes {object}",
    "part_of": "{subject} is a component or subset of {object}",
    "supports": "{subject} provides evidence for {object}",
    "contradicts": "{subject} conflicts with or negates {object}",
}
```

**Recommended Model:** `microsoft/deberta-v3-large-mnli` (SOTA for NLI)

#### Strategy B: Consistency Check (Secondary)

Measure determinism by running CardConsolidator multiple times.

```python
def consistency_score(facts: List[str], runs: int = 5) -> float:
    """
    Run CardConsolidator N times and measure Jaccard similarity.

    High consistency = reliable relation discovery
    Low consistency = non-deterministic (may indicate model uncertainty)
    """
    relation_sets = []

    for _ in range(runs):
        reset_workspace()
        ingest_facts(facts)
        trigger_consolidator()
        relations = get_created_relations()
        relation_sets.append(set(
            (r.from_fact, r.to_fact, r.type) for r in relations
        ))

    # Average pairwise Jaccard similarity
    similarities = []
    for i in range(runs):
        for j in range(i + 1, runs):
            intersection = len(relation_sets[i] & relation_sets[j])
            union = len(relation_sets[i] | relation_sets[j])
            similarities.append(intersection / union if union > 0 else 1.0)

    return np.mean(similarities)
```

**Target:** Jaccard similarity > 0.80 across runs

#### Strategy C: Synthetic Injection (Validation)

Insert facts with known relations, measure if CardConsolidator finds them.

```python
def synthetic_injection_test(n_pairs: int = 50) -> Dict[str, float]:
    """
    Inject fact pairs with known Wikidata relations.
    Measure recall on these planted relations.
    """
    # Generate synthetic pairs from Wikidata
    synthetic_pairs = generate_wikidata_pairs(n_pairs)

    # Convert to facts and ingest
    facts = []
    expected_relations = []

    for pair in synthetic_pairs:
        fact_a = f"{pair.subject} is a {pair.subject_type}."
        fact_b = f"{pair.object} is related to {pair.subject}. {pair.evidence_sentence}"
        facts.extend([fact_a, fact_b])
        expected_relations.append((fact_a, fact_b, pair.relation_type))

    ingest_facts(facts)
    trigger_consolidator()
    created = get_created_relations()

    # Calculate recall on planted relations
    found = sum(1 for exp in expected_relations
                if any(matches_relation(exp, c) for c in created))

    return {
        "synthetic_recall": found / len(expected_relations),
        "total_created": len(created),
        "expected": len(expected_relations)
    }
```

---

## 5. Code Architecture

### File Structure

```
tests/benchmarks/
├── src/
│   ├── relationrecall.py          # Main benchmark script
│   ├── lib/
│   │   ├── adapter.py             # KP adapter (existing)
│   │   ├── docred_loader.py       # DocRED dataset loader
│   │   ├── nli_verifier.py        # NLI-based relation verification
│   │   ├── relation_metrics.py    # Precision/Recall/F1 calculation
│   │   └── wikidata_synthetic.py  # Synthetic pair generator
│   └── __init__.py
├── examples/
│   └── demo_relationrecall.py
├── tests/
│   └── test_relationrecall_metrics.py
└── docker-compose.yml             # Add relationrecall profile
```

### Core Classes

```python
# src/relationrecall.py

@dataclass
class RelationPair:
    """Ground truth or predicted relation."""
    from_content: str
    to_content: str
    relation_type: str
    source: str  # 'ground_truth' or 'predicted'
    confidence: float = 1.0
    entailment_score: Optional[float] = None


@dataclass
class RelationMetrics:
    """Per-type and aggregate metrics."""
    precision: float
    recall: float
    f1: float
    by_type: Dict[str, Dict[str, float]]
    total_expected: int
    total_created: int
    total_correct: int


@dataclass
class BenchmarkResult:
    """Complete benchmark result."""
    metrics: RelationMetrics
    consistency_score: float
    synthetic_recall: float
    entailment_scores: List[float]
    timing: Dict[str, float]
    config: Dict[str, Any]


class RelationRecallBenchmark:
    """
    RelationRecall@k benchmark for CardConsolidator evaluation.
    """

    def __init__(
        self,
        n_documents: int = 100,
        batch_size: int = 20,
        consistency_runs: int = 5,
        use_nli_verification: bool = True,
        nli_model: str = "microsoft/deberta-v3-large-mnli",
        seed: int = 42,
        output_dir: str = "output/relationrecall"
    ):
        ...

    def load_docred_documents(self) -> List[DocREDDocument]:
        """Load and sample DocRED documents."""
        ...

    def convert_to_facts(self, doc: DocREDDocument) -> List[Fact]:
        """Convert DocRED document to KP facts."""
        ...

    def extract_ground_truth_relations(
        self,
        doc: DocREDDocument
    ) -> List[RelationPair]:
        """Extract Wikidata relations as ground truth."""
        ...

    def run_consolidator(self, facts: List[Fact]) -> List[RelationPair]:
        """Trigger CardConsolidator and extract created relations."""
        ...

    def verify_with_nli(
        self,
        relations: List[RelationPair]
    ) -> List[float]:
        """Use NLI model to score relation validity."""
        ...

    def compute_metrics(
        self,
        predicted: List[RelationPair],
        ground_truth: List[RelationPair]
    ) -> RelationMetrics:
        """Calculate precision, recall, F1."""
        ...

    def run_benchmark(self) -> BenchmarkResult:
        """Execute full benchmark pipeline."""
        ...
```

### DocRED Loader

```python
# src/lib/docred_loader.py

from datasets import load_dataset
from dataclasses import dataclass
from typing import List, Dict, Tuple

# Wikidata relation type mapping to KP types
WIKIDATA_TO_KP_TYPE = {
    # Person relations
    "P26": "related_to",    # spouse
    "P22": "related_to",    # father
    "P25": "related_to",    # mother
    "P40": "related_to",    # child

    # Organization relations
    "P127": "part_of",      # owned by
    "P749": "part_of",      # parent organization
    "P355": "part_of",      # subsidiary

    # Location relations
    "P131": "part_of",      # located in
    "P17": "part_of",       # country

    # Causal/temporal
    "P156": "causes",       # followed by
    "P155": "depends_on",   # preceded by

    # Evidence/support
    "P1343": "references",  # described by source
    "P973": "references",   # described at URL

    # Default
    "DEFAULT": "related_to"
}


@dataclass
class DocREDDocument:
    """Parsed DocRED document."""
    title: str
    sentences: List[str]  # Reconstructed sentences
    entities: List[Dict[str, Any]]  # Entity mentions
    relations: List[Tuple[int, int, str]]  # (head_idx, tail_idx, relation_id)
    evidence: Dict[Tuple[int, int], List[int]]  # Entity pair -> sentence indices


def load_docred_sample(
    n_documents: int = 100,
    split: str = "validation",
    seed: int = 42,
    min_relations: int = 3
) -> List[DocREDDocument]:
    """
    Load and sample DocRED documents.

    Args:
        n_documents: Number of documents to sample
        split: Dataset split ('train', 'validation', 'test')
        seed: Random seed
        min_relations: Minimum relations per document

    Returns:
        List of parsed DocRED documents
    """
    dataset = load_dataset("thunlp/docred", split=split)

    # Filter to documents with sufficient relations
    candidates = [
        doc for doc in dataset
        if len(doc['labels']) >= min_relations
    ]

    # Sample
    random.seed(seed)
    sampled = random.sample(candidates, min(n_documents, len(candidates)))

    # Parse
    documents = []
    for raw in sampled:
        doc = _parse_docred_document(raw)
        documents.append(doc)

    return documents


def _parse_docred_document(raw: Dict) -> DocREDDocument:
    """Parse raw DocRED format to our dataclass."""
    # Reconstruct sentences from tokens
    sentences = [" ".join(tokens) for tokens in raw['sents']]

    # Parse entities
    entities = []
    for vertex_group in raw['vertexSet']:
        entity = {
            'name': vertex_group[0]['name'],
            'type': vertex_group[0].get('type', 'UNKNOWN'),
            'mentions': vertex_group
        }
        entities.append(entity)

    # Parse relations
    relations = []
    evidence = {}
    for label in raw['labels']:
        head_idx = label['h']
        tail_idx = label['t']
        relation_id = label['r']

        relations.append((head_idx, tail_idx, relation_id))
        evidence[(head_idx, tail_idx)] = label.get('evidence', [])

    return DocREDDocument(
        title=raw['title'],
        sentences=sentences,
        entities=entities,
        relations=relations,
        evidence=evidence
    )


def convert_docred_to_facts(doc: DocREDDocument) -> List[Dict[str, str]]:
    """
    Convert DocRED document to KP fact format.

    Each sentence becomes a fact with entity metadata.
    """
    facts = []

    for sent_idx, sentence in enumerate(doc.sentences):
        # Find entities mentioned in this sentence
        entities_in_sent = []
        for ent_idx, entity in enumerate(doc.entities):
            for mention in entity['mentions']:
                if mention.get('sent_id') == sent_idx:
                    entities_in_sent.append(entity['name'])
                    break

        fact = {
            'content': sentence,
            'metadata': {
                'source': 'docred',
                'doc_title': doc.title,
                'sentence_idx': str(sent_idx),
                'entities': ','.join(set(entities_in_sent))
            }
        }
        facts.append(fact)

    return facts


def extract_ground_truth_relations(
    doc: DocREDDocument,
    facts: List[Dict[str, str]]
) -> List[RelationPair]:
    """
    Extract ground truth relations for benchmark comparison.

    Maps DocRED entity-level relations to fact-level relations.
    """
    ground_truth = []

    for head_idx, tail_idx, relation_id in doc.relations:
        # Get entity names
        head_entity = doc.entities[head_idx]['name']
        tail_entity = doc.entities[tail_idx]['name']

        # Find facts containing these entities
        head_facts = [f for f in facts
                     if head_entity.lower() in f['content'].lower()]
        tail_facts = [f for f in facts
                     if tail_entity.lower() in f['content'].lower()]

        # Map Wikidata relation to KP type
        kp_type = WIKIDATA_TO_KP_TYPE.get(
            relation_id,
            WIKIDATA_TO_KP_TYPE['DEFAULT']
        )

        # Create relation pairs for fact combinations
        for hf in head_facts:
            for tf in tail_facts:
                if hf != tf:
                    ground_truth.append(RelationPair(
                        from_content=hf['content'],
                        to_content=tf['content'],
                        relation_type=kp_type,
                        source='ground_truth'
                    ))

    return ground_truth
```

### NLI Verifier

```python
# src/lib/nli_verifier.py

from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch
from typing import List, Dict, Tuple

# Relation type to natural language template
RELATION_TEMPLATES = {
    "references": "The first statement mentions or refers to the same topic as the second statement.",
    "depends_on": "The first statement logically requires the second statement to be true.",
    "related_to": "The two statements are semantically related and discuss connected concepts.",
    "part_of": "The subject of the first statement is a component or subset of the subject of the second statement.",
    "causes": "The event or condition in the first statement leads to or causes the event in the second statement.",
    "enables": "The condition in the first statement makes the event in the second statement possible.",
    "contradicts": "The two statements are in logical conflict or contradiction.",
    "supports": "The first statement provides evidence or support for the second statement.",
}


class NLIRelationVerifier:
    """
    Use NLI model to verify if relations are supported by source facts.
    """

    def __init__(
        self,
        model_name: str = "microsoft/deberta-v3-large-mnli",
        device: str = "auto"
    ):
        """
        Initialize NLI model.

        Args:
            model_name: HuggingFace model for NLI
            device: 'cuda', 'cpu', or 'auto'
        """
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)

        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.model.to(self.device)
        self.model.eval()

        # Label mapping for MNLI
        self.label_map = {0: "contradiction", 1: "neutral", 2: "entailment"}

    def verify_relation(
        self,
        from_fact: str,
        to_fact: str,
        relation_type: str
    ) -> Dict[str, float]:
        """
        Verify if a relation is entailed by the source facts.

        Returns:
            Dict with 'entailment', 'neutral', 'contradiction' scores
        """
        # Build premise (concatenate facts)
        premise = f"{from_fact} {to_fact}"

        # Build hypothesis from template
        hypothesis = RELATION_TEMPLATES.get(
            relation_type,
            RELATION_TEMPLATES['related_to']
        )

        # Tokenize
        inputs = self.tokenizer(
            premise,
            hypothesis,
            return_tensors="pt",
            truncation=True,
            max_length=512
        ).to(self.device)

        # Run inference
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)[0]

        return {
            "entailment": probs[2].item(),
            "neutral": probs[1].item(),
            "contradiction": probs[0].item()
        }

    def batch_verify(
        self,
        relations: List[Tuple[str, str, str]]
    ) -> List[Dict[str, float]]:
        """
        Verify multiple relations in batch.

        Args:
            relations: List of (from_fact, to_fact, relation_type)

        Returns:
            List of score dicts
        """
        results = []
        for from_fact, to_fact, rel_type in relations:
            score = self.verify_relation(from_fact, to_fact, rel_type)
            results.append(score)
        return results

    def compute_aggregate_score(
        self,
        relations: List[Tuple[str, str, str]],
        threshold: float = 0.5
    ) -> Dict[str, Any]:
        """
        Compute aggregate NLI verification metrics.

        Returns:
            Dict with mean_entailment, valid_ratio, etc.
        """
        scores = self.batch_verify(relations)

        entailment_scores = [s['entailment'] for s in scores]
        valid_count = sum(1 for s in entailment_scores if s >= threshold)

        return {
            "mean_entailment": np.mean(entailment_scores),
            "median_entailment": np.median(entailment_scores),
            "valid_ratio": valid_count / len(relations) if relations else 0,
            "threshold": threshold,
            "total_verified": len(relations),
            "passed_threshold": valid_count
        }
```

### Main Benchmark Script

```python
# src/relationrecall.py

#!/usr/bin/env python3
"""
RelationRecall@k Benchmark for KnowledgePlane CardConsolidator

Evaluates automatic relation discovery by comparing against ground-truth
relations from DocRED and verifying with NLI entailment scoring.

Usage:
    python relationrecall.py --n 100 --mode evaluate
    python relationrecall.py --n 50 --mode consistency --runs 5
    python relationrecall.py --n 20 --mode synthetic
"""

import argparse
import json
import logging
import os
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

import numpy as np

from lib.adapter import HTTPKnowledgePlaneAdapter, MockKnowledgePlaneAdapter
from lib.docred_loader import (
    load_docred_sample,
    convert_docred_to_facts,
    extract_ground_truth_relations,
    DocREDDocument
)
from lib.nli_verifier import NLIRelationVerifier
from lib.relation_metrics import compute_relation_metrics, RelationMetrics


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class RelationPair:
    """A relation between two facts."""
    from_content: str
    to_content: str
    relation_type: str
    source: str = 'predicted'  # 'ground_truth' or 'predicted'
    confidence: float = 1.0
    entailment_score: Optional[float] = None


@dataclass
class BenchmarkConfig:
    """Benchmark configuration."""
    n_documents: int = 100
    batch_size: int = 20
    consistency_runs: int = 5
    use_nli_verification: bool = True
    nli_model: str = "microsoft/deberta-v3-large-mnli"
    nli_threshold: float = 0.5
    seed: int = 42
    mode: str = "evaluate"  # evaluate, consistency, synthetic
    mock_kp: bool = False
    output_dir: str = "output/relationrecall"


@dataclass
class BenchmarkResult:
    """Complete benchmark results."""
    # Core metrics
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0

    # By-type metrics
    metrics_by_type: Dict[str, Dict[str, float]] = field(default_factory=dict)

    # NLI verification
    mean_entailment_score: float = 0.0
    nli_valid_ratio: float = 0.0

    # Consistency (if run)
    consistency_score: Optional[float] = None

    # Synthetic injection (if run)
    synthetic_recall: Optional[float] = None

    # Counts
    total_expected: int = 0
    total_created: int = 0
    total_correct: int = 0

    # Timing
    total_time_seconds: float = 0.0
    consolidation_time_seconds: float = 0.0

    # Config
    config: Dict[str, Any] = field(default_factory=dict)


class RelationRecallBenchmark:
    """
    RelationRecall@k benchmark for CardConsolidator evaluation.

    Tests KnowledgePlane's ability to automatically discover semantic
    relations between facts using ground-truth data from DocRED.
    """

    def __init__(self, config: BenchmarkConfig):
        self.config = config
        self.output_dir = Path(config.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Initialize components
        self.adapter = None
        self.nli_verifier = None

        # Results storage
        self.documents: List[DocREDDocument] = []
        self.ground_truth_relations: List[RelationPair] = []
        self.predicted_relations: List[RelationPair] = []

        np.random.seed(config.seed)

    def initialize(self) -> None:
        """Initialize adapter and NLI verifier."""
        # Initialize KP adapter
        if self.config.mock_kp:
            self.adapter = MockKnowledgePlaneAdapter()
            self.adapter.initialize(
                mcp_url="mock://localhost",
                api_key="mock",
                workspace_id="relationrecall_benchmark",
                user_id="benchmark_user"
            )
        else:
            self.adapter = HTTPKnowledgePlaneAdapter()
            self.adapter.initialize(
                mcp_url=os.getenv("KP_API_URL", "http://localhost:8081"),
                api_key=os.getenv("KP_API_KEY"),
                workspace_id=os.getenv("KP_WORKSPACE_ID"),
                user_id=os.getenv("KP_USER_ID", "benchmark_user")
            )

        # Initialize NLI verifier
        if self.config.use_nli_verification:
            logger.info(f"Loading NLI model: {self.config.nli_model}")
            self.nli_verifier = NLIRelationVerifier(
                model_name=self.config.nli_model
            )

    def load_data(self) -> None:
        """Load DocRED documents and extract ground truth."""
        logger.info(f"Loading {self.config.n_documents} DocRED documents...")

        self.documents = load_docred_sample(
            n_documents=self.config.n_documents,
            seed=self.config.seed,
            min_relations=3
        )

        logger.info(f"Loaded {len(self.documents)} documents")

        # Extract ground truth relations
        for doc in self.documents:
            facts = convert_docred_to_facts(doc)
            relations = extract_ground_truth_relations(doc, facts)
            self.ground_truth_relations.extend(relations)

        logger.info(f"Extracted {len(self.ground_truth_relations)} ground truth relations")

    def ingest_documents(self, namespace: str) -> List[str]:
        """Ingest DocRED documents as facts."""
        all_fact_ids = []

        for doc in self.documents:
            facts = convert_docred_to_facts(doc)

            # Ingest via adapter
            results = self.adapter.ingest_documents(
                documents=facts,
                namespace=namespace
            )

            for result in results:
                all_fact_ids.extend(result.fact_ids)

        logger.info(f"Ingested {len(all_fact_ids)} facts")
        return all_fact_ids

    def trigger_consolidator(self) -> None:
        """Trigger the CardConsolidator worker."""
        # Call REST API to trigger worker
        import requests

        url = f"{self.adapter.api_url}/api/workers/trigger"
        headers = {'knowledgeplane-key': self.adapter.api_key}

        response = requests.post(
            url,
            json={'worker': 'card-consolidator'},
            headers=headers,
            timeout=30
        )
        response.raise_for_status()

        logger.info("CardConsolidator triggered")

    def wait_for_consolidation(self, timeout: int = 300) -> None:
        """Wait for consolidation to complete."""
        import requests

        logger.info(f"Waiting for consolidation (timeout: {timeout}s)...")
        start = time.time()

        while time.time() - start < timeout:
            # Check worker status
            # TODO: Implement proper status check
            time.sleep(10)

            # For now, just wait a fixed time
            if time.time() - start > 30:
                break

        logger.info("Consolidation wait complete")

    def fetch_created_relations(self, namespace: str) -> List[RelationPair]:
        """Fetch relations created by CardConsolidator."""
        import requests

        url = f"{self.adapter.api_url}/api/relations"
        params = {'workspace_id': self.adapter.workspace_id, 'limit': 1000}
        headers = {'knowledgeplane-key': self.adapter.api_key}

        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()

        relations_data = response.json().get('relations', [])

        # Convert to RelationPair
        relations = []
        for r in relations_data:
            # Fetch fact content for from_fact and to_fact
            from_fact = self._fetch_fact_content(r['from_fact'])
            to_fact = self._fetch_fact_content(r['to_fact'])

            if from_fact and to_fact:
                relations.append(RelationPair(
                    from_content=from_fact,
                    to_content=to_fact,
                    relation_type=r['type'],
                    source='predicted'
                ))

        logger.info(f"Fetched {len(relations)} created relations")
        return relations

    def _fetch_fact_content(self, fact_id: str) -> Optional[str]:
        """Fetch fact content by ID."""
        import requests

        url = f"{self.adapter.api_url}/api/facts/{fact_id}"
        headers = {'knowledgeplane-key': self.adapter.api_key}

        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                return response.json().get('fact', {}).get('content')
        except:
            pass
        return None

    def compute_metrics(self) -> RelationMetrics:
        """Compute precision, recall, F1 metrics."""
        return compute_relation_metrics(
            predicted=self.predicted_relations,
            ground_truth=self.ground_truth_relations
        )

    def verify_with_nli(self) -> Dict[str, Any]:
        """Verify predicted relations using NLI."""
        if not self.nli_verifier or not self.predicted_relations:
            return {}

        logger.info("Verifying relations with NLI...")

        relations_tuples = [
            (r.from_content, r.to_content, r.relation_type)
            for r in self.predicted_relations
        ]

        aggregate = self.nli_verifier.compute_aggregate_score(
            relations_tuples,
            threshold=self.config.nli_threshold
        )

        return aggregate

    def run_consistency_test(self) -> float:
        """Run consistency test across multiple runs."""
        logger.info(f"Running consistency test ({self.config.consistency_runs} runs)...")

        relation_sets = []

        for run in range(self.config.consistency_runs):
            namespace = f"relationrecall_consistency_{run}_{int(time.time())}"

            # Clean slate
            self.ingest_documents(namespace)
            self.trigger_consolidator()
            self.wait_for_consolidation()

            relations = self.fetch_created_relations(namespace)
            relation_set = set(
                (r.from_content[:50], r.to_content[:50], r.relation_type)
                for r in relations
            )
            relation_sets.append(relation_set)

        # Compute pairwise Jaccard similarity
        similarities = []
        n = len(relation_sets)
        for i in range(n):
            for j in range(i + 1, n):
                intersection = len(relation_sets[i] & relation_sets[j])
                union = len(relation_sets[i] | relation_sets[j])
                sim = intersection / union if union > 0 else 1.0
                similarities.append(sim)

        consistency = np.mean(similarities) if similarities else 1.0
        logger.info(f"Consistency score: {consistency:.3f}")

        return consistency

    def run_benchmark(self) -> BenchmarkResult:
        """Run the complete benchmark."""
        start_time = time.time()

        logger.info("=" * 60)
        logger.info("RelationRecall@k Benchmark")
        logger.info("=" * 60)

        # Initialize
        self.initialize()

        # Load data
        self.load_data()

        result = BenchmarkResult()
        result.total_expected = len(self.ground_truth_relations)
        result.config = asdict(self.config)

        if self.config.mode == "evaluate":
            # Standard evaluation
            namespace = f"relationrecall_{int(time.time())}"

            # Ingest
            self.ingest_documents(namespace)

            # Trigger consolidator
            consolidation_start = time.time()
            self.trigger_consolidator()
            self.wait_for_consolidation()
            result.consolidation_time_seconds = time.time() - consolidation_start

            # Fetch results
            self.predicted_relations = self.fetch_created_relations(namespace)
            result.total_created = len(self.predicted_relations)

            # Compute metrics
            metrics = self.compute_metrics()
            result.precision = metrics.precision
            result.recall = metrics.recall
            result.f1 = metrics.f1
            result.total_correct = metrics.correct
            result.metrics_by_type = metrics.by_type

            # NLI verification
            if self.config.use_nli_verification:
                nli_results = self.verify_with_nli()
                result.mean_entailment_score = nli_results.get('mean_entailment', 0)
                result.nli_valid_ratio = nli_results.get('valid_ratio', 0)

        elif self.config.mode == "consistency":
            result.consistency_score = self.run_consistency_test()

        result.total_time_seconds = time.time() - start_time

        # Save results
        self._save_results(result)

        return result

    def _save_results(self, result: BenchmarkResult) -> None:
        """Save results to JSON."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        json_path = self.output_dir / f"relationrecall_{timestamp}.json"
        with open(json_path, 'w') as f:
            json.dump(asdict(result), f, indent=2, default=str)

        logger.info(f"Results saved to {json_path}")

    def print_summary(self, result: BenchmarkResult) -> None:
        """Print benchmark summary."""
        print("\n" + "=" * 60)
        print("RelationRecall@k Benchmark Results")
        print("=" * 60)

        print(f"\nRelation Discovery Metrics:")
        print(f"  Precision:  {result.precision * 100:.1f}%  (target >85%)")
        print(f"  Recall:     {result.recall * 100:.1f}%  (target >70%)")
        print(f"  F1 Score:   {result.f1 * 100:.1f}%  (target >75%)")

        print(f"\nCounts:")
        print(f"  Expected:   {result.total_expected}")
        print(f"  Created:    {result.total_created}")
        print(f"  Correct:    {result.total_correct}")

        if result.mean_entailment_score > 0:
            print(f"\nNLI Verification:")
            print(f"  Mean Entailment: {result.mean_entailment_score:.3f}")
            print(f"  Valid Ratio:     {result.nli_valid_ratio * 100:.1f}%")

        if result.consistency_score is not None:
            print(f"\nConsistency:")
            print(f"  Jaccard Score: {result.consistency_score:.3f}  (target >0.80)")

        print(f"\nTiming:")
        print(f"  Total:         {result.total_time_seconds:.1f}s")
        print(f"  Consolidation: {result.consolidation_time_seconds:.1f}s")

        # Verdict
        print("\n" + "-" * 60)
        if result.f1 >= 0.75:
            print("PASS: CardConsolidator meets relation discovery targets")
        elif result.f1 >= 0.50:
            print("PARTIAL: CardConsolidator shows moderate relation discovery")
        else:
            print("NEEDS IMPROVEMENT: Relation discovery below expectations")
        print("=" * 60)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="RelationRecall@k Benchmark for KnowledgePlane"
    )

    parser.add_argument('--n', type=int, default=100,
                       help='Number of DocRED documents to evaluate')
    parser.add_argument('--mode', choices=['evaluate', 'consistency', 'synthetic'],
                       default='evaluate', help='Benchmark mode')
    parser.add_argument('--runs', type=int, default=5,
                       help='Number of runs for consistency test')
    parser.add_argument('--no-nli', action='store_true',
                       help='Disable NLI verification')
    parser.add_argument('--nli-model', type=str,
                       default='microsoft/deberta-v3-large-mnli',
                       help='NLI model for verification')
    parser.add_argument('--mock', action='store_true',
                       help='Use mock KP adapter')
    parser.add_argument('--seed', type=int, default=42,
                       help='Random seed')
    parser.add_argument('--output-dir', type=str, default='output/relationrecall',
                       help='Output directory')

    return parser.parse_args()


def main():
    args = parse_args()

    config = BenchmarkConfig(
        n_documents=args.n,
        consistency_runs=args.runs,
        use_nli_verification=not args.no_nli,
        nli_model=args.nli_model,
        mock_kp=args.mock,
        seed=args.seed,
        mode=args.mode,
        output_dir=args.output_dir
    )

    benchmark = RelationRecallBenchmark(config)
    result = benchmark.run_benchmark()
    benchmark.print_summary(result)

    return 0 if result.f1 >= 0.50 else 1


if __name__ == "__main__":
    exit(main())
```

---

## 6. Docker Integration

Add to `tests/benchmarks/docker-compose.yml`:

```yaml
  relationrecall:
    <<: *benchmark-base
    profiles: ["relationrecall"]
    environment:
      <<: *common-env
      BENCHMARK_TYPE: relationrecall
      BENCHMARK_N: ${BENCHMARK_N:-100}
      HF_HUB_CACHE: /root/.cache/huggingface
    volumes:
      - .:/app
      - huggingface-cache:/root/.cache/huggingface
    command: >
      python src/relationrecall.py
        --n ${BENCHMARK_N:-100}
        --mode evaluate
        --output-dir output/relationrecall
    deploy:
      resources:
        limits:
          memory: 8G  # NLI model needs ~4GB
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]  # GPU for NLI inference

volumes:
  huggingface-cache:
```

---

## 7. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

- [ ] Create `docred_loader.py` with HuggingFace integration
- [ ] Create `relation_metrics.py` with P/R/F1 calculation
- [ ] Create basic `relationrecall.py` benchmark script
- [ ] Test with mock adapter

### Phase 2: NLI Integration (Week 2)

- [ ] Create `nli_verifier.py` with DeBERTa integration
- [ ] Add relation type templates
- [ ] Test entailment scoring independently
- [ ] Integrate into benchmark pipeline

### Phase 3: End-to-End Testing (Week 3)

- [ ] Connect to live CardConsolidator
- [ ] Implement worker trigger and wait logic
- [ ] Run full evaluation on n=100 documents
- [ ] Document baseline results

### Phase 4: Advanced Modes (Week 4)

- [ ] Implement consistency testing mode
- [ ] Add synthetic injection testing
- [ ] Create Docker profile
- [ ] Add to CI pipeline

---

## 8. Success Criteria

| Metric | Target | Acceptable | Notes |
|--------|--------|------------|-------|
| Relation Precision | >0.85 | >0.70 | Correct edges / Created edges |
| Relation Recall | >0.70 | >0.50 | Found edges / Expected edges |
| Relation F1 | >0.75 | >0.60 | Harmonic mean |
| NLI Valid Ratio | >0.70 | >0.50 | Relations passing entailment check |
| Consistency Score | >0.80 | >0.60 | Jaccard across 5 runs |
| Consolidation Time | <60s/100 facts | <120s | Processing efficiency |

---

## 9. References

- [DocRED Paper](https://aclanthology.org/P19-1074/) - ACL 2019
- [DocRED HuggingFace](https://huggingface.co/datasets/thunlp/docred)
- [TACRED Dataset](https://nlp.stanford.edu/projects/tacred/)
- [DeBERTa-v3-MNLI](https://huggingface.co/microsoft/deberta-v3-large-mnli)
- [Natural Language Inference Overview](https://towardsdatascience.com/natural-language-inference-an-overview-57c0eecf6517/)

---

## 10. Appendix: Wikidata Relation Type Mapping

Full mapping of Wikidata property IDs to KP relation types:

```python
WIKIDATA_FULL_MAPPING = {
    # Family relations
    "P22": ("related_to", "father"),
    "P25": ("related_to", "mother"),
    "P26": ("related_to", "spouse"),
    "P40": ("related_to", "child"),
    "P3373": ("related_to", "sibling"),

    # Organizational
    "P108": ("part_of", "employer"),
    "P127": ("part_of", "owned_by"),
    "P749": ("part_of", "parent_org"),
    "P355": ("part_of", "subsidiary"),
    "P463": ("part_of", "member_of"),

    # Location
    "P17": ("part_of", "country"),
    "P131": ("part_of", "located_in"),
    "P19": ("related_to", "birthplace"),
    "P20": ("related_to", "deathplace"),
    "P159": ("part_of", "headquarters"),

    # Temporal/Causal
    "P155": ("depends_on", "preceded_by"),
    "P156": ("causes", "followed_by"),
    "P1365": ("depends_on", "replaces"),
    "P1366": ("causes", "replaced_by"),

    # Creative works
    "P50": ("related_to", "author"),
    "P170": ("related_to", "creator"),
    "P57": ("related_to", "director"),
    "P86": ("related_to", "composer"),
    "P175": ("related_to", "performer"),

    # References
    "P1343": ("references", "described_by"),
    "P973": ("references", "described_at"),
    "P248": ("references", "stated_in"),

    # Classification
    "P31": ("part_of", "instance_of"),
    "P279": ("part_of", "subclass_of"),
    "P361": ("part_of", "part_of"),
    "P527": ("part_of", "has_part"),
}
```
