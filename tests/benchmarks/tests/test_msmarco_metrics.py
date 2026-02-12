#!/usr/bin/env python3
"""
Unit tests for MS MARCO ranking metrics.

Tests the correctness of MRR, Recall@k, and NDCG@k implementations.
"""

import unittest
from typing import List, Dict, Set

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from bench_msmarco import compute_mrr, compute_recall_at_k, compute_ndcg_at_k


class TestMRR(unittest.TestCase):
    """Test Mean Reciprocal Rank computation."""

    def test_first_relevant(self):
        """Test MRR when first result is relevant."""
        ranked = ["p1", "p2", "p3"]
        relevant = {"p1"}
        mrr = compute_mrr(ranked, relevant)
        self.assertAlmostEqual(mrr, 1.0)

    def test_second_relevant(self):
        """Test MRR when second result is relevant."""
        ranked = ["p1", "p2", "p3"]
        relevant = {"p2"}
        mrr = compute_mrr(ranked, relevant)
        self.assertAlmostEqual(mrr, 0.5)

    def test_third_relevant(self):
        """Test MRR when third result is relevant."""
        ranked = ["p1", "p2", "p3"]
        relevant = {"p3"}
        mrr = compute_mrr(ranked, relevant)
        self.assertAlmostEqual(mrr, 1/3)

    def test_tenth_relevant(self):
        """Test MRR when tenth result is relevant."""
        ranked = [f"p{i}" for i in range(1, 11)]
        relevant = {"p10"}
        mrr = compute_mrr(ranked, relevant)
        self.assertAlmostEqual(mrr, 0.1)

    def test_no_relevant(self):
        """Test MRR when no relevant results."""
        ranked = ["p1", "p2", "p3"]
        relevant = {"p99"}
        mrr = compute_mrr(ranked, relevant)
        self.assertAlmostEqual(mrr, 0.0)

    def test_multiple_relevant_first_counts(self):
        """Test MRR with multiple relevant (only first counts)."""
        ranked = ["p1", "p2", "p3", "p4"]
        relevant = {"p2", "p4"}
        mrr = compute_mrr(ranked, relevant)
        # First relevant is p2 at rank 2
        self.assertAlmostEqual(mrr, 0.5)

    def test_empty_ranking(self):
        """Test MRR with empty ranking."""
        ranked = []
        relevant = {"p1"}
        mrr = compute_mrr(ranked, relevant)
        self.assertAlmostEqual(mrr, 0.0)

    def test_empty_relevant(self):
        """Test MRR with empty relevant set."""
        ranked = ["p1", "p2", "p3"]
        relevant = set()
        mrr = compute_mrr(ranked, relevant)
        self.assertAlmostEqual(mrr, 0.0)


class TestRecallAtK(unittest.TestCase):
    """Test Recall@k computation."""

    def test_all_relevant_found(self):
        """Test Recall@k when all relevant found in top k."""
        ranked = ["p1", "p2", "p3", "p4", "p5"]
        relevant = {"p2", "p4"}
        recall = compute_recall_at_k(ranked, relevant, k=5)
        self.assertAlmostEqual(recall, 1.0)

    def test_half_relevant_found(self):
        """Test Recall@k when half relevant found."""
        ranked = ["p1", "p2", "p3", "p4", "p5"]
        relevant = {"p2", "p4", "p6", "p8"}
        recall = compute_recall_at_k(ranked, relevant, k=5)
        self.assertAlmostEqual(recall, 0.5)

    def test_no_relevant_found(self):
        """Test Recall@k when no relevant found."""
        ranked = ["p1", "p2", "p3"]
        relevant = {"p4", "p5"}
        recall = compute_recall_at_k(ranked, relevant, k=3)
        self.assertAlmostEqual(recall, 0.0)

    def test_k_smaller_than_ranking(self):
        """Test Recall@k when k < len(ranked)."""
        ranked = ["p1", "p2", "p3", "p4", "p5"]
        relevant = {"p1", "p5"}
        recall = compute_recall_at_k(ranked, relevant, k=3)
        # Only p1 in top 3
        self.assertAlmostEqual(recall, 0.5)

    def test_k_larger_than_ranking(self):
        """Test Recall@k when k > len(ranked)."""
        ranked = ["p1", "p2", "p3"]
        relevant = {"p2", "p3"}
        recall = compute_recall_at_k(ranked, relevant, k=10)
        # Both found in available 3
        self.assertAlmostEqual(recall, 1.0)

    def test_single_relevant(self):
        """Test Recall@k with single relevant passage."""
        ranked = ["p1", "p2", "p3"]
        relevant = {"p2"}
        recall = compute_recall_at_k(ranked, relevant, k=3)
        self.assertAlmostEqual(recall, 1.0)

    def test_empty_relevant(self):
        """Test Recall@k with empty relevant set."""
        ranked = ["p1", "p2", "p3"]
        relevant = set()
        recall = compute_recall_at_k(ranked, relevant, k=3)
        self.assertAlmostEqual(recall, 0.0)

    def test_k_equals_one(self):
        """Test Recall@1 (precision at 1)."""
        ranked = ["p1", "p2", "p3"]
        relevant = {"p1", "p3"}
        recall = compute_recall_at_k(ranked, relevant, k=1)
        # Only p1 in top 1, which is 1/2 = 0.5
        self.assertAlmostEqual(recall, 0.5)


class TestNDCGAtK(unittest.TestCase):
    """Test Normalized Discounted Cumulative Gain@k computation."""

    def test_perfect_ranking(self):
        """Test NDCG@k with perfect ranking."""
        ranked = ["p1", "p2", "p3", "p4"]
        relevance = {"p1": 1, "p2": 1, "p3": 0, "p4": 0}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=4)
        self.assertAlmostEqual(ndcg, 1.0)

    def test_reverse_ranking(self):
        """Test NDCG@k with worst ranking."""
        ranked = ["p3", "p4", "p1", "p2"]
        relevance = {"p1": 1, "p2": 1, "p3": 0, "p4": 0}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=4)
        # Should be less than 1.0
        self.assertLess(ndcg, 1.0)
        self.assertGreater(ndcg, 0.0)

    def test_single_relevant_first(self):
        """Test NDCG@k with single relevant at rank 1."""
        ranked = ["p1", "p2", "p3"]
        relevance = {"p1": 1, "p2": 0, "p3": 0}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=3)
        self.assertAlmostEqual(ndcg, 1.0)

    def test_single_relevant_last(self):
        """Test NDCG@k with single relevant at last rank."""
        ranked = ["p1", "p2", "p3"]
        relevance = {"p1": 0, "p2": 0, "p3": 1}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=3)
        # Should be less than perfect
        self.assertLess(ndcg, 1.0)
        self.assertGreater(ndcg, 0.0)

    def test_no_relevant(self):
        """Test NDCG@k with no relevant passages."""
        ranked = ["p1", "p2", "p3"]
        relevance = {"p1": 0, "p2": 0, "p3": 0}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=3)
        # All relevance 0 gives DCG=0 and IDCG=0
        self.assertAlmostEqual(ndcg, 0.0)

    def test_k_smaller_than_ranking(self):
        """Test NDCG@k when k < len(ranked)."""
        ranked = ["p1", "p2", "p3", "p4", "p5"]
        relevance = {"p1": 1, "p2": 0, "p3": 1, "p4": 0, "p5": 1}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=3)
        # Only considers first 3
        self.assertGreater(ndcg, 0.0)
        self.assertLessEqual(ndcg, 1.0)

    def test_graded_relevance(self):
        """Test NDCG@k with graded relevance (though MS MARCO uses binary)."""
        ranked = ["p1", "p2", "p3"]
        relevance = {"p1": 2, "p2": 1, "p3": 0}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=3)
        self.assertAlmostEqual(ndcg, 1.0)

    def test_missing_passages_in_relevance(self):
        """Test NDCG@k when some passages not in relevance dict."""
        ranked = ["p1", "p2", "p3"]
        relevance = {"p1": 1}  # p2, p3 not present (assumed 0)
        ndcg = compute_ndcg_at_k(ranked, relevance, k=3)
        self.assertAlmostEqual(ndcg, 1.0)

    def test_empty_ranking(self):
        """Test NDCG@k with empty ranking."""
        ranked = []
        relevance = {"p1": 1}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=3)
        self.assertAlmostEqual(ndcg, 0.0)


class TestMetricsIntegration(unittest.TestCase):
    """Integration tests using realistic scenarios."""

    def test_search_scenario_1(self):
        """Test realistic search scenario: good result at rank 1."""
        ranked = ["doc1", "doc2", "doc3", "doc4", "doc5"]
        relevant = {"doc1", "doc4"}

        mrr = compute_mrr(ranked, relevant)
        recall_5 = compute_recall_at_k(ranked, relevant, k=5)
        relevance = {d: (1 if d in relevant else 0) for d in ranked}
        ndcg_5 = compute_ndcg_at_k(ranked, relevance, k=5)

        # First result is relevant
        self.assertAlmostEqual(mrr, 1.0)
        # Both relevant found in top 5
        self.assertAlmostEqual(recall_5, 1.0)
        # Good but not perfect ranking
        self.assertGreater(ndcg_5, 0.8)

    def test_search_scenario_2(self):
        """Test realistic search scenario: relevant at rank 3."""
        ranked = ["doc1", "doc2", "doc3", "doc4", "doc5"]
        relevant = {"doc3", "doc5"}

        mrr = compute_mrr(ranked, relevant)
        recall_5 = compute_recall_at_k(ranked, relevant, k=5)
        relevance = {d: (1 if d in relevant else 0) for d in ranked}
        ndcg_5 = compute_ndcg_at_k(ranked, relevance, k=5)

        # First relevant at rank 3
        self.assertAlmostEqual(mrr, 1/3, places=4)
        # Both found in top 5
        self.assertAlmostEqual(recall_5, 1.0)
        # Moderate ranking quality
        self.assertGreater(ndcg_5, 0.5)
        self.assertLess(ndcg_5, 0.9)

    def test_search_scenario_3(self):
        """Test realistic search scenario: poor ranking."""
        ranked = ["doc1", "doc2", "doc3", "doc4", "doc5"]
        relevant = {"doc5"}

        mrr = compute_mrr(ranked, relevant)
        recall_3 = compute_recall_at_k(ranked, relevant, k=3)
        recall_5 = compute_recall_at_k(ranked, relevant, k=5)
        relevance = {d: (1 if d in relevant else 0) for d in ranked}
        ndcg_3 = compute_ndcg_at_k(ranked, relevance, k=3)
        ndcg_5 = compute_ndcg_at_k(ranked, relevance, k=5)

        # First relevant at rank 5
        self.assertAlmostEqual(mrr, 0.2)
        # Not found in top 3
        self.assertAlmostEqual(recall_3, 0.0)
        # Found in top 5
        self.assertAlmostEqual(recall_5, 1.0)
        # Low NDCG@3 (relevant not in top 3)
        self.assertAlmostEqual(ndcg_3, 0.0)
        # Higher NDCG@5 (relevant found but ranked low)
        self.assertGreater(ndcg_5, 0.0)
        self.assertLess(ndcg_5, 0.6)

    def test_search_scenario_4(self):
        """Test realistic search scenario: no relevant found."""
        ranked = ["doc1", "doc2", "doc3"]
        relevant = {"doc99"}

        mrr = compute_mrr(ranked, relevant)
        recall_3 = compute_recall_at_k(ranked, relevant, k=3)
        relevance = {d: (1 if d in relevant else 0) for d in ranked}
        ndcg_3 = compute_ndcg_at_k(ranked, relevance, k=3)

        # All zeros
        self.assertAlmostEqual(mrr, 0.0)
        self.assertAlmostEqual(recall_3, 0.0)
        self.assertAlmostEqual(ndcg_3, 0.0)


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and boundary conditions."""

    def test_duplicate_passages_in_ranking(self):
        """Test metrics with duplicate passages (should not happen but handle gracefully)."""
        ranked = ["p1", "p2", "p1", "p3"]
        relevant = {"p1"}

        # MRR should use first occurrence
        mrr = compute_mrr(ranked, relevant)
        self.assertAlmostEqual(mrr, 1.0)

    def test_very_large_k(self):
        """Test metrics with k much larger than ranking."""
        ranked = ["p1", "p2"]
        relevant = {"p1", "p2"}

        recall = compute_recall_at_k(ranked, relevant, k=1000)
        self.assertAlmostEqual(recall, 1.0)

    def test_single_passage(self):
        """Test metrics with single passage."""
        ranked = ["p1"]
        relevant = {"p1"}

        mrr = compute_mrr(ranked, relevant)
        recall = compute_recall_at_k(ranked, relevant, k=1)
        relevance = {"p1": 1}
        ndcg = compute_ndcg_at_k(ranked, relevance, k=1)

        self.assertAlmostEqual(mrr, 1.0)
        self.assertAlmostEqual(recall, 1.0)
        self.assertAlmostEqual(ndcg, 1.0)

    def test_many_relevant(self):
        """Test metrics with many relevant passages."""
        ranked = [f"p{i}" for i in range(1, 11)]
        relevant = {f"p{i}" for i in range(2, 11, 2)}  # Even numbers

        mrr = compute_mrr(ranked, relevant)
        recall_10 = compute_recall_at_k(ranked, relevant, k=10)
        relevance = {p: (1 if p in relevant else 0) for p in ranked}
        ndcg_10 = compute_ndcg_at_k(ranked, relevance, k=10)

        # First relevant at rank 2
        self.assertAlmostEqual(mrr, 0.5)
        # All found
        self.assertAlmostEqual(recall_10, 1.0)
        # Alternating pattern gives moderate NDCG
        self.assertGreater(ndcg_10, 0.5)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestMRR))
    suite.addTests(loader.loadTestsFromTestCase(TestRecallAtK))
    suite.addTests(loader.loadTestsFromTestCase(TestNDCGAtK))
    suite.addTests(loader.loadTestsFromTestCase(TestMetricsIntegration))
    suite.addTests(loader.loadTestsFromTestCase(TestEdgeCases))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    exit(run_tests())
