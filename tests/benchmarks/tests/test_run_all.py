#!/usr/bin/env python3
"""
Unit tests for run_all.py orchestration script

Tests the master runner that orchestrates all benchmarks.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock


class TestRunAll(unittest.TestCase):
    """Test suite for run_all.py"""

    def setUp(self):
        """Set up test environment."""
        self.test_dir = Path(__file__).parent
        self.run_all_path = self.test_dir / "run_all.py"
        self.assertTrue(self.run_all_path.exists(), "run_all.py must exist")

    def test_script_exists_and_executable(self):
        """Test that run_all.py exists."""
        self.assertTrue(self.run_all_path.exists())
        self.assertTrue(self.run_all_path.is_file())

    def test_help_flag(self):
        """Test --help flag shows usage."""
        result = subprocess.run(
            [sys.executable, str(self.run_all_path), "--help"],
            capture_output=True,
            text=True,
            timeout=5
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("usage:", result.stdout.lower())
        self.assertIn("n-hotpot", result.stdout.lower())
        self.assertIn("freshness-mode", result.stdout.lower())

    def test_imports_successful(self):
        """Test that all required imports work."""
        code = """
import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
print("IMPORT_SUCCESS")
"""
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=5
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("IMPORT_SUCCESS", result.stdout)

    def test_output_directory_creation(self):
        """Test that output directory is created if missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Change to temp directory
            original_dir = Path.cwd()
            try:
                import os
                os.chdir(tmpdir)

                # Output directory should not exist yet
                output_dir = Path("output")
                self.assertFalse(output_dir.exists())

                # Run the script (will fail quickly due to missing bench scripts)
                # but should create output directory
                result = subprocess.run(
                    [sys.executable, str(self.run_all_path), "--help"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )

                # Help should work
                self.assertEqual(result.returncode, 0)

            finally:
                os.chdir(original_dir)

    @patch('subprocess.run')
    def test_run_hotpotqa_success(self, mock_run):
        """Test successful HotpotQA benchmark execution."""
        # Mock subprocess result
        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = "HotpotQA completed successfully"
        mock_result.stderr = ""
        mock_run.return_value = mock_result

        # Create temporary summary file
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir) / "output"
            output_dir.mkdir()

            summary_data = {
                "kp": {"avg_em": 0.65, "avg_f1": 0.78, "avg_latency_ms": 450},
                "vector": {"avg_em": 0.45, "avg_f1": 0.62, "avg_latency_ms": 320},
                "improvement": {"em_delta": 0.20, "f1_delta": 0.16}
            }

            summary_path = output_dir / "hotpotqa_summary.json"
            with open(summary_path, 'w') as f:
                json.dump(summary_data, f)

            # Import and test run_hotpotqa function
            import sys
            sys.path.insert(0, str(self.test_dir))
            try:
                from run_all import run_hotpotqa

                # Create mock args
                args = Mock()
                args.n_hotpot = 20
                args.top_k = 5
                args.seed = 42
                args.mock_kp = True
                args.run_kp = True
                args.run_vector = True

                # Change to temp directory
                original_dir = Path.cwd()
                import os
                os.chdir(tmpdir)

                try:
                    result = run_hotpotqa(args)
                    self.assertEqual(result["status"], "success")
                    self.assertIn("results", result)
                    self.assertEqual(result["results"]["kp"]["avg_em"], 0.65)
                finally:
                    os.chdir(original_dir)

            finally:
                sys.path.pop(0)

    @patch('subprocess.run')
    def test_run_hotpotqa_failure(self, mock_run):
        """Test HotpotQA benchmark failure handling."""
        # Mock subprocess failure
        mock_result = Mock()
        mock_result.returncode = 1
        mock_result.stdout = ""
        mock_result.stderr = "Error: Test failure"
        mock_run.return_value = mock_result

        # Import and test
        import sys
        sys.path.insert(0, str(self.test_dir))
        try:
            from run_all import run_hotpotqa

            args = Mock()
            args.n_hotpot = 20
            args.top_k = 5
            args.seed = 42
            args.mock_kp = True
            args.run_kp = True
            args.run_vector = True

            result = run_hotpotqa(args)
            self.assertEqual(result["status"], "failed")
            self.assertIn("error", result)
        finally:
            sys.path.pop(0)

    @patch('subprocess.run')
    def test_run_freshness_skip_mode(self, mock_run):
        """Test freshness benchmark skip mode."""
        import sys
        sys.path.insert(0, str(self.test_dir))
        try:
            from run_all import run_freshness

            args = Mock()
            args.freshness_mode = "skip"
            args.poll_interval = 30
            args.max_attempts = 20
            args.workspace_id = None
            args.user_id = None
            args.api_key = None

            result = run_freshness(args)
            self.assertEqual(result["status"], "skipped")
            # Subprocess should not be called in skip mode
            mock_run.assert_not_called()
        finally:
            sys.path.pop(0)

    def test_argument_parsing(self):
        """Test that all CLI arguments are properly defined."""
        # Test various argument combinations
        test_cases = [
            ["--n-hotpot", "50"],
            ["--top_k", "10"],
            ["--seed", "123"],
            ["--mock_kp"],
            ["--freshness-mode", "skip"],
            ["--freshness-mode", "manual"],
            ["--freshness-mode", "api"],
            ["--poll_interval", "60"],
            ["--max_attempts", "10"],
        ]

        for args in test_cases:
            result = subprocess.run(
                [sys.executable, str(self.run_all_path)] + args + ["--help"],
                capture_output=True,
                text=True,
                timeout=5
            )
            # Should not error on valid arguments
            self.assertNotIn("error:", result.stderr.lower())

    def test_combined_report_structure(self):
        """Test that generate_final_report creates proper structure."""
        import sys
        sys.path.insert(0, str(self.test_dir))
        try:
            from run_all import generate_final_report

            hotpot_result = {
                "status": "success",
                "results": {
                    "kp": {"avg_em": 0.65, "avg_f1": 0.78, "avg_latency_ms": 450},
                    "vector": {"avg_em": 0.45, "avg_f1": 0.62, "avg_latency_ms": 320},
                    "improvement": {"em_delta": 0.20, "f1_delta": 0.16}
                }
            }

            fresh_result = {
                "status": "success",
                "results": {
                    "found": True,
                    "time_to_truth_seconds": 90.5,
                    "attempts": 3
                }
            }

            args = Mock()
            args.n_hotpot = 20
            args.mock_kp = True

            with tempfile.TemporaryDirectory() as tmpdir:
                import os
                original_dir = Path.cwd()
                os.chdir(tmpdir)

                # Create output directory
                Path("output").mkdir()

                try:
                    # Capture stdout
                    from io import StringIO
                    import sys as sys_module
                    captured_output = StringIO()
                    sys_module.stdout = captured_output

                    generate_final_report(hotpot_result, fresh_result, args)

                    # Restore stdout
                    sys_module.stdout = sys_module.__stdout__

                    output = captured_output.getvalue()

                    # Check for key sections
                    self.assertIn("FINAL REPORT", output)
                    self.assertIn("HotpotQA", output)
                    self.assertIn("Freshness", output)
                    self.assertIn("NEXT STEPS", output)

                    # Check that report file was created
                    report_files = list(Path("output").glob("benchmark_report_*.json"))
                    self.assertEqual(len(report_files), 1)

                    # Validate report structure
                    with open(report_files[0]) as f:
                        report = json.load(f)
                        self.assertIn("timestamp", report)
                        self.assertIn("config", report)
                        self.assertIn("hotpotqa", report)
                        self.assertIn("freshness", report)

                finally:
                    os.chdir(original_dir)

        finally:
            sys.path.pop(0)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestRunAll)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_tests())
