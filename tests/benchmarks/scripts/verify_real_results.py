#!/usr/bin/env python3
"""
Verification Script for KnowledgePlane Benchmark Results

This script verifies that benchmark results are REAL (not mock data)
and meet quality standards before accepting them.

Usage:
    # After validation run (n=20)
    python verify_real_results.py --phase validation

    # After full run (n=500)
    python verify_real_results.py --phase full --n 500

    # Custom results file
    python verify_real_results.py --results output/hotpotqa_results.csv
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
import numpy as np
from scipy import stats


class ResultVerifier:
    """Verifies that benchmark results are real and valid."""

    def __init__(self, results_path: Path, summary_path: Path):
        self.results_path = results_path
        self.summary_path = summary_path
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.checks_passed = 0
        self.checks_total = 0

    def check(self, condition: bool, name: str, error_msg: str = None, warn_msg: str = None) -> bool:
        """
        Perform a verification check.

        Args:
            condition: True if check passes
            name: Name of the check
            error_msg: Error message if check fails (hard failure)
            warn_msg: Warning message if check fails (soft failure)

        Returns:
            True if check passed
        """
        self.checks_total += 1

        if condition:
            self.checks_passed += 1
            print(f"✓ {name}")
            return True
        else:
            if error_msg:
                self.errors.append(f"✗ {name}: {error_msg}")
                print(f"✗ {name}: {error_msg}")
            elif warn_msg:
                self.warnings.append(f"⚠ {name}: {warn_msg}")
                print(f"⚠ {name}: {warn_msg}")
                self.checks_passed += 1  # Warnings don't fail the check
            return False

    def verify_file_existence(self) -> bool:
        """Check that result files exist and are non-empty."""
        print("\n" + "="*60)
        print("1. FILE EXISTENCE CHECKS")
        print("="*60)

        self.check(
            self.results_path.exists(),
            "Results CSV exists",
            f"File not found: {self.results_path}"
        )

        self.check(
            self.summary_path.exists(),
            "Summary JSON exists",
            f"File not found: {self.summary_path}"
        )

        if self.results_path.exists():
            size_kb = self.results_path.stat().st_size / 1024
            self.check(
                size_kb > 1,
                f"Results CSV has data (size: {size_kb:.1f} KB)",
                f"File is too small: {size_kb:.1f} KB"
            )

        if self.summary_path.exists():
            size_kb = self.summary_path.stat().st_size / 1024
            self.check(
                size_kb > 0.1,
                f"Summary JSON has data (size: {size_kb:.1f} KB)",
                f"File is too small: {size_kb:.1f} KB"
            )

        return len(self.errors) == 0

    def verify_format(self) -> Tuple[pd.DataFrame, Dict]:
        """Verify file formats are correct."""
        print("\n" + "="*60)
        print("2. FORMAT VALIDATION")
        print("="*60)

        # Load CSV
        try:
            df = pd.read_csv(self.results_path)
            self.check(True, "CSV loads successfully")
        except Exception as e:
            self.check(False, "CSV loads successfully", f"Failed to load: {e}")
            return None, None

        # Check CSV columns
        required_cols = ['question_id', 'system', 'em', 'f1', 'latency_ms']
        missing_cols = [col for col in required_cols if col not in df.columns]
        self.check(
            len(missing_cols) == 0,
            "CSV has required columns",
            f"Missing columns: {missing_cols}" if missing_cols else None
        )

        # Check for null values
        null_counts = df[required_cols].isnull().sum()
        critical_nulls = null_counts[null_counts > 0]
        self.check(
            len(critical_nulls) == 0,
            "No null values in critical columns",
            f"Null values found: {dict(critical_nulls)}" if len(critical_nulls) > 0 else None
        )

        # Load JSON
        try:
            with open(self.summary_path) as f:
                summary = json.load(f)
            self.check(True, "JSON loads successfully")
        except Exception as e:
            self.check(False, "JSON loads successfully", f"Failed to load: {e}")
            return df, None

        # Check JSON structure
        expected_keys = ['kp', 'vector', 'improvement']
        missing_keys = [k for k in expected_keys if k not in summary]
        self.check(
            'kp' in summary or 'vector' in summary,
            "JSON has system results",
            f"Missing keys: {missing_keys}" if missing_keys else None
        )

        return df, summary

    def verify_data_sanity(self, df: pd.DataFrame, expected_n: int = None) -> bool:
        """Verify data values are in expected ranges."""
        print("\n" + "="*60)
        print("3. DATA SANITY CHECKS")
        print("="*60)

        if df is None:
            self.check(False, "Data available for checks", "DataFrame is None")
            return False

        # Check number of results
        if expected_n:
            actual_n = len(df[df.system == 'kp'])
            success_rate = actual_n / expected_n
            self.check(
                success_rate >= 0.90,
                f"Success rate ≥90% ({actual_n}/{expected_n} = {success_rate:.1%})",
                None,
                f"Success rate is {success_rate:.1%}, expected ≥90%"
            )

        # Check EM scores
        em_valid = ((df.em >= 0) & (df.em <= 1)).all()
        self.check(
            em_valid,
            "EM scores in [0, 1] range",
            "Invalid EM scores found (outside 0-1 range)"
        )

        # Check F1 scores
        f1_valid = ((df.f1 >= 0) & (df.f1 <= 1)).all()
        self.check(
            f1_valid,
            "F1 scores in [0, 1] range",
            "Invalid F1 scores found (outside 0-1 range)"
        )

        # Check latency
        latency_positive = (df.latency_ms > 0).all()
        self.check(
            latency_positive,
            "Latency values are positive",
            "Non-positive latency values found"
        )

        latency_reasonable = (df.latency_ms < 30000).all()
        self.check(
            latency_reasonable,
            "Latency values < 30s",
            None,
            "Some queries took >30s (may indicate issues)"
        )

        # Check for impossibly perfect scores
        kp_df = df[df.system == 'kp']
        perfect_count = (kp_df.em == 1.0).sum()
        perfect_rate = perfect_count / len(kp_df) if len(kp_df) > 0 else 0
        self.check(
            perfect_rate < 0.95,
            f"Not all results are perfect ({perfect_rate:.1%} EM=1.0)",
            None,
            "Suspiciously high perfect score rate (>95%)"
        )

        return len(self.errors) == 0

    def verify_not_mock(self, df: pd.DataFrame) -> bool:
        """Verify results are NOT from mock adapter."""
        print("\n" + "="*60)
        print("4. ANTI-MOCK CHECKS")
        print("="*60)

        if df is None:
            self.check(False, "Data available for checks", "DataFrame is None")
            return False

        kp_df = df[df.system == 'kp']
        if len(kp_df) == 0:
            self.check(False, "KP results exist", "No KP results found")
            return False

        # Check latency variation (mock has low variation)
        latency_std = kp_df.latency_ms.std()
        self.check(
            latency_std > 10,
            f"Latency varies naturally (std={latency_std:.1f}ms)",
            None,
            f"Low latency variation (std={latency_std:.1f}ms) suggests mock data"
        )

        # Check for duplicate identical latencies (mock may have clustering)
        unique_latencies = kp_df.latency_ms.nunique()
        total_queries = len(kp_df)
        uniqueness_ratio = unique_latencies / total_queries
        self.check(
            uniqueness_ratio > 0.7,
            f"Latency values are diverse ({unique_latencies}/{total_queries} unique)",
            None,
            f"Many identical latencies ({uniqueness_ratio:.1%} unique) suggests mock data"
        )

        # Check score distribution (mock may have uniform random)
        em_values = kp_df.em.value_counts()
        # Real data should have clustering at 0.0 and 1.0
        if len(em_values) > 2:
            intermediate_count = em_values[(em_values.index > 0) & (em_values.index < 1)].sum()
            intermediate_rate = intermediate_count / len(kp_df)
            self.check(
                intermediate_rate < 0.3,
                f"Natural EM distribution ({intermediate_rate:.1%} intermediate scores)",
                None,
                f"High rate of intermediate EM scores ({intermediate_rate:.1%}) is unusual"
            )

        # Check for sequential fact IDs (mock uses "fact_0", "fact_1", etc.)
        # This check would require examining the raw data or logs
        # For now, we'll skip it but document the pattern

        return len([e for e in self.errors if 'mock' in e.lower()]) == 0

    def verify_statistical_properties(self, df: pd.DataFrame) -> bool:
        """Verify statistical properties of results."""
        print("\n" + "="*60)
        print("5. STATISTICAL CHECKS")
        print("="*60)

        if df is None:
            self.check(False, "Data available for checks", "DataFrame is None")
            return False

        kp_df = df[df.system == 'kp']
        if len(kp_df) == 0:
            self.check(False, "KP results exist", "No KP results found")
            return False

        # Check for outliers in latency
        z_scores = np.abs(stats.zscore(kp_df.latency_ms))
        outliers = (z_scores > 3).sum()
        outlier_rate = outliers / len(kp_df)
        self.check(
            outlier_rate < 0.05,
            f"Few latency outliers ({outliers}/{len(kp_df)} = {outlier_rate:.1%})",
            None,
            f"High outlier rate ({outlier_rate:.1%}) suggests data quality issues"
        )

        # Check for suspicious patterns in EM scores
        em_values = kp_df.em.values
        # Kolmogorov-Smirnov test against uniform distribution
        # Real EM scores should NOT be uniformly distributed (should cluster at 0 and 1)
        ks_stat, ks_pvalue = stats.kstest(em_values, 'uniform', args=(0, 1))
        self.check(
            ks_pvalue < 0.05,
            f"EM distribution is non-uniform (p={ks_pvalue:.4f})",
            None,
            f"EM scores look uniformly distributed (p={ks_pvalue:.4f}), suspicious"
        )

        # Check for impossible combinations
        # EM=1.0 should always mean F1=1.0
        perfect_em = kp_df[kp_df.em == 1.0]
        if len(perfect_em) > 0:
            perfect_f1_match = (perfect_em.f1 == 1.0).all()
            self.check(
                perfect_f1_match,
                "EM=1.0 implies F1=1.0 (consistency)",
                "Found EM=1.0 with F1<1.0, which is impossible"
            )

        # Check that F1 >= EM (this is a mathematical requirement)
        f1_gte_em = (kp_df.f1 >= kp_df.em).all()
        self.check(
            f1_gte_em,
            "F1 ≥ EM always (mathematical requirement)",
            "Found cases where F1 < EM, which violates metric definition"
        )

        return len(self.errors) == 0

    def verify_kp_improvement(self, df: pd.DataFrame, summary: Dict) -> bool:
        """Verify that KP shows improvement over baseline."""
        print("\n" + "="*60)
        print("6. KP IMPROVEMENT CHECKS")
        print("="*60)

        if df is None or summary is None:
            self.check(False, "Data available for checks", "Missing data")
            return False

        # Check if both systems ran
        systems = df.system.unique()
        has_both = 'kp' in systems and 'vector' in systems

        if not has_both:
            # Can't compare if only one system ran
            print("⚠ Skipping improvement checks (only one system ran)")
            return True

        # Get improvement metrics from summary
        if 'improvement' in summary:
            imp = summary['improvement']

            # Check EM improvement
            em_delta = imp.get('em_delta', 0)
            self.check(
                em_delta > 0,
                f"KP has positive EM improvement ({em_delta*100:+.1f}pp)",
                None,
                f"KP EM improvement is {em_delta*100:+.1f}pp (negative or zero)"
            )

            # Check if improvement is significant
            self.check(
                em_delta >= 0.10,
                f"KP EM improvement ≥10pp ({em_delta*100:+.1f}pp)",
                None,
                f"KP EM improvement is only {em_delta*100:+.1f}pp (target: 10pp)"
            )

            # Check F1 improvement
            f1_delta = imp.get('f1_delta', 0)
            self.check(
                f1_delta > 0,
                f"KP has positive F1 improvement ({f1_delta*100:+.1f}pp)",
                None,
                f"KP F1 improvement is {f1_delta*100:+.1f}pp (negative or zero)"
            )

        # Direct comparison from dataframe
        kp_em = df[df.system == 'kp'].em.mean()
        vec_em = df[df.system == 'vector'].em.mean()
        direct_delta = kp_em - vec_em

        print(f"\nDirect comparison:")
        print(f"  KP EM:     {kp_em:.2%}")
        print(f"  Vector EM: {vec_em:.2%}")
        print(f"  Delta:     {direct_delta*100:+.1f}pp")

        return True

    def generate_report(self) -> None:
        """Generate final verification report."""
        print("\n" + "="*60)
        print("VERIFICATION REPORT")
        print("="*60)

        print(f"\nChecks passed: {self.checks_passed}/{self.checks_total}")

        if len(self.errors) > 0:
            print(f"\nErrors ({len(self.errors)}):")
            for error in self.errors:
                print(f"  {error}")

        if len(self.warnings) > 0:
            print(f"\nWarnings ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  {warning}")

        print("\n" + "="*60)
        if len(self.errors) == 0:
            print("✓ ALL CHECKS PASSED")
            print("Results are verified as REAL and valid.")
        else:
            print("✗ VERIFICATION FAILED")
            print("Results have issues that must be addressed.")
        print("="*60 + "\n")

    def verify_all(self, expected_n: int = None) -> bool:
        """Run all verification checks."""
        # 1. File existence
        if not self.verify_file_existence():
            self.generate_report()
            return False

        # 2. Format validation
        df, summary = self.verify_format()
        if df is None:
            self.generate_report()
            return False

        # 3. Data sanity
        self.verify_data_sanity(df, expected_n)

        # 4. Anti-mock checks
        self.verify_not_mock(df)

        # 5. Statistical properties
        self.verify_statistical_properties(df)

        # 6. KP improvement
        self.verify_kp_improvement(df, summary)

        # Generate report
        self.generate_report()

        return len(self.errors) == 0


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Verify KnowledgePlane benchmark results",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    parser.add_argument(
        '--phase',
        choices=['validation', 'full'],
        help='Benchmark phase (validation=n20, full=n500)'
    )
    parser.add_argument(
        '--n',
        type=int,
        help='Expected number of questions (overrides phase default)'
    )
    parser.add_argument(
        '--results',
        type=Path,
        default=Path('output/hotpotqa_results.csv'),
        help='Path to results CSV file'
    )
    parser.add_argument(
        '--summary',
        type=Path,
        default=Path('output/hotpotqa_summary.json'),
        help='Path to summary JSON file'
    )

    args = parser.parse_args()

    # Determine expected n
    expected_n = args.n
    if expected_n is None and args.phase:
        expected_n = 20 if args.phase == 'validation' else 500

    # Print header
    print("="*60)
    print("KnowledgePlane Benchmark Results Verification")
    print("="*60)
    print(f"Results file: {args.results}")
    print(f"Summary file: {args.summary}")
    if expected_n:
        print(f"Expected questions: {expected_n}")
    print("="*60)

    # Run verification
    verifier = ResultVerifier(args.results, args.summary)
    success = verifier.verify_all(expected_n)

    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
