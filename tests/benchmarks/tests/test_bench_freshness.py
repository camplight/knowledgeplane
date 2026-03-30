#!/usr/bin/env python3
"""
Unit tests for bench_freshness.py

Tests the freshness benchmark implementation without requiring
a live KnowledgePlane instance by using the mock adapter.
"""

import sys
from pathlib import Path

# Add src directory to path for imports
src_dir = Path(__file__).parent.parent / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))


import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

from freshness import (
    FreshnessResult,
    PollAttempt,
    TestFact,
    generate_test_fact,
    poll_until_updated,
    save_results,
)
from lib.adapter import MockKnowledgePlaneAdapter


class TestGenerateTestFact(unittest.TestCase):
    """Test fact generation."""

    def test_generates_unique_facts(self):
        """Test that each call generates unique facts."""
        fact1 = generate_test_fact()
        fact2 = generate_test_fact()

        self.assertNotEqual(fact1.id, fact2.id)
        self.assertNotEqual(fact1.old_value, fact2.old_value)
        self.assertNotEqual(fact1.new_value, fact2.new_value)

    def test_fact_structure(self):
        """Test that generated facts have correct structure."""
        fact = generate_test_fact()

        self.assertTrue(fact.id)
        self.assertIn(fact.id, fact.question)
        self.assertIn("INITIAL_", fact.old_value)
        self.assertIn("UPDATED_", fact.new_value)
        self.assertEqual(fact.namespace, "freshness_bench")


class TestPollUntilUpdated(unittest.TestCase):
    """Test polling logic."""

    def setUp(self):
        """Set up mock adapter."""
        self.adapter = MockKnowledgePlaneAdapter()
        self.adapter.initialize(
            mcp_url="http://localhost:8080",
            api_key="test_key",
            workspace_id="test_workspace",
            user_id="test_user"
        )

    def test_finds_updated_fact_immediately(self):
        """Test finding fact on first attempt."""
        # Ingest the updated fact
        expected_value = "UPDATED_TEST_VALUE"
        self.adapter.ingest_documents(
            documents=[{
                'content': expected_value,
                'filename': 'test.txt',
                'metadata': {'namespace': 'test_ns'}
            }],
            namespace='test_ns'
        )

        # Poll (should find immediately)
        result = poll_until_updated(
            adapter=self.adapter,
            question="test value",
            expected_value=expected_value,
            namespace='test_ns',
            poll_interval=1,
            max_attempts=5
        )

        self.assertTrue(result.found)
        self.assertEqual(result.attempts, 1)
        self.assertIsNotNone(result.time_to_truth_seconds)
        self.assertLess(result.time_to_truth_seconds, 2)

    def test_timeout_when_not_found(self):
        """Test timeout when fact is never found."""
        result = poll_until_updated(
            adapter=self.adapter,
            question="nonexistent",
            expected_value="NEVER_APPEARS",
            namespace='test_ns',
            poll_interval=1,
            max_attempts=3
        )

        self.assertFalse(result.found)
        self.assertEqual(result.attempts, 3)
        self.assertIsNone(result.time_to_truth_seconds)

    def test_finds_fact_after_delay(self):
        """Test finding fact after several attempts."""
        expected_value = "DELAYED_VALUE"
        namespace = 'test_ns'

        # Mock that returns nothing first 2 times, then returns the fact
        call_count = [0]
        original_query = self.adapter.query

        def delayed_query(question, namespace=None, k=5, search_mode="hybrid"):
            call_count[0] += 1
            if call_count[0] >= 3:
                # Third call - ingest the fact
                self.adapter.ingest_documents(
                    documents=[{
                        'content': expected_value,
                        'filename': 'delayed.txt',
                        'metadata': {'namespace': namespace}
                    }],
                    namespace=namespace
                )
            return original_query(question, namespace, k, search_mode)

        self.adapter.query = delayed_query

        result = poll_until_updated(
            adapter=self.adapter,
            question="delayed",
            expected_value=expected_value,
            namespace=namespace,
            poll_interval=1,
            max_attempts=5
        )

        self.assertTrue(result.found)
        self.assertEqual(result.attempts, 3)
        self.assertGreaterEqual(len(result.timestamps), 3)


class TestSaveResults(unittest.TestCase):
    """Test result saving."""

    def test_saves_results_to_json(self):
        """Test saving results to JSON file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)

            result = FreshnessResult(
                test_id="test_123",
                mode="api",
                question="What is the capital?",
                old_value="OLD",
                new_value="NEW",
                namespace="test_ns",
                found=True,
                time_to_truth_seconds=90.5,
                attempts=3,
                poll_interval_seconds=30,
                max_attempts=10,
                started_at="2026-02-12T10:00:00",
                completed_at="2026-02-12T10:01:30",
                timestamps=[
                    {'attempt': 1, 'elapsed_seconds': 30, 'timestamp': '2026-02-12T10:00:30', 'result': 'OLD', 'found_expected': False},
                    {'attempt': 2, 'elapsed_seconds': 60, 'timestamp': '2026-02-12T10:01:00', 'result': 'OLD', 'found_expected': False},
                    {'attempt': 3, 'elapsed_seconds': 90.5, 'timestamp': '2026-02-12T10:01:30', 'result': 'NEW', 'found_expected': True},
                ]
            )

            save_results(result, output_dir)

            # Verify file exists
            output_file = output_dir / "freshness_run.json"
            self.assertTrue(output_file.exists())

            # Verify content
            with open(output_file) as f:
                data = json.load(f)

            self.assertEqual(data['test_id'], "test_123")
            self.assertEqual(data['mode'], "api")
            self.assertTrue(data['found'])
            self.assertEqual(data['time_to_truth_seconds'], 90.5)
            self.assertEqual(data['attempts'], 3)
            self.assertEqual(len(data['timestamps']), 3)


class TestIntegrationMock(unittest.TestCase):
    """Integration tests using mock adapter."""

    def setUp(self):
        """Set up mock adapter."""
        self.adapter = MockKnowledgePlaneAdapter()
        self.adapter.initialize(
            mcp_url="http://localhost:8080",
            api_key="test_key",
            workspace_id="test_workspace",
            user_id="test_user"
        )

    def test_full_api_workflow(self):
        """Test complete API mode workflow."""
        fact = generate_test_fact()

        # Ingest initial fact
        self.adapter.ingest_documents(
            documents=[{
                'content': fact.old_value,
                'filename': f'fact_{fact.id}.txt',
                'metadata': {'namespace': fact.namespace, 'fact_id': fact.id}
            }],
            namespace=fact.namespace
        )

        # Verify initial fact exists
        initial_result = self.adapter.query(
            question=fact.question,
            namespace=fact.namespace,
            k=10
        )
        self.assertTrue(len(initial_result.results) > 0)

        # Ingest updated fact
        self.adapter.ingest_documents(
            documents=[{
                'content': fact.new_value,
                'filename': f'fact_{fact.id}_updated.txt',
                'metadata': {'namespace': fact.namespace, 'fact_id': fact.id, 'version': 'updated'}
            }],
            namespace=fact.namespace
        )

        # Poll until updated value appears
        result = poll_until_updated(
            adapter=self.adapter,
            question=fact.question,
            expected_value=fact.new_value,
            namespace=fact.namespace,
            poll_interval=1,
            max_attempts=5
        )

        # Verify success
        self.assertTrue(result.found)
        self.assertIsNotNone(result.time_to_truth_seconds)
        self.assertLess(result.time_to_truth_seconds, 5)


if __name__ == '__main__':
    unittest.main()
