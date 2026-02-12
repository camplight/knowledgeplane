#!/usr/bin/env python3
"""
Demo script for Vector Baseline system.

This script demonstrates how to use the VectorBaseline class for:
1. Ingesting documents
2. Querying with different parameters
3. Comparing extractive vs generative modes (if API keys available)
4. Benchmarking performance

Usage:
    python demo_vector_baseline.py [--mode extractive|generative] [--k 5]

Examples:
    # Basic demo with extractive mode (no API cost)
    python demo_vector_baseline.py

    # Use generative mode (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
    python demo_vector_baseline.py --mode generative

    # Retrieve more chunks
    python demo_vector_baseline.py --k 10
"""

import argparse
import time
import sys
from typing import List
from vector_baseline import VectorBaseline, Document


def create_sample_corpus() -> List[Document]:
    """
    Create a sample document corpus for demonstration.

    This corpus includes:
    - Geographic information (capitals, populations)
    - Historical facts (events, dates)
    - Cultural information (landmarks, traditions)
    """
    return [
        Document(
            id="paris",
            text="""
            Paris is the capital and most populous city of France. With an official
            estimated population of 2,102,650 residents as of 1 January 2023, Paris
            is the fourth-largest city in the European Union. The City of Paris is
            the centre of the Île-de-France region. Paris is known for its museums
            and architectural landmarks, particularly the Eiffel Tower, Notre-Dame
            Cathedral, and the Louvre Museum.
            """,
            metadata={"title": "Paris", "category": "geography"}
        ),
        Document(
            id="eiffel_tower",
            text="""
            The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars
            in Paris, France. It is named after the engineer Gustave Eiffel, whose
            company designed and built the tower. Constructed from 1887 to 1889 as
            the centerpiece of the 1889 World's Fair, it was initially criticized by
            some of France's leading artists and intellectuals for its design. The
            tower is 330 metres tall and was the world's tallest man-made structure
            until the Chrysler Building in New York City was completed in 1930.
            """,
            metadata={"title": "Eiffel Tower", "category": "landmarks"}
        ),
        Document(
            id="french_revolution",
            text="""
            The French Revolution was a period of political and societal change in
            France that began with the Estates General of 1789 and ended with the
            formation of the French Consulate in November 1799. The revolution
            overthrew the monarchy, established a republic, catalyzed violent periods
            of political turmoil, and finally culminated in a dictatorship under
            Napoleon Bonaparte. It is considered one of the most important events
            in European history.
            """,
            metadata={"title": "French Revolution", "category": "history"}
        ),
        Document(
            id="london",
            text="""
            London is the capital and largest city of England and the United Kingdom.
            The city's population stands at approximately 9.8 million as of 2023.
            London is a major global city and financial centre. It has been a major
            settlement for two millennia, and was originally called Londinium by the
            Romans. The City of London is the historic core and financial centre,
            while Greater London includes 32 boroughs.
            """,
            metadata={"title": "London", "category": "geography"}
        ),
        Document(
            id="big_ben",
            text="""
            Big Ben is the nickname for the Great Bell of the Great Clock of Westminster,
            and by extension, the nickname for the Elizabeth Tower, located at the north
            end of the Palace of Westminster in London. The tower was completed in 1859
            and designed by Augustus Pugin in a neo-Gothic style. The clock and dials
            were designed by Edmund Beckett Denison. The Great Bell weighs 13.5 tons
            and chimes every hour.
            """,
            metadata={"title": "Big Ben", "category": "landmarks"}
        ),
        Document(
            id="industrial_revolution",
            text="""
            The Industrial Revolution was the transition from creating goods by hand to
            using machines. It started in Britain in the late 18th century and spread
            to continental Europe and the United States in the 19th century. Key
            developments included the steam engine, the spinning jenny, and the power
            loom. The revolution transformed economies that had been based on agriculture
            and handicrafts into economies based on large-scale industry and mechanized
            manufacturing.
            """,
            metadata={"title": "Industrial Revolution", "category": "history"}
        ),
        Document(
            id="berlin",
            text="""
            Berlin is the capital and largest city of Germany. With a population of
            3.7 million people, Berlin is the most populous city proper in the
            European Union. The city is one of Germany's 16 federal states and is
            surrounded by the state of Brandenburg. Berlin is a world city of culture,
            politics, media and science. Following German reunification in 1990, Berlin
            became the capital of the reunified Germany.
            """,
            metadata={"title": "Berlin", "category": "geography"}
        ),
        Document(
            id="brandenburg_gate",
            text="""
            The Brandenburg Gate is an 18th-century neoclassical monument in Berlin.
            It was built on the site of a former city gate that marked the start of
            the road from Berlin to Brandenburg an der Havel. It is located west of
            the city centre at the junction of Unter den Linden and Ebertstraße. The
            gate was commissioned by King Frederick William II of Prussia as a symbol
            of peace. It was built between 1788 and 1791.
            """,
            metadata={"title": "Brandenburg Gate", "category": "landmarks"}
        )
    ]


def run_demo(mode: str = "extractive", k: int = 5):
    """
    Run the vector baseline demo.

    Args:
        mode: Answer generation mode ("extractive" or "generative")
        k: Number of chunks to retrieve per query
    """
    print("=" * 70)
    print("Vector Baseline Demo - Simple RAG System")
    print("=" * 70)
    print()

    # Initialize the baseline
    print("Step 1: Initializing VectorBaseline...")
    print(f"  - Mode: {mode}")
    print(f"  - Retrieval k: {k}")
    print(f"  - Chunk size: 512 tokens")
    print(f"  - Chunk overlap: 50 tokens")
    print()

    baseline = VectorBaseline(
        embedding_model="sentence-transformers/all-MiniLM-L6-v2",
        chunk_size=512,
        chunk_overlap=50
    )

    # Create and ingest documents
    print("Step 2: Creating sample document corpus...")
    docs = create_sample_corpus()
    print(f"  - Created {len(docs)} documents")
    print()

    print("Step 3: Ingesting documents (chunking + embedding + indexing)...")
    start_time = time.time()
    baseline.ingest_documents(docs)
    ingest_time = time.time() - start_time
    print(f"  - Ingestion completed in {ingest_time:.2f}s")
    print()

    # Show corpus statistics
    print("Step 4: Corpus Statistics")
    stats = baseline.get_stats()
    for key, value in stats.items():
        print(f"  - {key}: {value}")
    print()

    # Define test questions
    test_questions = [
        "What is the capital of France?",
        "When was the Eiffel Tower built?",
        "What is the population of London?",
        "Who designed Big Ben?",
        "When did the Industrial Revolution start?",
        "What is the Brandenburg Gate?",
        "How tall is the Eiffel Tower?",
        "What was the French Revolution?"
    ]

    # Run queries
    print("Step 5: Running Queries")
    print("-" * 70)
    print()

    total_query_time = 0
    results = []

    for i, question in enumerate(test_questions, 1):
        print(f"Query {i}/{len(test_questions)}")
        print(f"Q: {question}")

        start_time = time.time()
        try:
            answer = baseline.query(question, k=k, mode=mode)
            query_time = time.time() - start_time
            total_query_time += query_time

            print(f"A: {answer}")
            print(f"   (Retrieved in {query_time:.3f}s)")
            print()

            results.append({
                "question": question,
                "answer": answer,
                "time": query_time
            })

        except Exception as e:
            print(f"ERROR: {e}")
            print()

    # Summary statistics
    print("-" * 70)
    print("Summary Statistics")
    print("-" * 70)
    print(f"Total queries: {len(test_questions)}")
    print(f"Successful queries: {len(results)}")
    print(f"Average query time: {total_query_time / len(results):.3f}s")
    print(f"Total query time: {total_query_time:.3f}s")
    print()

    # Performance notes
    print("Performance Notes:")
    print("  - Embedding generation is done locally (no API calls)")
    print("  - FAISS provides fast cosine similarity search")
    print(f"  - {'Extractive mode has no LLM cost' if mode == 'extractive' else 'Generative mode requires LLM API calls'}")
    print()

    print("=" * 70)
    print("Demo Complete!")
    print("=" * 70)


def main():
    """Main entry point for the demo script."""
    parser = argparse.ArgumentParser(
        description="Demo script for Vector Baseline system",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic demo with extractive mode (no API cost)
  python demo_vector_baseline.py

  # Use generative mode (requires API key)
  python demo_vector_baseline.py --mode generative

  # Retrieve more chunks
  python demo_vector_baseline.py --k 10
        """
    )

    parser.add_argument(
        "--mode",
        choices=["extractive", "generative"],
        default="extractive",
        help="Answer generation mode (default: extractive)"
    )

    parser.add_argument(
        "--k",
        type=int,
        default=5,
        help="Number of chunks to retrieve (default: 5)"
    )

    args = parser.parse_args()

    # Validate k parameter
    if args.k < 1:
        print("Error: k must be >= 1", file=sys.stderr)
        sys.exit(1)

    # Run the demo
    try:
        run_demo(mode=args.mode, k=args.k)
    except KeyboardInterrupt:
        print("\n\nDemo interrupted by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nError running demo: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
