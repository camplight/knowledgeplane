#!/usr/bin/env python3
"""
KnowledgePlane Benchmarking Suite - Master Runner
Orchestrates all benchmarks with a single command

This script runs the complete benchmarking suite:
1. HotpotQA (multi-hop reasoning: graph vs vector)
2. Freshness (time-to-truth for updated facts)

Then generates a comprehensive final report with all metrics and recommendations.

Usage:
    # Quick test with mock KP (no server needed)
    python run_all.py --n-hotpot 20 --mock_kp --freshness-mode skip

    # Full run with real KP server
    python run_all.py --n-hotpot 50 --freshness-mode api
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any


def run_hotpotqa(args) -> Dict[str, Any]:
    """
    Run HotpotQA benchmark and return results.

    Args:
        args: Command-line arguments

    Returns:
        Dict with status and results from HotpotQA benchmark
    """
    print("\n" + "="*60)
    print("Running HotpotQA Benchmark (Multi-hop Reasoning)")
    print("="*60 + "\n")

    cmd = [
        sys.executable,
        "bench_hotpotqa.py",
        "--n", str(args.n_hotpot),
        "--top_k", str(args.top_k),
        "--seed", str(args.seed),
    ]

    if args.mock_kp:
        cmd.append("--mock_kp")
    if not args.run_kp:
        cmd.append("--run_kp=false")
    if not args.run_vector:
        cmd.append("--run_vector=false")

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"ERROR: HotpotQA failed: {result.stderr}")
        return {"status": "failed", "error": result.stderr}

    # Print stdout for real-time feedback
    if result.stdout:
        print(result.stdout)

    # Load summary
    summary_path = Path("output/hotpotqa_summary.json")
    if summary_path.exists():
        with open(summary_path) as f:
            return {"status": "success", "results": json.load(f)}

    return {"status": "success", "results": None}


def run_freshness(args) -> Dict[str, Any]:
    """
    Run Freshness benchmark and return results.

    Args:
        args: Command-line arguments

    Returns:
        Dict with status and results from freshness benchmark
    """
    print("\n" + "="*60)
    print("Running Freshness Benchmark (Time-to-Truth)")
    print("="*60 + "\n")

    if args.freshness_mode == "skip":
        print("Skipping freshness benchmark (use --freshness-mode manual or api)")
        return {"status": "skipped"}

    cmd = [
        sys.executable,
        "bench_freshness.py",
        "--mode", args.freshness_mode,
        "--poll_interval", str(args.poll_interval),
        "--max_attempts", str(args.max_attempts),
    ]

    if args.workspace_id:
        cmd.extend(["--workspace_id", args.workspace_id])
    if args.user_id:
        cmd.extend(["--user_id", args.user_id])
    if args.api_key:
        cmd.extend(["--api_key", args.api_key])

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"ERROR: Freshness benchmark failed: {result.stderr}")
        return {"status": "failed", "error": result.stderr}

    # Print stdout for real-time feedback
    if result.stdout:
        print(result.stdout)

    # Load latest result
    output_dir = Path("output")
    freshness_files = list(output_dir.glob("freshness_run*.json"))
    if freshness_files:
        latest = max(freshness_files, key=lambda p: p.stat().st_mtime)
        with open(latest) as f:
            return {"status": "success", "results": json.load(f)}

    return {"status": "success", "results": None}


def generate_final_report(hotpot_result: Dict, fresh_result: Dict, args) -> None:
    """
    Generate comprehensive final report.

    Args:
        hotpot_result: Results from HotpotQA benchmark
        fresh_result: Results from freshness benchmark
        args: Command-line arguments
    """
    print("\n" + "="*60)
    print("KNOWLEDGEPLANE BENCHMARKING SUITE - FINAL REPORT")
    print("="*60 + "\n")

    timestamp = datetime.now().isoformat()
    print(f"Run completed: {timestamp}")
    print(f"Configuration: n={args.n_hotpot}, mock_kp={args.mock_kp}\n")

    # HotpotQA results
    print("1. HotpotQA (Multi-hop Reasoning)")
    print("-" * 60)
    if hotpot_result["status"] == "success" and hotpot_result.get("results"):
        results = hotpot_result["results"]

        if "kp" in results and results["kp"]:
            kp = results["kp"]
            print(f"   KnowledgePlane:")
            print(f"     Exact Match: {kp['avg_em']*100:.1f}%")
            print(f"     F1 Score:    {kp['avg_f1']*100:.1f}%")
            print(f"     Avg Latency: {kp['avg_latency_ms']:.0f}ms")

        if "vector" in results and results["vector"]:
            vec = results["vector"]
            print(f"   Vector Baseline:")
            print(f"     Exact Match: {vec['avg_em']*100:.1f}%")
            print(f"     F1 Score:    {vec['avg_f1']*100:.1f}%")
            print(f"     Avg Latency: {vec['avg_latency_ms']:.0f}ms")

        if "improvement" in results and results["improvement"]:
            imp = results["improvement"]
            print(f"   Improvement:")
            print(f"     EM: {imp['em_delta']*100:+.1f} pp")
            print(f"     F1: {imp['f1_delta']*100:+.1f} pp")

            if imp['em_delta'] > 0.10:
                print(f"     SUCCESS: >10% EM improvement achieved!")
    else:
        print(f"   Status: {hotpot_result['status']}")
        if "error" in hotpot_result:
            print(f"   Error: {hotpot_result['error'][:200]}")

    print()

    # Freshness results
    print("2. Freshness (Time-to-Truth)")
    print("-" * 60)
    if fresh_result["status"] == "success" and fresh_result.get("results"):
        results = fresh_result["results"]
        if results.get("found"):
            ttt = results["time_to_truth_seconds"]
            minutes = ttt / 60
            print(f"   Time-to-Truth: {ttt:.1f}s ({minutes:.2f} minutes)")
            print(f"   Attempts: {results['attempts']}")

            if ttt < 60:
                print(f"   Rating: EXCELLENT (< 1 minute)")
            elif ttt < 180:
                print(f"   Rating: GOOD (< 3 minutes)")
            elif ttt < 300:
                print(f"   Rating: TARGET (< 5 minutes)")
            else:
                print(f"   Rating: SLOW (> 5 minutes)")
        else:
            print(f"   Status: Not found after {results['attempts']} attempts")
    elif fresh_result["status"] == "skipped":
        print(f"   Status: Skipped (run with --freshness-mode manual or api)")
    else:
        print(f"   Status: {fresh_result['status']}")
        if "error" in fresh_result:
            print(f"   Error: {fresh_result['error'][:200]}")

    print("\n" + "="*60)
    print("Detailed results saved to:")
    print("   - output/hotpotqa_results.csv")
    print("   - output/hotpotqa_summary.json")
    print("   - output/freshness_run.json")
    print("="*60 + "\n")

    # Save combined report
    report = {
        "timestamp": timestamp,
        "config": vars(args),
        "hotpotqa": hotpot_result,
        "freshness": fresh_result,
    }

    report_path = Path("output") / f"benchmark_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"Combined report saved to: {report_path}\n")

    # Print next steps
    print("NEXT STEPS")
    print("-" * 60)
    print("To expand this benchmarking suite:")
    print("  - LoCoMo: Long-context multi-hop reasoning")
    print("  - MemoryBench: Memory consistency and retrieval")
    print("  - RAGAS: Retrieval-Augmented Generation Assessment")
    print("  - Competitor integration: Mem0, Supermemory, etc.")
    print("  - Scale up: Run with --n-hotpot 100 or --n-hotpot 1000")
    print("="*60 + "\n")


def main():
    """Main entry point for benchmarking suite."""
    parser = argparse.ArgumentParser(
        description="Run all KnowledgePlane benchmarks",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    # HotpotQA options
    parser.add_argument("--n-hotpot", type=int, default=20,
                       help="Number of HotpotQA questions")
    parser.add_argument("--top_k", type=int, default=5,
                       help="Top-k results for retrieval")
    parser.add_argument("--seed", type=int, default=42,
                       help="Random seed for reproducibility")
    parser.add_argument("--mock_kp", action="store_true",
                       help="Use mock KP adapter (no server needed)")
    parser.add_argument("--run_kp", action="store_true", default=True,
                       help="Run KP system")
    parser.add_argument("--run_vector", action="store_true", default=True,
                       help="Run vector baseline")

    # Freshness options
    parser.add_argument("--freshness-mode", choices=["skip", "manual", "api"],
                       default="skip",
                       help="Freshness benchmark mode")
    parser.add_argument("--poll_interval", type=int, default=30,
                       help="Polling interval in seconds")
    parser.add_argument("--max_attempts", type=int, default=20,
                       help="Max polling attempts")

    # KP connection
    parser.add_argument("--workspace_id", type=str,
                       help="KP workspace ID")
    parser.add_argument("--user_id", type=str,
                       help="KP user ID")
    parser.add_argument("--api_key", type=str,
                       help="KP API key")

    args = parser.parse_args()

    # Ensure output directory exists
    Path("output").mkdir(exist_ok=True)

    print("="*60)
    print("KNOWLEDGEPLANE BENCHMARKING SUITE")
    print("="*60)
    print(f"Configuration:")
    print(f"  HotpotQA: {args.n_hotpot} questions")
    print(f"  Freshness: {args.freshness_mode} mode")
    print(f"  Mock KP: {args.mock_kp}")
    print(f"  Run KP: {args.run_kp}")
    print(f"  Run Vector: {args.run_vector}")
    print("="*60)

    # Run benchmarks
    hotpot_result = run_hotpotqa(args)
    fresh_result = run_freshness(args)

    # Generate report
    generate_final_report(hotpot_result, fresh_result, args)

    # Exit with appropriate code
    if hotpot_result["status"] == "failed" or fresh_result["status"] == "failed":
        print("\nERROR: One or more benchmarks failed. See above for details.")
        sys.exit(1)

    print("\nBenchmarking suite completed successfully!")
    sys.exit(0)


if __name__ == "__main__":
    main()
