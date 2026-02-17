#!/usr/bin/env python3
"""
Example usage of the HotpotQA benchmark.

This script demonstrates how to use the benchmark programmatically
and customize evaluation for specific use cases.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))


import json
from pathlib import Path
from bench_hotpotqa import (
    HotpotQABenchmark,
    compute_exact_match,
    compute_f1,
    normalize_answer
)


def example_basic_run():
    """Example 1: Basic benchmark run."""
    print("=" * 60)
    print("Example 1: Basic Benchmark Run")
    print("=" * 60)
    print()

    # Create benchmark with minimal settings
    benchmark = HotpotQABenchmark(
        n_questions=5,  # Small sample for demo
        top_k=3,
        seed=42,
        run_kp=False,  # Skip KP for this demo
        run_vector=True,
        mock_kp=True,
        output_dir="output/example1"
    )

    # Run benchmark
    print("Running benchmark (vector baseline only)...")
    summary = benchmark.run_benchmark()

    # Print results
    benchmark.print_summary(summary)
    print()


def example_custom_evaluation():
    """Example 2: Custom evaluation with filtering."""
    print("=" * 60)
    print("Example 2: Custom Evaluation with Filtering")
    print("=" * 60)
    print()

    # Create benchmark but don't run yet
    benchmark = HotpotQABenchmark(
        n_questions=20,
        top_k=5,
        seed=42,
        run_kp=True,
        run_vector=True,
        mock_kp=True,
        output_dir="output/example2"
    )

    # Load dataset
    questions = benchmark.load_dataset()

    # Filter by type
    bridge_questions = [q for q in questions if q['type'] == 'bridge']
    comparison_questions = [q for q in questions if q['type'] == 'comparison']

    print(f"Total questions: {len(questions)}")
    print(f"Bridge questions: {len(bridge_questions)}")
    print(f"Comparison questions: {len(comparison_questions)}")
    print()

    # You could run benchmark on filtered questions by modifying the benchmark object
    print("(Skipping full run in example)")
    print()


def example_manual_scoring():
    """Example 3: Manual scoring with custom predictions."""
    print("=" * 60)
    print("Example 3: Manual Scoring")
    print("=" * 60)
    print()

    # Sample predictions and ground truths
    test_cases = [
        {
            'question': 'Who directed The Matrix?',
            'ground_truth': 'The Wachowskis',
            'kp_prediction': 'Wachowskis',
            'vector_prediction': 'The Wachowski Brothers'
        },
        {
            'question': 'What is the capital of France?',
            'ground_truth': 'Paris',
            'kp_prediction': 'Paris',
            'vector_prediction': 'The capital is Paris'
        },
        {
            'question': 'When was the Eiffel Tower built?',
            'ground_truth': '1889',
            'kp_prediction': '1889',
            'vector_prediction': 'between 1887 and 1889'
        }
    ]

    print(f"{'Question':<40} {'System':<10} {'EM':>8} {'F1':>8}")
    print("-" * 70)

    for case in test_cases:
        gt = case['ground_truth']

        # Score KP
        kp_pred = case['kp_prediction']
        kp_em = compute_exact_match(kp_pred, gt)
        kp_f1 = compute_f1(kp_pred, gt)
        print(f"{case['question'][:38]:<40} {'KP':<10} {kp_em:>8.2f} {kp_f1:>8.2f}")

        # Score Vector
        vec_pred = case['vector_prediction']
        vec_em = compute_exact_match(vec_pred, gt)
        vec_f1 = compute_f1(vec_pred, gt)
        print(f"{'':<40} {'Vector':<10} {vec_em:>8.2f} {vec_f1:>8.2f}")
        print()

    print()


def example_result_analysis():
    """Example 4: Analyzing saved results."""
    print("=" * 60)
    print("Example 4: Result Analysis")
    print("=" * 60)
    print()

    # Check if results exist
    results_path = Path("output/hotpotqa_results.csv")
    summary_path = Path("output/hotpotqa_summary.json")

    if not summary_path.exists():
        print("No results found. Run benchmark first:")
        print("  python bench_hotpotqa.py --n 20 --mock_kp")
        print()
        return

    # Load summary
    with open(summary_path) as f:
        summary = json.load(f)

    print("Summary Statistics:")
    print(json.dumps(summary, indent=2))
    print()

    # Load detailed results
    if results_path.exists():
        import csv
        with open(results_path) as f:
            reader = csv.DictReader(f)
            results = list(reader)

        print(f"Loaded {len(results)} question results")

        # Find best and worst
        if results and 'kp_f1' in results[0] and results[0]['kp_f1']:
            kp_results = [r for r in results if r['kp_f1']]
            if kp_results:
                best = max(kp_results, key=lambda r: float(r['kp_f1']))
                worst = min(kp_results, key=lambda r: float(r['kp_f1']))

                print("\nBest KP result:")
                print(f"  Q: {best['question'][:60]}...")
                print(f"  A: {best['kp_answer'][:60]}")
                print(f"  GT: {best['ground_truth']}")
                print(f"  F1: {best['kp_f1']}")

                print("\nWorst KP result:")
                print(f"  Q: {worst['question'][:60]}...")
                print(f"  A: {worst['kp_answer'][:60]}")
                print(f"  GT: {worst['ground_truth']}")
                print(f"  F1: {worst['kp_f1']}")

    print()


def example_normalization():
    """Example 5: Understanding normalization."""
    print("=" * 60)
    print("Example 5: Answer Normalization")
    print("=" * 60)
    print()

    test_strings = [
        "The Eiffel Tower",
        "A quick brown fox",
        "Paris, France!",
        "THE ANSWER IS 42",
        "   Extra   spaces   ",
    ]

    print(f"{'Original':<30} {'Normalized':<30}")
    print("-" * 60)
    for s in test_strings:
        normalized = normalize_answer(s)
        print(f"{s:<30} {normalized:<30}")

    print()


def main():
    """Run all examples."""
    print("\n")
    print("=" * 60)
    print("HotpotQA Benchmark Examples")
    print("=" * 60)
    print()

    examples = [
        ("Basic Run", example_basic_run),
        ("Custom Evaluation", example_custom_evaluation),
        ("Manual Scoring", example_manual_scoring),
        ("Result Analysis", example_result_analysis),
        ("Normalization", example_normalization),
    ]

    print("Available examples:")
    for i, (name, _) in enumerate(examples, 1):
        print(f"  {i}. {name}")
    print()

    # Run select examples (skip heavy ones for demo)
    # example_basic_run()  # Uncomment to run full benchmark
    example_custom_evaluation()
    example_manual_scoring()
    example_result_analysis()
    example_normalization()

    print("=" * 60)
    print("Examples complete!")
    print("=" * 60)
    print()

    print("To run the full benchmark:")
    print("  python bench_hotpotqa.py --n 20 --mock_kp")
    print()


if __name__ == "__main__":
    main()
