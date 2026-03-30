"""
Re-DocRED Dataset Loader for RelationRecall Benchmark

Re-DocRED is a revised version of DocRED with improved annotations (+13 F1).
This loader fetches from HuggingFace and maps Wikidata relations to KP's 8 types.

Dataset: tonytan48/Re-DocRED
Paper: https://aclanthology.org/2022.emnlp-main.580/

Usage:
    from lib.redocred_loader import load_redocred_with_relations

    facts, relations = load_redocred_with_relations(n_documents=20, seed=42)
"""

import logging
import random
from typing import List, Dict, Tuple, Optional

logger = logging.getLogger(__name__)

# Wikidata property ID -> KP relation type mapping
# Based on semantic analysis of Wikidata property meanings
WIKIDATA_TO_KP_RELATION = {
    # part_of relations
    "P17": "part_of",      # country
    "P131": "part_of",     # located in administrative entity
    "P150": "part_of",     # contains administrative territorial entity
    "P361": "part_of",     # part of
    "P527": "part_of",     # has part
    "P279": "part_of",     # subclass of
    "P31": "part_of",      # instance of

    # causes relations
    "P509": "causes",      # cause of death
    "P828": "causes",      # has cause
    "P1542": "causes",     # has effect

    # enables relations
    "P102": "enables",     # member of political party
    "P39": "enables",      # position held
    "P108": "enables",     # employer
    "P1344": "enables",    # participant in

    # supports relations
    "P26": "supports",     # spouse (supports/related family)
    "P40": "supports",     # child
    "P22": "supports",     # father
    "P25": "supports",     # mother
    "P3373": "supports",   # sibling

    # references relations
    "P800": "references",  # notable work
    "P50": "references",   # author
    "P57": "references",   # director
    "P86": "references",   # composer
    "P170": "references",  # creator

    # depends_on relations
    "P1365": "depends_on", # replaces
    "P1366": "depends_on", # replaced by
    "P155": "depends_on",  # follows
    "P156": "depends_on",  # followed by

    # related_to (catch-all for other semantic relations)
    "P27": "related_to",   # country of citizenship
    "P19": "related_to",   # place of birth
    "P20": "related_to",   # place of death
    "P569": "related_to",  # date of birth
    "P570": "related_to",  # date of death
    "P495": "related_to",  # country of origin
    "P159": "related_to",  # headquarters location
    "P127": "related_to",  # owned by
    "P749": "related_to",  # parent organization
    "P355": "related_to",  # subsidiary
    "P137": "related_to",  # operator
    "P463": "related_to",  # member of
    "P6": "related_to",    # head of government
    "P35": "related_to",   # head of state
    "P112": "related_to",  # founded by
    "P571": "related_to",  # inception
    "P576": "related_to",  # dissolved
    "P607": "related_to",  # conflict
    "P175": "related_to",  # performer
    "P264": "related_to",  # record label
    "P407": "related_to",  # language of work
    "P136": "related_to",  # genre
    "P364": "related_to",  # original language
    "P840": "related_to",  # narrative location
    "P674": "related_to",  # characters
    "P161": "related_to",  # cast member
    "P162": "related_to",  # producer
    "P272": "related_to",  # production company
}

# KP relation types for reference
KP_RELATION_TYPES = [
    "references",
    "depends_on",
    "related_to",
    "part_of",
    "causes",
    "enables",
    "contradicts",
    "supports",
]


def _map_wikidata_to_kp(wikidata_id: str) -> str:
    """Map Wikidata property ID to KP relation type."""
    return WIKIDATA_TO_KP_RELATION.get(wikidata_id, "related_to")


def load_redocred_with_relations(
    n_documents: int = 20,
    seed: int = 42,
    split: str = "train_annotated",
    min_facts_per_doc: int = 3,
    max_facts_per_doc: int = 10,
) -> Tuple[List[Dict], List[Dict]]:
    """
    Load Re-DocRED dataset and extract facts with ground-truth relations.

    Args:
        n_documents: Number of documents to sample
        seed: Random seed for reproducibility
        split: Dataset split (train_annotated, dev, test)
        min_facts_per_doc: Minimum facts to extract per document
        max_facts_per_doc: Maximum facts to extract per document

    Returns:
        Tuple of (facts, ground_truth_relations)
    """
    try:
        from datasets import load_dataset
    except ImportError:
        logger.error("datasets package not installed. Run: pip install datasets")
        raise ImportError("datasets package required for Re-DocRED loader")

    logger.info(f"Loading Re-DocRED dataset (split={split})...")

    # Load Re-DocRED from HuggingFace
    try:
        dataset = load_dataset("tonytan48/Re-DocRED", split=split)
    except Exception as e:
        logger.error(f"Failed to load Re-DocRED: {e}")
        raise RuntimeError(f"Could not load Re-DocRED dataset: {e}")

    random.seed(seed)

    # Sample documents
    all_indices = list(range(len(dataset)))
    random.shuffle(all_indices)

    facts = []
    ground_truth_relations = []
    fact_id_counter = 0
    doc_count = 0

    for idx in all_indices:
        if doc_count >= n_documents:
            break

        doc = dataset[idx]

        # Extract sentences and entity mentions
        sents = doc.get("sents", [])
        vertex_set = doc.get("vertexSet", [])
        labels = doc.get("labels", [])

        if not sents or not vertex_set or not labels:
            continue

        # Build entity ID -> name mapping
        entity_names = {}
        for ent_idx, entity in enumerate(vertex_set):
            if entity:
                # Use first mention's name
                entity_names[ent_idx] = entity[0].get("name", f"Entity_{ent_idx}")

        # Build document text (joined sentences)
        doc_text = " ".join([" ".join(sent) for sent in sents])

        # Extract facts from entity descriptions
        doc_facts = []
        entity_to_fact_id = {}

        for ent_idx, entity in enumerate(vertex_set):
            if not entity:
                continue

            ent_name = entity_names.get(ent_idx, f"Entity_{ent_idx}")

            # Find sentence indices where entity is mentioned
            sent_indices = set()
            for mention in entity:
                sent_idx = mention.get("sent_id", 0)
                sent_indices.add(sent_idx)

            # Create fact from first mentioned sentence
            if sent_indices:
                first_sent_idx = min(sent_indices)
                if first_sent_idx < len(sents):
                    fact_text = " ".join(sents[first_sent_idx])

                    fact = {
                        "content": fact_text,
                        "metadata": {
                            "entity": ent_name,
                            "entity_idx": ent_idx,
                            "doc_idx": idx,
                            "source": "redocred",
                        },
                        "local_id": f"fact_{fact_id_counter}",
                    }

                    doc_facts.append(fact)
                    entity_to_fact_id[ent_idx] = fact_id_counter
                    fact_id_counter += 1

        # Check if we have enough facts
        if len(doc_facts) < min_facts_per_doc:
            continue

        # Limit facts per document
        if len(doc_facts) > max_facts_per_doc:
            doc_facts = doc_facts[:max_facts_per_doc]
            # Update entity_to_fact_id for limited facts
            valid_local_ids = set(int(f["local_id"].replace("fact_", "")) for f in doc_facts)
            entity_to_fact_id = {k: v for k, v in entity_to_fact_id.items() if v in valid_local_ids}

        facts.extend(doc_facts)

        # Extract relations from labels
        for label in labels:
            head_idx = label.get("h")
            tail_idx = label.get("t")
            rel_id = label.get("r")

            if head_idx is None or tail_idx is None or rel_id is None:
                continue

            # Check if both entities have associated facts
            if head_idx not in entity_to_fact_id or tail_idx not in entity_to_fact_id:
                continue

            # Map Wikidata relation to KP type
            kp_relation_type = _map_wikidata_to_kp(rel_id)

            relation = {
                "from_local_id": entity_to_fact_id[head_idx],
                "to_local_id": entity_to_fact_id[tail_idx],
                "type": kp_relation_type,
                "wikidata_id": rel_id,
                "theme": f"doc_{idx}",
            }
            ground_truth_relations.append(relation)

        doc_count += 1

    logger.info(
        f"Loaded {len(facts)} facts from {doc_count} documents "
        f"with {len(ground_truth_relations)} ground-truth relations"
    )

    # Log relation type distribution
    type_counts = {}
    for rel in ground_truth_relations:
        rel_type = rel["type"]
        type_counts[rel_type] = type_counts.get(rel_type, 0) + 1

    logger.info(f"Relation type distribution: {type_counts}")

    return facts, ground_truth_relations


def get_relation_type_statistics(relations: List[Dict]) -> Dict[str, int]:
    """Get distribution of relation types."""
    type_counts = {}
    for rel in relations:
        rel_type = rel.get("type", "unknown")
        type_counts[rel_type] = type_counts.get(rel_type, 0) + 1
    return type_counts


def verify_dataset_availability() -> bool:
    """Check if Re-DocRED dataset is accessible."""
    try:
        from datasets import load_dataset
        # Try to access dataset info without full download
        dataset = load_dataset("tonytan48/Re-DocRED", split="train_annotated[:1]")
        return True
    except Exception as e:
        logger.warning(f"Re-DocRED not available: {e}")
        return False


if __name__ == "__main__":
    # Test the loader
    logging.basicConfig(level=logging.INFO)

    print("Testing Re-DocRED loader...")

    if verify_dataset_availability():
        facts, relations = load_redocred_with_relations(n_documents=5, seed=42)

        print(f"\nLoaded {len(facts)} facts")
        print(f"Loaded {len(relations)} relations")

        print("\nSample fact:")
        if facts:
            print(f"  Content: {facts[0]['content'][:100]}...")

        print("\nSample relation:")
        if relations:
            print(f"  {relations[0]}")

        print("\nRelation type distribution:")
        for rel_type, count in get_relation_type_statistics(relations).items():
            print(f"  {rel_type}: {count}")
    else:
        print("Re-DocRED dataset not available. Check HuggingFace access.")
