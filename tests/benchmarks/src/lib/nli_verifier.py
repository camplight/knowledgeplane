"""
NLI-based Relation Verifier for RelationRecall Benchmark

Uses DeBERTa-v3-large fine-tuned on MNLI/FEVER/ANLI for entailment-based
verification of discovered relations without human annotation.

Model: MoritzLaurer/DeBERTa-v3-large-mnli-fever-anli-ling-wanli
Performance: 92.6% MNLI, 92.2% ANLI

Usage:
    from lib.nli_verifier import NLIVerifier

    verifier = NLIVerifier()
    score = verifier.verify_relation(
        source_text="Einstein developed the theory of relativity.",
        target_text="The theory of relativity revolutionized physics.",
        relation_type="causes"
    )
"""

import logging
from typing import Dict, List, Tuple, Optional

logger = logging.getLogger(__name__)

# Template hypotheses for each KP relation type
# These convert (source, target, relation_type) into NLI hypothesis
RELATION_TEMPLATES = {
    "references": [
        "{source_entity} is mentioned in relation to {target_entity}",
        "{source_entity} references or cites {target_entity}",
    ],
    "depends_on": [
        "{source_entity} depends on or requires {target_entity}",
        "{target_entity} is a prerequisite for {source_entity}",
    ],
    "related_to": [
        "{source_entity} and {target_entity} are related",
        "There is a connection between {source_entity} and {target_entity}",
    ],
    "part_of": [
        "{source_entity} is part of {target_entity}",
        "{source_entity} belongs to {target_entity}",
    ],
    "causes": [
        "{source_entity} causes or leads to {target_entity}",
        "{target_entity} is a result of {source_entity}",
    ],
    "enables": [
        "{source_entity} enables or allows {target_entity}",
        "{source_entity} makes {target_entity} possible",
    ],
    "contradicts": [
        "{source_entity} contradicts {target_entity}",
        "{source_entity} and {target_entity} are incompatible",
    ],
    "supports": [
        "{source_entity} supports or confirms {target_entity}",
        "{source_entity} provides evidence for {target_entity}",
    ],
}

# Per-type calibrated thresholds based on relation semantics
# More specific relations (causes) need higher confidence
# Generic relations (related_to) can have lower threshold
RELATION_THRESHOLDS = {
    "references": 0.50,
    "depends_on": 0.55,
    "related_to": 0.40,   # Lower threshold for generic relation
    "part_of": 0.55,
    "causes": 0.65,       # Higher threshold for causal claims
    "enables": 0.55,
    "contradicts": 0.70,  # Highest threshold - contradictions are strong claims
    "supports": 0.50,
}


class NLIVerifier:
    """
    Verifies relations using Natural Language Inference.

    Uses a DeBERTa model fine-tuned on multiple NLI datasets to determine
    if a relation between two text snippets is semantically valid.
    """

    def __init__(
        self,
        model_name: str = "MoritzLaurer/DeBERTa-v3-large-mnli-fever-anli-ling-wanli",
        device: Optional[str] = None,
        batch_size: int = 8,
    ):
        """
        Initialize the NLI verifier.

        Args:
            model_name: HuggingFace model ID for NLI
            device: Device to run model on (auto-detected if None)
            batch_size: Batch size for inference
        """
        self.model_name = model_name
        self.batch_size = batch_size
        self.model = None
        self.tokenizer = None
        self.device = device
        self._initialized = False

    def _lazy_init(self):
        """Lazily initialize the model to avoid loading at import time."""
        if self._initialized:
            return

        try:
            import torch
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
        except ImportError:
            raise ImportError(
                "transformers and torch required for NLI verification. "
                "Run: pip install transformers torch"
            )

        logger.info(f"Loading NLI model: {self.model_name}")

        # Auto-detect device
        if self.device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"

        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
        self.model.to(self.device)
        self.model.eval()

        # Get label mapping (model-specific)
        self.label2id = self.model.config.label2id
        self.id2label = self.model.config.id2label

        logger.info(f"NLI model loaded on {self.device}")
        logger.info(f"Labels: {self.id2label}")

        self._initialized = True

    def _get_hypothesis(
        self,
        source_entity: str,
        target_entity: str,
        relation_type: str,
    ) -> str:
        """Generate NLI hypothesis from relation template."""
        templates = RELATION_TEMPLATES.get(relation_type, RELATION_TEMPLATES["related_to"])
        template = templates[0]  # Use first template

        return template.format(
            source_entity=source_entity,
            target_entity=target_entity,
        )

    def _extract_entity_summary(self, text: str, max_words: int = 20) -> str:
        """Extract a short summary/entity from longer text."""
        words = text.split()
        if len(words) <= max_words:
            return text
        return " ".join(words[:max_words]) + "..."

    def verify_relation(
        self,
        source_text: str,
        target_text: str,
        relation_type: str,
        use_calibrated_threshold: bool = True,
    ) -> Dict:
        """
        Verify a relation between two text snippets using NLI.

        Args:
            source_text: Text describing the source entity/fact
            target_text: Text describing the target entity/fact
            relation_type: KP relation type (e.g., "causes", "part_of")
            use_calibrated_threshold: Use per-type thresholds vs flat 0.5

        Returns:
            Dict with:
                - entailment_score: Probability of entailment (0-1)
                - is_valid: Boolean based on threshold
                - label: Predicted NLI label (entailment/neutral/contradiction)
                - threshold: Threshold used for decision
                - confidence: Model confidence in prediction
        """
        self._lazy_init()

        import torch

        # Extract entity summaries for hypothesis
        source_entity = self._extract_entity_summary(source_text)
        target_entity = self._extract_entity_summary(target_text)

        # Build premise (concatenated texts) and hypothesis
        premise = f"{source_text} {target_text}"
        hypothesis = self._get_hypothesis(source_entity, target_entity, relation_type)

        # Tokenize
        inputs = self.tokenizer(
            premise,
            hypothesis,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        ).to(self.device)

        # Run inference
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)[0]

        # Extract entailment probability
        # Label mapping varies by model, but typically:
        # DeBERTa: 0=contradiction, 1=neutral, 2=entailment
        entailment_idx = self.label2id.get("entailment", 2)
        neutral_idx = self.label2id.get("neutral", 1)
        contradiction_idx = self.label2id.get("contradiction", 0)

        entailment_score = probs[entailment_idx].item()
        neutral_score = probs[neutral_idx].item()
        contradiction_score = probs[contradiction_idx].item()

        # Get predicted label
        predicted_idx = torch.argmax(probs).item()
        predicted_label = self.id2label.get(predicted_idx, "unknown")

        # Determine threshold
        if use_calibrated_threshold:
            threshold = RELATION_THRESHOLDS.get(relation_type, 0.5)
        else:
            threshold = 0.5

        # Decision
        is_valid = entailment_score >= threshold

        return {
            "entailment_score": entailment_score,
            "neutral_score": neutral_score,
            "contradiction_score": contradiction_score,
            "is_valid": is_valid,
            "label": predicted_label,
            "threshold": threshold,
            "confidence": max(probs).item(),
            "hypothesis": hypothesis,
        }

    def verify_relation_batch(
        self,
        relations: List[Dict],
        source_texts: Dict[int, str],
        target_texts: Dict[int, str],
    ) -> List[Dict]:
        """
        Verify multiple relations in batch.

        Args:
            relations: List of relation dicts with from_local_id, to_local_id, type
            source_texts: Mapping from local_id to source text
            target_texts: Mapping from local_id to target text

        Returns:
            List of verification results
        """
        self._lazy_init()

        import torch

        results = []

        # Process in batches
        for i in range(0, len(relations), self.batch_size):
            batch = relations[i:i + self.batch_size]

            premises = []
            hypotheses = []
            relation_types = []

            for rel in batch:
                from_id = rel.get("from_local_id")
                to_id = rel.get("to_local_id")
                rel_type = rel.get("type", "related_to")

                source = source_texts.get(from_id, "")
                target = target_texts.get(to_id, "")

                if not source or not target:
                    results.append({
                        "entailment_score": 0.0,
                        "is_valid": False,
                        "label": "error",
                        "error": "Missing source or target text",
                    })
                    continue

                premise = f"{source} {target}"
                source_entity = self._extract_entity_summary(source)
                target_entity = self._extract_entity_summary(target)
                hypothesis = self._get_hypothesis(source_entity, target_entity, rel_type)

                premises.append(premise)
                hypotheses.append(hypothesis)
                relation_types.append(rel_type)

            if not premises:
                continue

            # Tokenize batch
            inputs = self.tokenizer(
                premises,
                hypotheses,
                truncation=True,
                max_length=512,
                padding=True,
                return_tensors="pt",
            ).to(self.device)

            # Run inference
            with torch.no_grad():
                outputs = self.model(**inputs)
                probs = torch.softmax(outputs.logits, dim=-1)

            # Extract results
            entailment_idx = self.label2id.get("entailment", 2)

            for j, (prob, rel_type) in enumerate(zip(probs, relation_types)):
                entailment_score = prob[entailment_idx].item()
                threshold = RELATION_THRESHOLDS.get(rel_type, 0.5)
                predicted_idx = torch.argmax(prob).item()

                results.append({
                    "entailment_score": entailment_score,
                    "is_valid": entailment_score >= threshold,
                    "label": self.id2label.get(predicted_idx, "unknown"),
                    "threshold": threshold,
                    "confidence": max(prob).item(),
                })

        return results

    def compute_verified_metrics(
        self,
        predicted_relations: List[Dict],
        ground_truth_relations: List[Dict],
        fact_texts: Dict[int, str],
    ) -> Dict:
        """
        Compute metrics with NLI-verified relations.

        Computes:
        - Raw P/R/F1 (direct comparison)
        - NLI-verified P/R/F1 (only count relations that pass NLI)

        Args:
            predicted_relations: Relations discovered by system
            ground_truth_relations: Ground truth relations
            fact_texts: Mapping from local_id to fact content

        Returns:
            Dict with raw and verified metrics
        """
        # Verify ground truth relations
        logger.info("Verifying ground truth relations with NLI...")
        gt_verification = self.verify_relation_batch(
            ground_truth_relations, fact_texts, fact_texts
        )

        # Filter ground truth to only include verifiable relations
        verified_gt = []
        for rel, ver in zip(ground_truth_relations, gt_verification):
            if ver.get("is_valid", False):
                verified_gt.append(rel)

        logger.info(
            f"Ground truth: {len(ground_truth_relations)} total, "
            f"{len(verified_gt)} NLI-verified"
        )

        # Verify predicted relations
        if predicted_relations:
            logger.info("Verifying predicted relations with NLI...")
            pred_verification = self.verify_relation_batch(
                predicted_relations, fact_texts, fact_texts
            )

            verified_pred = []
            for rel, ver in zip(predicted_relations, pred_verification):
                if ver.get("is_valid", False):
                    verified_pred.append(rel)

            logger.info(
                f"Predicted: {len(predicted_relations)} total, "
                f"{len(verified_pred)} NLI-verified"
            )
        else:
            verified_pred = []

        # Compute raw metrics (using all relations)
        raw_metrics = self._compute_prf(predicted_relations, ground_truth_relations)

        # Compute verified metrics (using only NLI-verified relations)
        verified_metrics = self._compute_prf(verified_pred, verified_gt)

        return {
            "raw": raw_metrics,
            "verified": verified_metrics,
            "ground_truth_count": len(ground_truth_relations),
            "ground_truth_verified_count": len(verified_gt),
            "predicted_count": len(predicted_relations),
            "predicted_verified_count": len(verified_pred),
        }

    def _compute_prf(
        self,
        predicted: List[Dict],
        ground_truth: List[Dict],
    ) -> Dict:
        """Compute precision, recall, F1 from relation lists."""
        # Build sets of (from_id, to_id) pairs
        pred_pairs = set()
        for rel in predicted:
            from_id = rel.get("from_local_id")
            to_id = rel.get("to_local_id")
            if from_id is not None and to_id is not None:
                pred_pairs.add((from_id, to_id))

        gt_pairs = set()
        for rel in ground_truth:
            from_id = rel.get("from_local_id")
            to_id = rel.get("to_local_id")
            if from_id is not None and to_id is not None:
                gt_pairs.add((from_id, to_id))

        tp = len(pred_pairs & gt_pairs)
        fp = len(pred_pairs - gt_pairs)
        fn = len(gt_pairs - pred_pairs)

        precision = tp / len(pred_pairs) if pred_pairs else 0.0
        recall = tp / len(gt_pairs) if gt_pairs else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        return {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
        }


def verify_model_availability() -> bool:
    """Check if NLI model can be loaded."""
    try:
        from transformers import AutoTokenizer
        tokenizer = AutoTokenizer.from_pretrained(
            "MoritzLaurer/DeBERTa-v3-large-mnli-fever-anli-ling-wanli"
        )
        return True
    except Exception as e:
        logger.warning(f"NLI model not available: {e}")
        return False


if __name__ == "__main__":
    # Test the verifier
    logging.basicConfig(level=logging.INFO)

    print("Testing NLI Verifier...")

    if verify_model_availability():
        verifier = NLIVerifier()

        # Test cases
        test_cases = [
            {
                "source": "Climate change causes rising global temperatures.",
                "target": "Sea levels are rising due to melting ice caps.",
                "type": "causes",
                "expected": True,
            },
            {
                "source": "Python is a programming language.",
                "target": "The Amazon rainforest is in South America.",
                "type": "related_to",
                "expected": False,
            },
            {
                "source": "Einstein developed the theory of relativity.",
                "target": "The theory of relativity revolutionized physics.",
                "type": "enables",
                "expected": True,
            },
        ]

        print("\nTest Results:")
        for tc in test_cases:
            result = verifier.verify_relation(
                tc["source"], tc["target"], tc["type"]
            )
            status = "✓" if result["is_valid"] == tc["expected"] else "✗"
            print(f"\n{status} {tc['type']}:")
            print(f"   Source: {tc['source'][:50]}...")
            print(f"   Target: {tc['target'][:50]}...")
            print(f"   Score: {result['entailment_score']:.3f} (threshold: {result['threshold']})")
            print(f"   Valid: {result['is_valid']} (expected: {tc['expected']})")
    else:
        print("NLI model not available. Check HuggingFace access.")
