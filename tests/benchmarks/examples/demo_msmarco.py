#!/usr/bin/env python3
"""
MS MARCO Benchmark Demo

This script demonstrates how to run the MS MARCO passage ranking benchmark
with various configurations and analyze the results.

Usage:
    python demos/demo_msmarco.py
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from bench_msmarco import MSMARCOBenchmark, compute_mrr, compute_recall_at_k, compute_ndcg_at_k


def demo_metrics():
    """Demonstrate the ranking metrics with examples."""
    print("=" * 60)
    print("MS MARCO Ranking Metrics Demo")
    print("=" * 60)

    # Example 1: Perfect ranking
    print("\nExample 1: Perfect Ranking")
    print("-" * 40)
    ranked = ["p1", "p2", "p3", "p4", "p5"]
    relevant = {"p1", "p2"}
    relevance = {p: (1 if p in relevant else 0) for p in ranked}

    print(f"Ranked passages:  {ranked}")
    print(f"Relevant:         {relevant}")
    print(f"MRR:              {compute_mrr(ranked, relevant):.4f}")
    print(f"Recall@5:         {compute_recall_at_k(ranked, relevant, 5):.4f}")
    print(f"NDCG@5:           {compute_ndcg_at_k(ranked, relevance, 5):.4f}")

    # Example 2: Moderate ranking
    print("\nExample 2: Moderate Ranking")
    print("-" * 40)
    ranked = ["p1", "p2", "p3", "p4", "p5"]
    relevant = {"p2", "p5"}
    relevance = {p: (1 if p in relevant else 0) for p in ranked}

    print(f"Ranked passages:  {ranked}")
    print(f"Relevant:         {relevant}")
    print(f"MRR:              {compute_mrr(ranked, relevant):.4f}")
    print(f"Recall@5:         {compute_recall_at_k(ranked, relevant, 5):.4f}")
    print(f"NDCG@5:           {compute_ndcg_at_k(ranked, relevance, 5):.4f}")

    # Example 3: Poor ranking
    print("\nExample 3: Poor Ranking")
    print("-" * 40)
    ranked = ["p1", "p2", "p3", "p4", "p5"]
    relevant = {"p5"}
    relevance = {p: (1 if p in relevant else 0) for p in ranked}

    print(f"Ranked passages:  {ranked}")
    print(f"Relevant:         {relevant}")
    print(f"MRR:              {compute_mrr(ranked, relevant):.4f}")
    print(f"Recall@3:         {compute_recall_at_k(ranked, relevant, 3):.4f}")
    print(f"Recall@5:         {compute_recall_at_k(ranked, relevant, 5):.4f}")
    print(f"NDCG@5:           {compute_ndcg_at_k(ranked, relevance, 5):.4f}")

    # Example 4: No relevant found
    print("\nExample 4: No Relevant Found")
    print("-" * 40)
    ranked = ["p1", "p2", "p3"]
    relevant = {"p99"}
    relevance = {p: (1 if p in relevant else 0) for p in ranked}

    print(f"Ranked passages:  {ranked}")
    print(f"Relevant:         {relevant}")
    print(f"MRR:              {compute_mrr(ranked, relevant):.4f}")
    print(f"Recall@3:         {compute_recall_at_k(ranked, relevant, 3):.4f}")
    print(f"NDCG@3:           {compute_ndcg_at_k(ranked, relevance, 3):.4f}")


def demo_small_benchmark():
    """Run a small benchmark with mock KP."""
    print("\n" + "=" * 60)
    print("Small MS MARCO Benchmark Demo (Mock KP)")
    print("=" * 60)

    # Create benchmark with minimal config
    benchmark = MSMARCOBenchmark(
        n_queries=5,
        k=5,
        seed=42,
        run_kp=True,
        run_vector=True,
        mock_kp=True,
        output_dir="output/demo"
    )

    print("\nRunning benchmark with 5 queries...")
    print("This may take a few minutes to download the dataset on first run.")

    try:
        summary = benchmark.run_benchmark()
        benchmark.print_summary(summary)

        print("\nResults saved to:")
        print(f"  - output/demo/msmarco_results.csv")
        print(f"  - output/demo/msmarco_summary.json")

    except Exception as e:
        print(f"\nBenchmark failed: {e}")
        print("Note: Dataset download may fail on some networks.")
        print("Try: python -c \"from datasets import load_dataset; load_dataset('ms_marco', 'v2.1', split='validation')\"")


def demo_metric_sensitivity():
    """Demonstrate how metrics respond to ranking changes."""
    print("\n" + "=" * 60)
    print("Metric Sensitivity Analysis")
    print("=" * 60)

    base_relevant = {"p2", "p5", "p8"}
    print(f"\nRelevant passages: {base_relevant}")
    print("\nComparing different rankings:\n")

    rankings = {
        "Perfect": ["p2", "p5", "p8", "p1", "p3", "p4", "p6", "p7", "p9", "p10"],
        "Good": ["p2", "p1", "p5", "p3", "p8", "p4", "p6", "p7", "p9", "p10"],
        "Moderate": ["p1", "p2", "p3", "p5", "p4", "p6", "p8", "p7", "p9", "p10"],
        "Poor": ["p1", "p3", "p4", "p6", "p7", "p2", "p9", "p5", "p10", "p8"],
        "Worst": ["p1", "p3", "p4", "p6", "p7", "p9", "p10", "p2", "p5", "p8"]
    }

    print(f"{'Ranking':<12} {'MRR':<8} {'R@5':<8} {'R@10':<8} {'NDCG@10':<10}")
    print("-" * 50)

    for name, ranked in rankings.items():
        relevance = {p: (1 if p in base_relevant else 0) for p in ranked}

        mrr = compute_mrr(ranked, base_relevant)
        recall_5 = compute_recall_at_k(ranked, base_relevant, 5)
        recall_10 = compute_recall_at_k(ranked, base_relevant, 10)
        ndcg_10 = compute_ndcg_at_k(ranked, relevance, 10)

        print(f"{name:<12} {mrr:<8.4f} {recall_5:<8.4f} {recall_10:<8.4f} {ndcg_10:<10.4f}")

    print("\nObservations:")
    print("  - MRR is most sensitive to position of first relevant passage")
    print("  - Recall@k measures coverage regardless of order")
    print("  - NDCG@k balances both coverage and ranking quality")


def demo_comparison_with_hotpotqa():
    """Compare MS MARCO and HotpotQA metrics."""
    print("\n" + "=" * 60)
    print("MS MARCO vs HotpotQA Metrics Comparison")
    print("=" * 60)

    print("\n┌─────────────────────────────────────────────────────────┐")
    print("│ MS MARCO (Passage Ranking)                              │")
    print("├─────────────────────────────────────────────────────────┤")
    print("│ Task:        Single-hop passage retrieval               │")
    print("│ Goal:        Rank passages by relevance                 │")
    print("│ Metrics:     MRR, Recall@k, NDCG@k                      │")
    print("│ Evaluation:  Ranking quality                            │")
    print("│ Use case:    Search engines, IR systems                 │")
    print("└─────────────────────────────────────────────────────────┘")

    print("\n┌─────────────────────────────────────────────────────────┐")
    print("│ HotpotQA (Multi-Hop Reasoning)                          │")
    print("├─────────────────────────────────────────────────────────┤")
    print("│ Task:        Multi-hop question answering               │")
    print("│ Goal:        Extract exact answer from documents        │")
    print("│ Metrics:     EM (Exact Match), F1 Score                 │")
    print("│ Evaluation:  Answer accuracy                            │")
    print("│ Use case:    Complex QA, reasoning systems              │")
    print("└─────────────────────────────────────────────────────────┘")

    print("\nWhen to use each:")
    print("  • MS MARCO:  Test retrieval quality, ranking algorithms")
    print("  • HotpotQA:  Test reasoning, graph traversal, complex QA")

    print("\nKnowledgePlane advantages:")
    print("  • MS MARCO:  Semantic understanding, relation-aware ranking")
    print("  • HotpotQA:  Graph traversal, multi-hop path finding")


def main():
    """Run all demos."""
    demos = [
        ("Metrics Demo", demo_metrics),
        ("Metric Sensitivity", demo_metric_sensitivity),
        ("MS MARCO vs HotpotQA", demo_comparison_with_hotpotqa),
        ("Small Benchmark", demo_small_benchmark),
    ]

    print("\nMS MARCO Benchmark Demo")
    print("=" * 60)
    print("\nAvailable demos:")
    for i, (name, _) in enumerate(demos, 1):
        print(f"  {i}. {name}")
    print(f"  {len(demos) + 1}. Run all demos")
    print("  0. Exit")

    try:
        choice = input("\nSelect demo (0-{}): ".format(len(demos) + 1))
        choice = int(choice)

        if choice == 0:
            print("Exiting...")
            return 0
        elif choice == len(demos) + 1:
            # Run all demos
            for name, demo_func in demos:
                print("\n" + "=" * 60)
                print(f"Running: {name}")
                print("=" * 60)
                demo_func()
        elif 1 <= choice <= len(demos):
            # Run selected demo
            name, demo_func = demos[choice - 1]
            print("\n" + "=" * 60)
            print(f"Running: {name}")
            print("=" * 60)
            demo_func()
        else:
            print("Invalid choice.")
            return 1

        print("\n" + "=" * 60)
        print("Demo complete!")
        print("=" * 60)
        return 0

    except (ValueError, KeyboardInterrupt):
        print("\nExiting...")
        return 0


if __name__ == "__main__":
    exit(main())
