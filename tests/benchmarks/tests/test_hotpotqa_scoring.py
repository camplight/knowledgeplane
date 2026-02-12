#!/usr/bin/env python3
"""
Test script for HotpotQA scoring functions.

Verifies that normalize_answer, compute_exact_match, and compute_f1
work correctly with various inputs.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))


import sys
from bench_hotpotqa import normalize_answer, compute_exact_match, compute_f1


def test_normalize_answer():
    """Test answer normalization."""
    print("Testing normalize_answer...")

    tests = [
        ("The Eiffel Tower", "eiffel tower"),
        ("A quick brown fox", "quick brown fox"),
        ("Paris, France!", "paris france"),
        ("   Multiple   spaces   ", "multiple spaces"),
        ("THE ANSWER", "answer"),
        ("An apple a day", "apple day"),
    ]

    for input_text, expected in tests:
        result = normalize_answer(input_text)
        assert result == expected, f"Expected '{expected}', got '{result}'"
        print(f"  ✓ '{input_text}' -> '{result}'")

    print("  All normalize_answer tests passed!\n")


def test_compute_exact_match():
    """Test exact match scoring."""
    print("Testing compute_exact_match...")

    tests = [
        ("Paris", "Paris", 1.0),
        ("Paris", "paris", 1.0),
        ("The Eiffel Tower", "Eiffel Tower", 1.0),
        ("Paris", "London", 0.0),
        ("The capital is Paris", "Paris", 0.0),
        ("Paris, France", "Paris", 0.0),
        ("42", "42", 1.0),
        ("John Smith", "john smith", 1.0),
    ]

    for pred, truth, expected in tests:
        result = compute_exact_match(pred, truth)
        assert result == expected, f"EM({pred}, {truth}) expected {expected}, got {result}"
        print(f"  ✓ EM('{pred}', '{truth}') = {result}")

    print("  All compute_exact_match tests passed!\n")


def test_compute_f1():
    """Test F1 scoring."""
    print("Testing compute_f1...")

    tests = [
        # Perfect matches
        ("Paris", "Paris", 1.0),
        ("The Eiffel Tower", "Eiffel Tower", 1.0),

        # Partial matches
        ("Paris France", "Paris", 0.6667),  # 1/2 * 1/1 = 0.667 (2*p*r / (p+r) = 2*0.5*1.0/1.5)
        ("Paris", "Paris France", 0.6667),  # 1/1 * 1/2 = 0.667

        # No overlap
        ("Paris", "London", 0.0),

        # Empty cases
        ("", "", 1.0),
        ("Paris", "", 0.0),
        ("", "Paris", 0.0),

        # Complex cases
        ("The capital of France is Paris", "Paris", 0.4),  # 1/5 * 1/1
        ("John Smith directed the movie", "John Smith", 0.5714),  # 2/5 * 2/2
    ]

    for pred, truth, expected in tests:
        result = compute_f1(pred, truth)
        # Allow small floating point differences
        assert abs(result - expected) < 0.01, f"F1({pred}, {truth}) expected {expected}, got {result}"
        print(f"  ✓ F1('{pred}', '{truth}') = {result:.4f}")

    print("  All compute_f1 tests passed!\n")


def test_edge_cases():
    """Test edge cases and special characters."""
    print("Testing edge cases...")

    # Special characters
    assert normalize_answer("Hello, World!") == "hello world"
    print("  ✓ Special characters handled")

    # Multiple articles
    assert normalize_answer("A bird and an egg and the nest") == "bird and egg and nest"
    print("  ✓ Multiple articles removed")

    # Unicode
    assert normalize_answer("Café") == "café"
    print("  ✓ Unicode preserved")

    # Numbers
    assert compute_exact_match("42", "42") == 1.0
    assert compute_f1("The answer is 42", "42") > 0.0
    print("  ✓ Numbers handled")

    # Very long answers
    long_answer = "This is a very long answer " * 100
    assert compute_f1(long_answer, long_answer) == 1.0
    print("  ✓ Long answers handled")

    print("  All edge cases passed!\n")


def main():
    """Run all tests."""
    print("=" * 60)
    print("HotpotQA Scoring Function Tests")
    print("=" * 60)
    print()

    try:
        test_normalize_answer()
        test_compute_exact_match()
        test_compute_f1()
        test_edge_cases()

        print("=" * 60)
        print("All tests passed! ✓")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
