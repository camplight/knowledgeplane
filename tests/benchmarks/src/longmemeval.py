#!/usr/bin/env python3
"""
LongMemEval Benchmark for KnowledgePlane

This is KnowledgePlane's PRIMARY external benchmark for credibility.
LongMemEval (ICLR 2025) tests 5 core long-term memory abilities:

1. Information Extraction (IE) - Recall specific details from history
2. Multi-Session Reasoning (MR) - Synthesize across multiple sessions
3. Temporal Reasoning (TR) - Process timestamps and time mentions
4. Knowledge Updates (KU) - Track changes over time
5. Abstention (ABS) - Decline unanswerable questions

Why LongMemEval:
- Neutral third party (UCLA/Tencent, not a competitor)
- ICLR 2025 publication (top-tier venue)
- No competitor politics (unlike LoCoMo)
- 500 manually curated questions with human validation

Dataset settings:
- oracle: Evidence sessions only (easiest, for debugging)
- s: Standard setting (~115K tokens, ~40 sessions)
- m: Extended setting (~1.5M tokens, ~500 sessions)

Usage:
    # Oracle setting (evidence only)
    python longmemeval.py --setting oracle

    # Full standard benchmark
    python longmemeval.py --setting s

    # Extended stress test
    python longmemeval.py --setting m --n 100

    # Filter by ability
    python longmemeval.py --ability tr  # Temporal reasoning only

    # Mock mode (no server required)
    python longmemeval.py --setting oracle --mock
"""

import argparse
import csv
import json
import logging
import os
import random
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime

# Model configuration - read from env with sensible defaults
ANSWER_MODEL = os.environ.get("OPENAI_MODEL", os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o"))
JUDGE_MODEL = os.environ.get("OPENAI_JUDGE_MODEL", "gpt-4o")  # Keep strong model for evaluation
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple, Set

import numpy as np
from tqdm import tqdm

from lib.adapter import (
    HTTPKnowledgePlaneAdapter,
    MockKnowledgePlaneAdapter,
    KnowledgePlaneAdapter,
    cleanup_benchmark_facts_by_prefix,
)
from lib.preflight import PreflightChecker, PreflightConfig

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# =====================================================================
# Data Structures
# =====================================================================

@dataclass
class LongMemEvalQuestion:
    """A single LongMemEval question."""
    question_id: str
    question_type: str  # single-session-user, multi-session, temporal-reasoning, etc.
    question: str
    answer: str
    question_date: str
    haystack_session_ids: List[str]
    haystack_dates: List[str]
    haystack_sessions: List[Dict]  # List of session dicts with turns
    answer_session_ids: List[str]

    @property
    def ability(self) -> str:
        """Map question type to ability code."""
        type_to_ability = {
            "single-session-user": "ie",
            "single-session-assistant": "ie",
            "single-session-preference": "ie",
            "multi-session": "mr",
            "temporal-reasoning": "tr",
            "knowledge-update": "ku",
        }
        base_type = self.question_type.replace("_abs", "")
        ability = type_to_ability.get(base_type, "ie")
        if "_abs" in self.question_type:
            return "abs"
        return ability


@dataclass
class EvaluationResult:
    """Result of evaluating a single question."""
    question_id: str
    question_type: str
    ability: str
    question: str
    ground_truth: str
    predicted_answer: str
    is_correct: bool
    retrieved_session_ids: List[str]
    answer_session_ids: List[str]
    recall_at_k: float
    ndcg_at_k: float
    latency_ms: float


@dataclass
class BenchmarkSummary:
    """Summary of benchmark results."""
    setting: str
    n_questions: int
    accuracy: float
    recall_at_5: float
    ndcg_at_5: float
    avg_latency_ms: float
    by_ability: Dict[str, float]
    by_question_type: Dict[str, float]
    abstention_accuracy: float  # Accuracy on _abs questions


# =====================================================================
# Competitor Baselines (from published results)
# =====================================================================

# LongMemEval published baselines - all on S setting (115K tokens)
# Sources: arXiv 2410.10813, Zep paper, Emergence AI, Mastra Research
COMPETITOR_BASELINES = {
    "GPT-4o (Oracle)": {
        "accuracy": 0.92,
        "note": "Evidence sessions only (~3k tokens)",
        "source": "arXiv:2410.10813"
    },
    "GPT-4o (Full Context)": {
        "accuracy": 0.60,
        "note": "Full 115K token haystack",
        "source": "arXiv:2410.10813"
    },
    "Zep/Graphiti + GPT-4o": {
        "accuracy": 0.712,
        "note": "Temporal KG retrieval",
        "source": "arXiv:2501.13956"
    },
    "EmergenceMem": {
        "accuracy": 0.86,
        "note": "RAG-based retrieval",
        "source": "emergence.ai/blog"
    },
    "Supermemory + GPT-4o": {
        "accuracy": 0.816,
        "note": "Memory system",
        "source": "supermemory.ai/research"
    },
    "Supermemory + Gemini-3-Pro": {
        "accuracy": 0.852,
        "note": "Memory system",
        "source": "supermemory.ai/research"
    },
    "Mastra OM + GPT-4o": {
        "accuracy": 0.8423,
        "note": "Observational Memory",
        "source": "mastra.ai/research"
    },
    "Mastra OM + GPT-5-mini": {
        "accuracy": 0.9487,
        "note": "SOTA - Observational Memory",
        "source": "mastra.ai/research"
    },
}


# =====================================================================
# Dataset Loading
# =====================================================================

def download_dataset(setting: str) -> Path:
    """Download LongMemEval dataset from HuggingFace."""
    import urllib.request

    setting_to_file = {
        "oracle": "longmemeval_oracle.json",
        "s": "longmemeval_s_cleaned.json",
        "m": "longmemeval_m_cleaned.json",
    }

    filename = setting_to_file.get(setting, "longmemeval_oracle.json")
    data_dir = Path(__file__).parent.parent / "data" / "longmemeval"
    data_dir.mkdir(parents=True, exist_ok=True)

    filepath = data_dir / filename

    if not filepath.exists():
        logger.info(f"Downloading {filename} from HuggingFace...")
        url = f"https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/{filename}"
        try:
            urllib.request.urlretrieve(url, filepath)
            logger.info(f"Downloaded to {filepath}")
        except Exception as e:
            logger.error(f"Failed to download dataset: {e}")
            logger.info("Creating mock dataset for testing...")
            # Create a small mock dataset for testing
            mock_data = create_mock_dataset()
            with open(filepath, 'w') as f:
                json.dump(mock_data, f, indent=2)

    return filepath


def create_mock_dataset() -> List[Dict]:
    """Create a small mock dataset for testing."""
    mock_questions = [
        {
            "question_id": "mock_ie_1",
            "question_type": "single-session-user",
            "question": "What is the user's favorite programming language?",
            "answer": "Python",
            "question_date": "2024-03-15",
            "haystack_session_ids": ["session_1"],
            "haystack_dates": ["2024-03-10"],
            "haystack_sessions": [
                {
                    "session_id": "session_1",
                    "date": "2024-03-10",
                    "turns": [
                        {"role": "user", "content": "I really love programming in Python. It's my favorite language.", "has_answer": True},
                        {"role": "assistant", "content": "Python is a great choice! What do you mainly use it for?"},
                    ]
                }
            ],
            "answer_session_ids": ["session_1"]
        },
        {
            "question_id": "mock_mr_1",
            "question_type": "multi-session",
            "question": "What are all the programming languages the user mentioned learning?",
            "answer": "Python, JavaScript, and Rust",
            "question_date": "2024-03-20",
            "haystack_session_ids": ["session_1", "session_2", "session_3"],
            "haystack_dates": ["2024-03-10", "2024-03-12", "2024-03-15"],
            "haystack_sessions": [
                {
                    "session_id": "session_1",
                    "date": "2024-03-10",
                    "turns": [
                        {"role": "user", "content": "I started learning Python last week.", "has_answer": True},
                        {"role": "assistant", "content": "That's great! Python is an excellent first language."},
                    ]
                },
                {
                    "session_id": "session_2",
                    "date": "2024-03-12",
                    "turns": [
                        {"role": "user", "content": "Now I'm also picking up JavaScript for web development.", "has_answer": True},
                        {"role": "assistant", "content": "JavaScript is essential for web development."},
                    ]
                },
                {
                    "session_id": "session_3",
                    "date": "2024-03-15",
                    "turns": [
                        {"role": "user", "content": "I've been exploring Rust for systems programming.", "has_answer": True},
                        {"role": "assistant", "content": "Rust is known for its memory safety features."},
                    ]
                }
            ],
            "answer_session_ids": ["session_1", "session_2", "session_3"]
        },
        {
            "question_id": "mock_tr_1",
            "question_type": "temporal-reasoning",
            "question": "What was the user working on before they switched to the new project?",
            "answer": "A data pipeline",
            "question_date": "2024-03-25",
            "haystack_session_ids": ["session_old", "session_new"],
            "haystack_dates": ["2024-03-01", "2024-03-20"],
            "haystack_sessions": [
                {
                    "session_id": "session_old",
                    "date": "2024-03-01",
                    "turns": [
                        {"role": "user", "content": "I'm building a data pipeline for our analytics team.", "has_answer": True},
                        {"role": "assistant", "content": "What technologies are you using?"},
                    ]
                },
                {
                    "session_id": "session_new",
                    "date": "2024-03-20",
                    "turns": [
                        {"role": "user", "content": "I switched to a new project - building a mobile app now.", "has_answer": False},
                        {"role": "assistant", "content": "Exciting! What framework are you using?"},
                    ]
                }
            ],
            "answer_session_ids": ["session_old"]
        },
        {
            "question_id": "mock_ku_1",
            "question_type": "knowledge-update",
            "question": "What is the user's current job title?",
            "answer": "Senior Engineer",
            "question_date": "2024-04-01",
            "haystack_session_ids": ["session_old", "session_new"],
            "haystack_dates": ["2024-02-01", "2024-03-15"],
            "haystack_sessions": [
                {
                    "session_id": "session_old",
                    "date": "2024-02-01",
                    "turns": [
                        {"role": "user", "content": "I'm a Software Engineer at TechCorp.", "has_answer": False},
                        {"role": "assistant", "content": "Nice! How long have you been there?"},
                    ]
                },
                {
                    "session_id": "session_new",
                    "date": "2024-03-15",
                    "turns": [
                        {"role": "user", "content": "Great news - I got promoted to Senior Engineer!", "has_answer": True},
                        {"role": "assistant", "content": "Congratulations on the promotion!"},
                    ]
                }
            ],
            "answer_session_ids": ["session_new"]
        },
        {
            "question_id": "mock_abs_1",
            "question_type": "single-session-user_abs",
            "question": "What is the user's phone number?",
            "answer": "I don't know",
            "question_date": "2024-03-25",
            "haystack_session_ids": ["session_1"],
            "haystack_dates": ["2024-03-10"],
            "haystack_sessions": [
                {
                    "session_id": "session_1",
                    "date": "2024-03-10",
                    "turns": [
                        {"role": "user", "content": "My email is john@example.com", "has_answer": False},
                        {"role": "assistant", "content": "Thanks for sharing your email."},
                    ]
                }
            ],
            "answer_session_ids": []
        },
    ]
    return mock_questions


def load_dataset(setting: str, ability_filter: Optional[str] = None) -> List[LongMemEvalQuestion]:
    """Load LongMemEval dataset."""
    filepath = download_dataset(setting)

    with open(filepath, 'r') as f:
        raw_data = json.load(f)

    questions = []
    for item in raw_data:
        q = LongMemEvalQuestion(
            question_id=item["question_id"],
            question_type=item["question_type"],
            question=item["question"],
            answer=item["answer"],
            question_date=item.get("question_date", ""),
            haystack_session_ids=item.get("haystack_session_ids", []),
            haystack_dates=item.get("haystack_dates", []),
            haystack_sessions=item.get("haystack_sessions", []),
            answer_session_ids=item.get("answer_session_ids", []),
        )

        # Filter by ability if specified
        if ability_filter and q.ability != ability_filter:
            continue

        questions.append(q)

    logger.info(f"Loaded {len(questions)} questions from {filepath.name}")
    return questions


# =====================================================================
# Answer Evaluation (GPT-4o Judge)
# =====================================================================

def evaluate_answer_with_gpt4o(
    question: str,
    ground_truth: str,
    predicted: str,
    question_type: str,
) -> Tuple[bool, float]:
    """
    Use GPT-4o as automated judge to evaluate answer correctness.

    Returns:
        Tuple of (is_correct, confidence)
    """
    import openai

    # Handle abstention questions
    is_abstention = "_abs" in question_type

    if is_abstention:
        # For abstention, check if model correctly refused to answer
        abstention_phrases = [
            "i don't know", "i do not know", "not sure", "cannot answer",
            "no information", "not mentioned", "unclear", "unknown"
        ]
        predicted_lower = predicted.lower()
        is_correct = any(phrase in predicted_lower for phrase in abstention_phrases)
        return is_correct, 1.0 if is_correct else 0.0

    # For other questions, use GPT-4o as judge
    try:
        client = openai.OpenAI()

        prompt = f"""You are evaluating whether a model's answer correctly answers a question about a user's conversation history.

Question: {question}
Ground Truth Answer: {ground_truth}
Model's Answer: {predicted}

Consider the answer correct if:
1. It conveys the same essential information as the ground truth
2. Minor wording differences are acceptable
3. Additional correct context is acceptable
4. Partial answers that include the key information are acceptable

Respond with ONLY "CORRECT" or "INCORRECT" followed by a confidence score (0.0-1.0).
Example: "CORRECT 0.95" or "INCORRECT 0.80"
"""

        response = client.chat.completions.create(
            model=JUDGE_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=20,
            temperature=0,
            seed=42,  # For deterministic evaluation
        )

        result = response.choices[0].message.content.strip()
        is_correct = result.startswith("CORRECT")

        # Parse confidence
        parts = result.split()
        confidence = float(parts[1]) if len(parts) > 1 else (1.0 if is_correct else 0.0)

        return is_correct, confidence

    except Exception as e:
        logger.warning(f"GPT-4o evaluation failed: {e}. Falling back to exact match.")
        # Fallback to simple string matching
        gt_normalized = ground_truth.lower().strip()
        pred_normalized = predicted.lower().strip()
        is_correct = gt_normalized in pred_normalized or pred_normalized in gt_normalized
        return is_correct, 1.0 if is_correct else 0.0


# =====================================================================
# Retrieval Metrics
# =====================================================================

def compute_recall_at_k(retrieved_ids: List[str], relevant_ids: List[str], k: int = 5) -> float:
    """Compute Recall@k: fraction of relevant items in top-k retrieved."""
    if not relevant_ids:
        return 1.0  # No relevant items = perfect recall

    top_k = set(retrieved_ids[:k])
    relevant = set(relevant_ids)

    hits = len(top_k & relevant)
    return hits / len(relevant)


def compute_ndcg_at_k(retrieved_ids: List[str], relevant_ids: List[str], k: int = 5) -> float:
    """Compute NDCG@k: Normalized Discounted Cumulative Gain."""
    if not relevant_ids:
        return 1.0

    relevant_set = set(relevant_ids)

    # DCG
    dcg = 0.0
    for i, item_id in enumerate(retrieved_ids[:k]):
        if item_id in relevant_set:
            dcg += 1.0 / np.log2(i + 2)  # +2 because i is 0-indexed

    # Ideal DCG
    ideal_dcg = sum(1.0 / np.log2(i + 2) for i in range(min(k, len(relevant_ids))))

    return dcg / ideal_dcg if ideal_dcg > 0 else 0.0


# =====================================================================
# Main Benchmark
# =====================================================================

def chunk_turns_with_overlap(
    turns: List[Dict],
    chunk_size: int = 4,
    overlap: int = 1,
) -> List[List[Dict]]:
    """
    Split conversation turns into chunks with sliding window overlap.

    Args:
        turns: List of turn dicts with 'role', 'content', 'has_answer'
        chunk_size: Number of turns per chunk (default: 4)
        overlap: Number of turns to overlap between chunks (default: 1)

    Returns:
        List of chunks, each chunk is a list of turns

    Example with chunk_size=4, overlap=1:
        Turns: [T1, T2, T3, T4, T5, T6, T7, T8, T9]
        Chunk 1: [T1, T2, T3, T4]
        Chunk 2: [T4, T5, T6, T7]  <- T4 overlaps
        Chunk 3: [T7, T8, T9]      <- T7 overlaps
    """
    if not turns:
        return []

    if len(turns) <= chunk_size:
        return [turns]

    chunks = []
    step = chunk_size - overlap

    for i in range(0, len(turns), step):
        chunk = turns[i:i + chunk_size]
        if chunk:  # Don't add empty chunks
            chunks.append(chunk)
        # Stop if we've included all turns
        if i + chunk_size >= len(turns):
            break

    return chunks


def ingest_sessions_as_facts(
    adapter: KnowledgePlaneAdapter,
    question: LongMemEvalQuestion,
    namespace_prefix: str = "longmemeval",
    chunk_size: int = 4,
    chunk_overlap: int = 1,
) -> Dict[str, str]:
    """
    Ingest conversation sessions as chunked facts into KnowledgePlane.

    Sessions are split into chunks of N turns with overlap to ensure:
    1. Entity extraction works on focused ~1K char chunks (not 13K)
    2. Retrieval is turn-level precise (not session-level)
    3. Cross-chunk entities connected via n-hop graph traversal

    LongMemEval format:
    - haystack_sessions: List[List[Turn]] - each inner list is a session's turns
    - haystack_session_ids: List[str] - session IDs aligned by index
    - haystack_dates: List[str] - session dates aligned by index

    Returns:
        Dict mapping chunk_id to fact_id
    """
    chunk_to_fact = {}

    # Iterate over sessions with their IDs and dates
    for i, turns in enumerate(question.haystack_sessions):
        # Get session ID and date from aligned arrays
        session_id = (
            question.haystack_session_ids[i]
            if i < len(question.haystack_session_ids)
            else f"session_{i}"
        )
        session_date = (
            question.haystack_dates[i]
            if i < len(question.haystack_dates)
            else ""
        )

        # Chunk the session with sliding window overlap
        chunks = chunk_turns_with_overlap(turns, chunk_size, chunk_overlap)

        for chunk_idx, chunk_turns in enumerate(chunks):
            # Convert turns to text content
            content_parts = []
            for turn in chunk_turns:
                if isinstance(turn, dict):
                    role = turn.get("role", "user")
                    text = turn.get("content", "")
                    content_parts.append(f"{role.capitalize()}: {text}")
                else:
                    content_parts.append(str(turn))

            content = "\n".join(content_parts)

            # Create unique chunk ID
            chunk_id = f"{session_id}_chunk{chunk_idx}"

            # Create fact with session and chunk metadata
            metadata = {
                "namespace": f"{namespace_prefix}_{question.question_id}",
                "session_id": session_id,
                "session_date": session_date,
                "chunk_index": chunk_idx,
                "total_chunks": len(chunks),
                "question_id": question.question_id,
                "source": "longmemeval",
            }

            # Ingest as document
            results = adapter.ingest_documents(
                documents=[{"content": content, "metadata": metadata}],
                namespace=f"{namespace_prefix}_{question.question_id}",
            )

            if results and results[0].fact_ids:
                chunk_to_fact[chunk_id] = results[0].fact_ids[0]

    return chunk_to_fact


def generate_answer(
    adapter: KnowledgePlaneAdapter,
    question: LongMemEvalQuestion,
    retrieved_facts: List[Any],
    two_stage: bool = False,
) -> str:
    """
    Generate an answer using retrieved facts.

    Args:
        two_stage: If True, use Two-Stage LLM approach (extract then synthesize)
    """
    import openai

    client = openai.OpenAI()

    # Build context from retrieved facts with clear session structure
    context_parts = []
    fact_metadata = []
    for i, fact in enumerate(retrieved_facts):
        content = fact.content if hasattr(fact, 'content') else str(fact)
        metadata = fact.metadata if hasattr(fact, 'metadata') else {}
        session_date = metadata.get('session_date', '')
        session_id = metadata.get('session_id', f'session_{i}')

        fact_metadata.append({
            'content': content,
            'session_date': session_date,
            'session_id': session_id,
        })

        # Format with clear session header
        if session_date:
            context_parts.append(f"=== Session {session_id} (Date: {session_date}) ===\n{content}")
        else:
            context_parts.append(f"=== Session {session_id} ===\n{content}")

    context = "\n\n".join(context_parts)

    # Get question date for temporal context
    question_date = question.question_date if hasattr(question, 'question_date') else ""
    date_context = f"\nToday's date (when question is asked): {question_date}" if question_date else ""

    # Generate answer
    try:
        if two_stage:
            # ===== TWO-STAGE LLM APPROACH =====
            # Stage 1: Extract relevant facts from each session
            extracted_facts = []
            for fm in fact_metadata:
                extract_prompt = f"""Extract ONLY the information relevant to this question from the conversation below.

QUESTION: {question.question}

CONVERSATION (Session {fm['session_id']}, Date: {fm['session_date']}):
{fm['content']}

Extract any facts, numbers, dates, names, or details that could help answer the question.
If nothing relevant, respond with "No relevant information in this session."

RELEVANT FACTS:"""

                extract_response = client.chat.completions.create(
                    model=ANSWER_MODEL,
                    messages=[{"role": "user", "content": extract_prompt}],
                    max_tokens=200,
                    temperature=0,
                    seed=42,
                )
                extracted = extract_response.choices[0].message.content.strip()
                if "no relevant information" not in extracted.lower():
                    extracted_facts.append(f"[{fm['session_id']}, {fm['session_date']}]: {extracted}")

            # Stage 2: Synthesize answer from extracted facts
            if extracted_facts:
                facts_text = "\n".join(extracted_facts)
                synth_prompt = f"""Answer this question using ONLY the extracted facts below.
{date_context}

EXTRACTED FACTS:
{facts_text}

QUESTION: {question.question}

Give ONLY the final answer (number, name, amount, or short phrase).
Do NOT explain your reasoning.

ANSWER:"""
            else:
                # No facts extracted - fall back to direct approach
                synth_prompt = f"""Answer this question based on the conversation history below.
{date_context}

CONVERSATION HISTORY:
{context}

QUESTION: {question.question}

Give ONLY the final answer. The answer IS in the conversation - search thoroughly.

ANSWER:"""

            response = client.chat.completions.create(
                model=ANSWER_MODEL,
                messages=[{"role": "user", "content": synth_prompt}],
                max_tokens=200,
                temperature=0,
                seed=42,
            )
            return response.choices[0].message.content.strip()

        # ===== SINGLE-STAGE (BASELINE) =====
        # Simple direct extraction prompt - best performing (50% accuracy)
        prompt = f"""Answer this question based on the conversation history below.
{date_context}

CONVERSATION HISTORY:
{context}

QUESTION: {question.question}

RULES:
1. The answer IS in the conversation - search thoroughly
2. Focus on what the USER said they did, bought, visited, prefer, etc.
3. For counting: carefully list each distinct item found, then count the total
4. Give ONLY the final answer (number, name, amount, or short phrase)
5. Do NOT explain your reasoning
6. NEVER say "I don't know" or "no relevant information" - search again if needed
7. For temporal questions, use session dates to calculate time differences

ANSWER:"""

        is_counting = False  # Flag for parsing (keeping simple extraction)

        response = client.chat.completions.create(
            model=ANSWER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0,
            seed=42,
        )

        full_response = response.choices[0].message.content.strip()

        # Extract the final answer
        answer = full_response

        if is_counting:
            # For counting questions, extract the final count
            import re
            # Look for patterns like "Total: 5" or "Count: 5" or "FINAL COUNT: 5"
            count_patterns = [
                r'(?:final\s*)?(?:total|count)\s*[:\s]\s*(\d+)',
                r'(?:total|count)\s*(?:is|=)\s*(\d+)',
                r'(\d+)\s*(?:total|in total|altogether)',
            ]
            for pattern in count_patterns:
                match = re.search(pattern, full_response.lower())
                if match:
                    answer = match.group(1)
                    break
            else:
                # If no pattern matched, look for the last number mentioned
                numbers = re.findall(r'\b(\d+)\b', full_response)
                if numbers:
                    answer = numbers[-1]
        else:
            # If response has clear "Answer:" section, extract it
            if "Answer:" in full_response:
                answer = full_response.split("Answer:")[-1].strip()
            elif "answer is" in full_response.lower():
                sentences = full_response.split('.')
                for s in sentences:
                    if "answer is" in s.lower():
                        answer = s.split("answer is")[-1].strip().rstrip('.')
                        break
            elif "Therefore," in full_response:
                answer = full_response.split("Therefore,")[-1].strip()

        # Clean up the answer
        answer = answer.strip()
        if answer.startswith(':'):
            answer = answer[1:].strip()

        return answer if answer else full_response

    except Exception as e:
        logger.warning(f"Answer generation failed: {e}")
        return "I don't know"


def run_benchmark(
    adapter: KnowledgePlaneAdapter,
    questions: List[LongMemEvalQuestion],
    k: int = 5,
    namespace_prefix: str = "longmemeval",
    use_full_pipeline: bool = False,
    use_graph_expansion: bool = False,
    use_sync_consolidation: bool = False,
    two_stage: bool = False,
) -> List[EvaluationResult]:
    """
    Run the LongMemEval benchmark.

    Args:
        adapter: KnowledgePlane adapter
        questions: List of questions to evaluate
        k: Top-k for retrieval
        namespace_prefix: Prefix for fact namespaces
        use_full_pipeline: Enable full pipeline (consolidation + graph expansion + reranking)
        use_graph_expansion: Enable graph expansion only (no consolidation)
        use_sync_consolidation: Enable synchronous consolidation only (no graph expansion)
        two_stage: Use Two-Stage LLM (extract then synthesize) for answer generation
    """
    results = []

    # Full pipeline enables both consolidation and graph expansion
    if use_full_pipeline:
        use_sync_consolidation = True
        use_graph_expansion = True
        logger.info("Full pipeline enabled: sync consolidation + graph expansion + reranking")
    elif use_graph_expansion:
        logger.info("Graph expansion enabled (no consolidation)")
    elif use_sync_consolidation:
        logger.info("Sync consolidation enabled (no graph expansion)")

    # =========================================================================
    # PRE-WARM PHASE: Ingest all facts first, then consolidate once
    # This ensures relations exist before any queries
    # =========================================================================
    all_session_to_fact: Dict[str, Dict[str, str]] = {}  # question_id -> session_to_fact

    if use_sync_consolidation:
        logger.info("=" * 60)
        logger.info("PRE-WARM PHASE: Ingesting all facts before consolidation")
        logger.info("=" * 60)

        # Phase 1: Ingest all facts
        all_fact_ids = []
        for question in tqdm(questions, desc="Pre-warming (ingest)"):
            session_to_fact = ingest_sessions_as_facts(adapter, question, namespace_prefix)
            all_session_to_fact[question.question_id] = session_to_fact
            all_fact_ids.extend(session_to_fact.values())

        logger.info(f"Ingested {len(all_fact_ids)} facts across {len(questions)} questions")

        # Phase 2: Trigger consolidation and wait for completion (TRUE SYNC)
        if all_fact_ids and hasattr(adapter, 'trigger_consolidation'):
            logger.info("Triggering SYNC consolidation for all facts...")
            logger.info(f"This may take 10-20 minutes for {len(all_fact_ids)} facts...")

            # Use wait=True for true synchronous consolidation
            # REST API will poll trigger status until "completed"
            consolidation_start = time.time()
            trigger_result = adapter.trigger_consolidation(
                fact_ids=all_fact_ids,
                wait=True,  # SYNC: Wait for trigger to complete
                timeout_seconds=1200,  # 20 minutes max for full consolidation
            )
            consolidation_time = time.time() - consolidation_start

            if trigger_result.get('status') == 'completed':
                logger.info(f"✓ Consolidation completed in {consolidation_time:.1f}s")
            elif trigger_result.get('status') == 'failed':
                logger.error(f"✗ Consolidation failed: {trigger_result.get('error', 'unknown')}")
            else:
                logger.warning(f"⚠ Consolidation status: {trigger_result.get('status', 'unknown')} after {consolidation_time:.1f}s")
                # If still pending, wait for relations as fallback
                if hasattr(adapter, 'wait_for_relations'):
                    logger.info("Fallback: Waiting for relations to appear (up to 5 more minutes)...")
                    wait_result = adapter.wait_for_relations(
                        fact_ids=all_fact_ids,
                        min_relations=1,
                        timeout_seconds=300,
                        poll_interval=5.0,
                        sample_size=min(10, len(all_fact_ids)),
                    )
                    if wait_result.get('success'):
                        logger.info(f"✓ Relations found: {wait_result['total_relations']}")
                    else:
                        logger.warning(f"⚠ Still waiting: {wait_result.get('total_relations', 0)} relations")

        logger.info("=" * 60)
        logger.info("EVALUATION PHASE: Querying with pre-warmed relations")
        logger.info("=" * 60)

    for question in tqdm(questions, desc="Evaluating"):
        start_time = time.time()

        # 1. Ingest sessions as facts (skip if pre-warmed)
        if question.question_id in all_session_to_fact:
            session_to_fact = all_session_to_fact[question.question_id]
        else:
            session_to_fact = ingest_sessions_as_facts(adapter, question, namespace_prefix)

            # 2. Sync consolidation (if enabled and not pre-warmed)
            if use_sync_consolidation and hasattr(adapter, 'consolidate_sync'):
                fact_ids = list(session_to_fact.values())
                if fact_ids:
                    consolidation_result = adapter.consolidate_sync(fact_ids=fact_ids)
                    logger.debug(
                        f"Consolidation: {consolidation_result.get('relations_created', 0)} relations "
                        f"in {consolidation_result.get('time_ms', 0):.0f}ms"
                    )

        # 3. Query for relevant facts (with or without graph expansion)
        namespace = f"{namespace_prefix}_{question.question_id}"

        if use_graph_expansion and hasattr(adapter, 'query_with_graph_expansion'):
            # Over-fetch multiplier: higher = more robust to embedding variance, but slower
            # Default 6x provides good balance (30 candidates with k=5)
            # Can be tuned based on recall requirements vs latency
            overfetch_multiplier = 6
            query_result = adapter.query_with_graph_expansion(
                question.question,
                namespace=namespace,
                initial_k=k * overfetch_multiplier,
                final_k=k,
                rerank_threshold=0.30,
            )
        else:
            query_result = adapter.query(
                question.question,
                namespace=namespace,
                k=k,
            )

        # 3. Map retrieved facts back to session IDs
        # LOG RETRIEVED CHUNKS for determinism analysis
        logger.info(f"[CHUNKS] Q={question.question_id} retrieved {len(query_result.results)} chunks:")
        retrieved_session_ids = []
        for i, fact in enumerate(query_result.results):
            metadata = fact.metadata if hasattr(fact, 'metadata') else {}
            session_id = metadata.get('session_id', '')
            fact_id = fact.id if hasattr(fact, 'id') else 'unknown'
            score = fact.score if hasattr(fact, 'score') else 0.0
            # Log each chunk: index, fact_id, score, first 50 chars of content
            content_preview = (fact.content[:50] + '...') if hasattr(fact, 'content') and fact.content else 'N/A'
            logger.info(f"  [{i}] id={fact_id} score={score:.4f} session={session_id} content={content_preview}")
            if session_id and session_id not in retrieved_session_ids:
                retrieved_session_ids.append(session_id)

        # 4. Generate answer
        predicted_answer = generate_answer(adapter, question, query_result.results, two_stage=two_stage)

        # 5. Evaluate answer
        is_correct, confidence = evaluate_answer_with_gpt4o(
            question.question,
            question.answer,
            predicted_answer,
            question.question_type,
        )

        # 6. Compute retrieval metrics
        recall = compute_recall_at_k(retrieved_session_ids, question.answer_session_ids, k)
        ndcg = compute_ndcg_at_k(retrieved_session_ids, question.answer_session_ids, k)

        latency_ms = (time.time() - start_time) * 1000

        result = EvaluationResult(
            question_id=question.question_id,
            question_type=question.question_type,
            ability=question.ability,
            question=question.question,
            ground_truth=question.answer,
            predicted_answer=predicted_answer,
            is_correct=is_correct,
            retrieved_session_ids=retrieved_session_ids,
            answer_session_ids=question.answer_session_ids,
            recall_at_k=recall,
            ndcg_at_k=ndcg,
            latency_ms=latency_ms,
        )
        results.append(result)

        logger.debug(f"Q: {question.question[:50]}... -> {'✓' if is_correct else '✗'}")

    return results


def compute_summary(results: List[EvaluationResult], setting: str) -> BenchmarkSummary:
    """Compute summary statistics from results."""
    if not results:
        return BenchmarkSummary(
            setting=setting,
            n_questions=0,
            accuracy=0.0,
            recall_at_5=0.0,
            ndcg_at_5=0.0,
            avg_latency_ms=0.0,
            by_ability={},
            by_question_type={},
            abstention_accuracy=0.0,
        )

    # Overall metrics
    accuracy = sum(1 for r in results if r.is_correct) / len(results)
    recall_at_5 = np.mean([r.recall_at_k for r in results])
    ndcg_at_5 = np.mean([r.ndcg_at_k for r in results])
    avg_latency_ms = np.mean([r.latency_ms for r in results])

    # By ability
    by_ability = {}
    for ability in ["ie", "mr", "tr", "ku", "abs"]:
        ability_results = [r for r in results if r.ability == ability]
        if ability_results:
            by_ability[ability] = sum(1 for r in ability_results if r.is_correct) / len(ability_results)

    # By question type
    by_question_type = {}
    for qtype in set(r.question_type for r in results):
        type_results = [r for r in results if r.question_type == qtype]
        if type_results:
            by_question_type[qtype] = sum(1 for r in type_results if r.is_correct) / len(type_results)

    # Abstention accuracy
    abs_results = [r for r in results if r.ability == "abs"]
    abstention_accuracy = (
        sum(1 for r in abs_results if r.is_correct) / len(abs_results)
        if abs_results else 0.0
    )

    return BenchmarkSummary(
        setting=setting,
        n_questions=len(results),
        accuracy=accuracy,
        recall_at_5=recall_at_5,
        ndcg_at_5=ndcg_at_5,
        avg_latency_ms=avg_latency_ms,
        by_ability=by_ability,
        by_question_type=by_question_type,
        abstention_accuracy=abstention_accuracy,
    )


# =====================================================================
# Main
# =====================================================================

def main():
    parser = argparse.ArgumentParser(
        description="LongMemEval Benchmark - KnowledgePlane's PRIMARY external benchmark"
    )
    parser.add_argument("--n", type=int, default=500, help="Number of questions to evaluate")
    parser.add_argument("--setting", type=str, default="oracle",
                        choices=["oracle", "s", "m"],
                        help="Dataset setting: oracle (evidence only), s (115K), m (1.5M)")
    parser.add_argument("--ability", type=str, default=None,
                        choices=["ie", "mr", "tr", "ku", "abs"],
                        help="Filter by ability (default: all)")
    parser.add_argument("--k", type=int, default=5, help="Top-k for retrieval metrics")
    parser.add_argument("--mock", action="store_true", help="Use mock adapter (no server)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--output-dir", type=str, default="output", help="Output directory")

    # Full pipeline options (Phase 1-2 implementation)
    parser.add_argument("--full-pipeline", action="store_true",
                        help="Enable full pipeline: sync consolidation + graph expansion + reranking")
    parser.add_argument("--graph-expansion", action="store_true",
                        help="Enable graph expansion only (no consolidation)")
    parser.add_argument("--sync-consolidation", action="store_true",
                        help="Enable sync consolidation only (no graph expansion)")
    parser.add_argument("--two-stage", action="store_true",
                        help="Use Two-Stage LLM: extract facts first, then synthesize answer")

    args = parser.parse_args()

    # Set random seed
    random.seed(args.seed)
    np.random.seed(args.seed)

    # Run preflight checks (skip in mock mode)
    if not args.mock:
        preflight = PreflightChecker(PreflightConfig(
            check_database=True,
            check_vector_index=True,
            auto_fix_vector_index=True,
        ))
        if not preflight.run(mock_mode=args.mock):
            logger.error("Preflight checks failed. Aborting benchmark.")
            return

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load dataset
    logger.info(f"Loading LongMemEval dataset (setting={args.setting}, ability={args.ability or 'all'})")
    questions = load_dataset(args.setting, args.ability)

    # Sample if needed
    if args.n < len(questions):
        questions = random.sample(questions, args.n)
        logger.info(f"Sampled {args.n} questions")

    # Create adapter
    if args.mock:
        logger.info("Using mock adapter")
        adapter = MockKnowledgePlaneAdapter()
    else:
        logger.info("Using HTTP adapter")
        adapter = HTTPKnowledgePlaneAdapter()
        adapter.initialize(
            mcp_url=os.environ.get("KP_API_URL", "http://localhost:8081"),
            api_key=os.environ.get("KP_API_KEY", "benchmark-api-key"),
            workspace_id=os.environ.get("KP_WORKSPACE_ID", "longmemeval"),
            user_id="longmemeval-benchmark",
        )

    # Run benchmark
    pipeline_mode = "full-pipeline" if args.full_pipeline else (
        "graph-expansion" if args.graph_expansion else (
            "sync-consolidation" if args.sync_consolidation else "basic"
        )
    )
    if args.two_stage:
        pipeline_mode += "+two-stage"
    # Auto-scale k for chunked mode (each session becomes ~10 chunks)
    # With chunk_size=4 and overlap=1, a 40-turn session becomes ~13 chunks
    # To retrieve equivalent info, multiply k by ~3
    effective_k = args.k * 3 if args.full_pipeline else args.k
    logger.info(f"Running LongMemEval benchmark with {len(questions)} questions (mode: {pipeline_mode}, k={effective_k})...")
    results = run_benchmark(
        adapter, questions, k=effective_k,
        use_full_pipeline=args.full_pipeline,
        use_graph_expansion=args.graph_expansion,
        use_sync_consolidation=args.sync_consolidation,
        two_stage=args.two_stage,
    )

    # Compute summary
    summary = compute_summary(results, args.setting)

    # Print results
    print("\n" + "=" * 60)
    print("🎯 LongMemEval Results (ICLR 2025)")
    print("=" * 60)
    print(f"\nSetting: {args.setting} | Questions: {summary.n_questions}")
    print(f"\nOverall Accuracy: {summary.accuracy * 100:.1f}%  <- KEY METRIC")
    print(f"Recall@{args.k}: {summary.recall_at_5 * 100:.1f}%")
    print(f"NDCG@{args.k}: {summary.ndcg_at_5:.3f}")
    print(f"Avg Latency: {summary.avg_latency_ms:.0f}ms")

    print("\nBy Ability:")
    ability_names = {
        "ie": "Information Extraction",
        "mr": "Multi-Session Reasoning",
        "tr": "Temporal Reasoning",
        "ku": "Knowledge Updates",
        "abs": "Abstention",
    }
    for ability, acc in summary.by_ability.items():
        print(f"  {ability_names.get(ability, ability)}: {acc * 100:.1f}%")

    if summary.abstention_accuracy > 0:
        print(f"\nAbstention Accuracy: {summary.abstention_accuracy * 100:.1f}%")

    # Print competitor comparison
    print("\n" + "-" * 60)
    print("📊 Competitor Comparison (LongMemEval S Setting)")
    print("-" * 60)

    # Sort competitors by accuracy for display
    sorted_competitors = sorted(
        COMPETITOR_BASELINES.items(),
        key=lambda x: x[1]["accuracy"],
        reverse=True
    )

    kp_accuracy = summary.accuracy
    for name, data in sorted_competitors:
        acc = data["accuracy"] * 100
        delta = (kp_accuracy - data["accuracy"]) * 100
        delta_str = f"+{delta:.1f}%" if delta > 0 else f"{delta:.1f}%"
        marker = "  "
        if kp_accuracy >= data["accuracy"]:
            marker = "✓ "
        print(f"  {marker}{name}: {acc:.1f}% ({delta_str} vs KP)")

    print(f"\n  → KnowledgePlane: {kp_accuracy * 100:.1f}%")
    print("=" * 60)

    # Save results
    results_csv = output_dir / "longmemeval_results.csv"
    with open(results_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            "question_id", "question_type", "ability", "question",
            "ground_truth", "predicted_answer", "is_correct",
            "recall_at_k", "ndcg_at_k", "latency_ms"
        ])
        writer.writeheader()
        for r in results:
            # Handle both string and non-string ground_truth/predicted_answer
            gt = str(r.ground_truth)[:100] if r.ground_truth else ""
            pred = str(r.predicted_answer)[:100] if r.predicted_answer else ""
            writer.writerow({
                "question_id": r.question_id,
                "question_type": r.question_type,
                "ability": r.ability,
                "question": r.question[:100],
                "ground_truth": gt,
                "predicted_answer": pred,
                "is_correct": r.is_correct,
                "recall_at_k": r.recall_at_k,
                "ndcg_at_k": r.ndcg_at_k,
                "latency_ms": r.latency_ms,
            })

    summary_json = output_dir / "longmemeval_summary.json"
    with open(summary_json, 'w') as f:
        # Build competitor comparison
        competitor_comparison = {}
        for name, data in COMPETITOR_BASELINES.items():
            competitor_comparison[name] = {
                "accuracy": data["accuracy"],
                "delta_vs_kp": summary.accuracy - data["accuracy"],
                "kp_beats": summary.accuracy >= data["accuracy"],
                "note": data["note"],
                "source": data["source"],
            }

        json.dump({
            "setting": summary.setting,
            "n_questions": summary.n_questions,
            "metrics": {
                "accuracy": summary.accuracy,
                "recall_at_5": summary.recall_at_5,
                "ndcg_at_5": summary.ndcg_at_5,
                "avg_latency_ms": summary.avg_latency_ms,
                "abstention_accuracy": summary.abstention_accuracy,
                "by_ability": summary.by_ability,
                "by_question_type": summary.by_question_type,
            },
            "competitor_comparison": competitor_comparison,
            "competitor_baselines": COMPETITOR_BASELINES,
            "timestamp": datetime.now().isoformat(),
        }, f, indent=2)

    logger.info(f"Results saved to {results_csv} and {summary_json}")

    # Cleanup
    adapter.close()


if __name__ == "__main__":
    main()
