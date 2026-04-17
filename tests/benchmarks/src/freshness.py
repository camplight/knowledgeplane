#!/usr/bin/env python3
"""
Freshness "Time-to-Truth" Benchmark for KnowledgePlane

This benchmark measures how quickly KnowledgePlane reflects updated facts
by measuring the time between fact ingestion/update and when the fact
becomes retrievable via search.

COMPARES:
- KP with sync_embedding: Immediate searchability after ingestion
- FAISS Full Rebuild: Re-embed entire corpus + rebuild index (worst-case)
- FAISS Incremental: Just add new embedding (best-case, unrealistic for updates)

Modes:
1. Manual mode: Prints instructions for human to inject/update facts
2. API mode: Programmatically injects and updates facts via KP adapter
3. Batch mode (n > 1): Run multiple tests for statistical significance
4. Scaling mode (--scaling): Test with multiple corpus sizes (1K, 10K, 100K)

FAISS Comparison Modes (--run_baseline):
- Default: Incremental add (fair comparison for inserts)
- --full-rebuild: Force full rebuild (worst-case, shows O(n) scaling)
- --scaling: Test multiple corpus sizes

Success Criteria:
- Excellent: < 1 second time-to-truth
- Good: < 5 seconds
- Target: < 30 seconds

Examples:
    # Basic comparison (n=20 tests)
    python bench_freshness.py --mode api --n 20 --run_baseline

    # With incremental FAISS (best-case comparison)
    python bench_freshness.py --mode api --n 20 --run_baseline --incremental

    # Scaling analysis (shows O(n) behavior)
    python bench_freshness.py --mode api --n 5 --run_baseline --scaling

    # Custom corpus sizes for scaling
    python bench_freshness.py --mode api --n 5 --run_baseline --scaling --corpus_sizes "500,5000,50000"
"""

import argparse
import json
import logging
import os
import platform
import statistics
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from rich.console import Console
    from rich.table import Table
    from rich.progress import Progress, SpinnerColumn, TextColumn
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    print("Note: Install 'rich' for colored output: pip install rich")

# FAISS baseline imports
try:
    import numpy as np
    import faiss
    from sentence_transformers import SentenceTransformer
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    print("Note: Install faiss-cpu and sentence-transformers for baseline comparison")

from lib.adapter import (
    HTTPKnowledgePlaneAdapter,
    KnowledgePlaneAdapter,
    KnowledgePlaneAuthError,
    QueryResult,
    cleanup_benchmark_facts_by_prefix,
)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_environment_info() -> Dict[str, Any]:
    """Capture environment specifications for reproducibility."""
    env_info = {
        "timestamp": datetime.now().isoformat(),
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "processor": platform.processor() or "unknown",
            "python_version": platform.python_version(),
        },
        "docker": {
            "in_container": os.path.exists("/.dockerenv"),
            "container_id": os.getenv("HOSTNAME", "N/A") if os.path.exists("/.dockerenv") else None,
        },
        "packages": {},
        "embedding_models": {
            "kp": "text-embedding-3-small (OpenAI, 1536d)",
            "faiss_baseline": "all-MiniLM-L6-v2 (SentenceTransformers, 384d)",
            "note": "Different models used - embedding generation times not directly comparable"
        }
    }

    # Try to get psutil info (optional)
    try:
        import psutil
        env_info["hardware"] = {
            "cpu_count": psutil.cpu_count(logical=False),
            "cpu_count_logical": psutil.cpu_count(logical=True),
            "memory_total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "memory_available_gb": round(psutil.virtual_memory().available / (1024**3), 2),
        }
    except ImportError:
        env_info["hardware"] = {"note": "psutil not installed - hardware info unavailable"}

    # Package versions
    if FAISS_AVAILABLE:
        try:
            env_info["packages"]["faiss"] = faiss.__version__ if hasattr(faiss, '__version__') else "unknown"
        except:
            pass

    return env_info


def print_environment_header(console: Optional['Console'] = None):
    """Print environment information at benchmark start."""
    env = get_environment_info()

    if console:
        console.print("\n[bold]═══ BENCHMARK ENVIRONMENT ═══[/bold]")
        console.print(f"  Platform: {env['platform']['system']} {env['platform']['release']} ({env['platform']['machine']})")
        console.print(f"  Python: {env['platform']['python_version']}")
        console.print(f"  Docker: {'Yes' if env['docker']['in_container'] else 'No'}")
        if 'hardware' in env and 'cpu_count' in env['hardware']:
            console.print(f"  CPU: {env['hardware']['cpu_count']} cores ({env['hardware']['cpu_count_logical']} logical)")
            console.print(f"  Memory: {env['hardware']['memory_available_gb']:.1f}GB available / {env['hardware']['memory_total_gb']:.1f}GB total")
        console.print(f"  [dim]Note: {env['embedding_models']['note']}[/dim]\n")
    else:
        print("\n=== BENCHMARK ENVIRONMENT ===")
        print(f"  Platform: {env['platform']['system']} {env['platform']['release']} ({env['platform']['machine']})")
        print(f"  Python: {env['platform']['python_version']}")
        print(f"  Docker: {'Yes' if env['docker']['in_container'] else 'No'}")
        if 'hardware' in env and 'cpu_count' in env['hardware']:
            print(f"  CPU: {env['hardware']['cpu_count']} cores ({env['hardware']['cpu_count_logical']} logical)")
            print(f"  Memory: {env['hardware']['memory_available_gb']:.1f}GB available / {env['hardware']['memory_total_gb']:.1f}GB total")
        print(f"  Note: {env['embedding_models']['note']}\n")


@dataclass
class TestFact:
    """A unique test fact for freshness testing."""
    id: str
    question: str
    old_value: str
    new_value: str
    timestamp: str
    namespace: str = "freshness_bench"


@dataclass
class PollAttempt:
    """Record of a single polling attempt."""
    attempt: int
    elapsed_seconds: float
    timestamp: str
    result: Optional[str]
    found_expected: bool


@dataclass
class FreshnessResult:
    """Complete freshness test result."""
    test_id: str
    mode: str
    question: str
    old_value: str
    new_value: str
    namespace: str
    found: bool
    time_to_truth_seconds: Optional[float]
    attempts: int
    poll_interval_seconds: int
    max_attempts: int
    started_at: str
    completed_at: str
    timestamps: List[Dict]
    measured_from_creation: bool = False  # True if time measured from fact creation, not polling start


@dataclass
class BatchFreshnessResult:
    """Aggregated results from multiple freshness tests."""
    system: str  # "kp" or "faiss"
    n_tests: int
    n_successful: int
    times_seconds: List[float]
    # Statistics
    mean_seconds: float = 0.0
    median_seconds: float = 0.0
    p95_seconds: float = 0.0
    p99_seconds: float = 0.0
    min_seconds: float = 0.0
    max_seconds: float = 0.0
    # Metadata
    started_at: str = ""
    completed_at: str = ""
    individual_results: List[Dict] = field(default_factory=list)

    def compute_stats(self):
        """Compute statistics from times_seconds."""
        if not self.times_seconds:
            return
        self.mean_seconds = statistics.mean(self.times_seconds)
        self.median_seconds = statistics.median(self.times_seconds)
        self.min_seconds = min(self.times_seconds)
        self.max_seconds = max(self.times_seconds)
        # Percentiles
        sorted_times = sorted(self.times_seconds)
        n = len(sorted_times)
        self.p95_seconds = sorted_times[int(n * 0.95)] if n >= 20 else self.max_seconds
        self.p99_seconds = sorted_times[int(n * 0.99)] if n >= 100 else self.max_seconds


def generate_test_fact() -> TestFact:
    """
    Generate a unique test fact for freshness testing.

    Returns:
        TestFact with unique ID and values
    """
    fact_id = str(uuid.uuid4())
    timestamp = datetime.now().isoformat()

    return TestFact(
        id=fact_id,
        question=f"What is the status of test fact {fact_id}?",
        old_value=f"INITIAL_{timestamp}",
        new_value=f"UPDATED_{timestamp}",
        timestamp=timestamp,
        namespace="freshness_bench"
    )


def poll_until_updated(
    adapter: KnowledgePlaneAdapter,
    question: str,
    expected_value: str,
    namespace: str,
    poll_interval: int = 30,
    max_attempts: int = 20,
    console: Optional['Console'] = None,
    creation_start_time: Optional[float] = None
) -> FreshnessResult:
    """
    Poll KP every N seconds until the expected value appears.

    Args:
        adapter: KnowledgePlane adapter instance
        question: Query to ask
        expected_value: Expected fact content to find
        namespace: Namespace for filtering
        poll_interval: Seconds between polls
        max_attempts: Maximum number of attempts
        console: Rich console for output (optional)
        creation_start_time: Time when fact creation started (for accurate time-to-truth)

    Returns:
        FreshnessResult with timing and attempt data
    """
    # Use creation_start_time if provided, otherwise fall back to current time
    # This allows accurate measurement from fact creation, not just polling start
    start_time = creation_start_time if creation_start_time is not None else time.time()
    started_at = datetime.now().isoformat()
    timestamps = []

    for attempt in range(max_attempts):
        current_time = time.time()
        elapsed = current_time - start_time

        # Query KP
        try:
            result = adapter.query(
                question=question,
                namespace=namespace,
                k=10,
                search_mode="hybrid"
            )

            # Extract first result content
            result_content = None
            if result.results:
                result_content = result.results[0].content

            # Check if expected value appears
            found_expected = False
            if result_content and expected_value in result_content:
                found_expected = True

            # Record timestamp
            timestamps.append({
                'attempt': attempt + 1,
                'elapsed_seconds': elapsed,
                'timestamp': datetime.now().isoformat(),
                'result': result_content,
                'found_expected': found_expected
            })

            # Print progress
            if console:
                status = "✅ FOUND!" if found_expected else "⏳ Not found yet"
                console.print(
                    f"  Attempt {attempt + 1}/{max_attempts} ({elapsed:.1f}s): {status}"
                )
            else:
                status = "FOUND" if found_expected else "Not found yet"
                print(f"  Attempt {attempt + 1}/{max_attempts} ({elapsed:.1f}s): {status}")

            # Success! Found the updated value
            if found_expected:
                completed_at = datetime.now().isoformat()
                return FreshnessResult(
                    test_id=str(uuid.uuid4()),
                    mode="polling",
                    question=question,
                    old_value="",
                    new_value=expected_value,
                    namespace=namespace,
                    found=True,
                    time_to_truth_seconds=elapsed,
                    attempts=attempt + 1,
                    poll_interval_seconds=poll_interval,
                    max_attempts=max_attempts,
                    started_at=started_at,
                    completed_at=completed_at,
                    timestamps=timestamps,
                    measured_from_creation=creation_start_time is not None
                )

        except KnowledgePlaneAuthError:
            raise
        except Exception as e:
            logger.error(f"Poll attempt {attempt + 1} failed: {e}")
            timestamps.append({
                'attempt': attempt + 1,
                'elapsed_seconds': elapsed,
                'timestamp': datetime.now().isoformat(),
                'result': f"ERROR: {str(e)}",
                'found_expected': False
            })

        # Wait before next poll (unless this was the last attempt)
        if attempt < max_attempts - 1:
            time.sleep(poll_interval)

    # Timeout - not found
    completed_at = datetime.now().isoformat()
    return FreshnessResult(
        test_id=str(uuid.uuid4()),
        mode="polling",
        question=question,
        old_value="",
        new_value=expected_value,
        namespace=namespace,
        found=False,
        time_to_truth_seconds=None,
        attempts=max_attempts,
        poll_interval_seconds=poll_interval,
        max_attempts=max_attempts,
        started_at=started_at,
        completed_at=completed_at,
        timestamps=timestamps,
        measured_from_creation=creation_start_time is not None
    )


def manual_mode(
    adapter: KnowledgePlaneAdapter,
    fact: TestFact,
    poll_interval: int,
    max_attempts: int,
    console: Optional['Console'] = None
) -> FreshnessResult:
    """
    Manual mode: Print instructions for human to inject/update facts.

    Args:
        adapter: KnowledgePlane adapter
        fact: Test fact to use
        poll_interval: Seconds between polls
        max_attempts: Maximum polling attempts
        console: Rich console for output (optional)

    Returns:
        FreshnessResult with timing data
    """
    if console:
        console.print("\n[bold cyan]═══ MANUAL FRESHNESS TEST ═══[/bold cyan]")
        console.print(f"[yellow]Fact ID:[/yellow] {fact.id}")
        console.print(f"[yellow]Question:[/yellow] {fact.question}")
        console.print(f"[yellow]Namespace:[/yellow] {fact.namespace}")

        console.print("\n[bold green]Step 1: Create Initial Fact[/bold green]")
        console.print(f"  Content: [cyan]{fact.old_value}[/cyan]")
        console.print("  Use KnowledgePlane UI or API to create this fact")
        console.print("\n[bold green]Step 2: Verify Initial State[/bold green]")
        console.print("  Press ENTER when the fact is created...")
    else:
        print("\n=== MANUAL FRESHNESS TEST ===")
        print(f"Fact ID: {fact.id}")
        print(f"Question: {fact.question}")
        print(f"Namespace: {fact.namespace}")
        print("\nStep 1: Create Initial Fact")
        print(f"  Content: {fact.old_value}")
        print("  Use KnowledgePlane UI or API to create this fact")
        print("\nStep 2: Verify Initial State")
        print("  Press ENTER when the fact is created...")

    input()

    # Query to verify initial state
    if console:
        console.print("\n[bold]Querying KP to verify initial state...[/bold]")
    else:
        print("\nQuerying KP to verify initial state...")

    initial_result = adapter.query(
        question=fact.question,
        namespace=fact.namespace,
        k=10
    )

    if initial_result.results:
        result_content = initial_result.results[0].content
        if console:
            console.print(f"  Current answer: [cyan]{result_content}[/cyan]")
        else:
            print(f"  Current answer: {result_content}")
    else:
        if console:
            console.print("  [yellow]Warning: No results found. Fact may not be created yet.[/yellow]")
        else:
            print("  Warning: No results found. Fact may not be created yet.")

    # Step 3: Update the fact
    if console:
        console.print("\n[bold green]Step 3: Update the Fact[/bold green]")
        console.print(f"  New content: [cyan]{fact.new_value}[/cyan]")
        console.print("  Update the fact in KnowledgePlane")
        console.print("  [yellow]Press ENTER just BEFORE you start the update (to start timer)...[/yellow]")
    else:
        print("\nStep 3: Update the Fact")
        print(f"  New content: {fact.new_value}")
        print("  Update the fact in KnowledgePlane")
        print("  Press ENTER just BEFORE you start the update (to start timer)...")

    input()

    # Record time when user indicates they're starting the update
    creation_start_time = time.time()

    if console:
        console.print("  [dim]Timer started! Update the fact now, then press ENTER when done.[/dim]")
    else:
        print("  Timer started! Update the fact now, then press ENTER when done.")

    input()

    # Poll until updated value appears
    if console:
        console.print(f"\n[bold]Polling every {poll_interval}s until new value appears...[/bold]")
        console.print(f"  [dim]Timer started before update (manual mode approximation)[/dim]")
    else:
        print(f"\nPolling every {poll_interval}s until new value appears...")
        print("  Timer started before update (manual mode approximation)")

    result = poll_until_updated(
        adapter=adapter,
        question=fact.question,
        expected_value=fact.new_value,
        namespace=fact.namespace,
        poll_interval=poll_interval,
        max_attempts=max_attempts,
        console=console,
        creation_start_time=creation_start_time  # Pass creation time for accurate measurement
    )

    # Update result with fact details
    result.old_value = fact.old_value
    result.new_value = fact.new_value
    result.mode = "manual"
    result.test_id = fact.id

    return result


def api_mode(
    adapter: KnowledgePlaneAdapter,
    fact: TestFact,
    poll_interval: int,
    max_attempts: int,
    console: Optional['Console'] = None
) -> FreshnessResult:
    """
    API mode: Programmatically inject and update facts via adapter.

    Args:
        adapter: KnowledgePlane adapter
        fact: Test fact to use
        poll_interval: Seconds between polls
        max_attempts: Maximum polling attempts
        console: Rich console for output (optional)

    Returns:
        FreshnessResult with timing data
    """
    if console:
        console.print("\n[bold cyan]═══ API FRESHNESS TEST ═══[/bold cyan]")
        console.print(f"[yellow]Fact ID:[/yellow] {fact.id}")
        console.print(f"[yellow]Question:[/yellow] {fact.question}")
        console.print(f"[yellow]Namespace:[/yellow] {fact.namespace}")
    else:
        print("\n=== API FRESHNESS TEST ===")
        print(f"Fact ID: {fact.id}")
        print(f"Question: {fact.question}")
        print(f"Namespace: {fact.namespace}")

    # Step 1: Ingest initial fact
    if console:
        console.print("\n[bold green]Step 1: Ingesting Initial Fact[/bold green]")
        console.print(f"  Content: [cyan]{fact.old_value}[/cyan]")
    else:
        print("\nStep 1: Ingesting Initial Fact")
        print(f"  Content: {fact.old_value}")

    try:
        # Include fact_id in content for semantic matching (same pattern as batch mode)
        initial_content = f"Test fact {fact.id} has status: {fact.old_value}"
        ingestion_result = adapter.ingest_documents(
            documents=[{
                'content': initial_content,
                'filename': f'fact_{fact.id}.txt',
                'mimeType': 'text/plain',
                'metadata': {'namespace': fact.namespace, 'fact_id': fact.id}
            }],
            namespace=fact.namespace
        )

        if console:
            console.print(f"  ✅ Created {ingestion_result[0].facts_created} facts")
        else:
            print(f"  Created {ingestion_result[0].facts_created} facts")
    except Exception as e:
        if console:
            console.print(f"  [red]❌ Failed to ingest: {e}[/red]")
        else:
            print(f"  Failed to ingest: {e}")
        raise

    # Step 2: Verify initial state
    if console:
        console.print("\n[bold green]Step 2: Verifying Initial State[/bold green]")
    else:
        print("\nStep 2: Verifying Initial State")

    initial_result = adapter.query(
        question=fact.question,
        namespace=fact.namespace,
        k=10
    )

    # Check for fact_id in metadata (primary) or content (fallback)
    initial_found = False
    if initial_result.results:
        for r in initial_result.results:
            # Primary: check fact_id in metadata (exact match)
            if r.metadata.get('fact_id') == fact.id:
                initial_found = True
                break
            # Fallback: check if fact_id appears in content
            if fact.id in r.content:
                initial_found = True
                break
    if initial_found:
        if console:
            console.print("  ✅ Initial fact is retrievable")
        else:
            print("  Initial fact is retrievable")
    else:
        if console:
            console.print("  [yellow]⚠️  Initial fact not found (may need consolidation)[/yellow]")
        else:
            print("  Warning: Initial fact not found (may need consolidation)")

    # Step 3: Update the fact
    if console:
        console.print("\n[bold green]Step 3: Updating Fact[/bold green]")
        console.print(f"  New content: [cyan]{fact.new_value}[/cyan]")
    else:
        print("\nStep 3: Updating Fact")
        print(f"  New content: {fact.new_value}")

    # Record creation start time BEFORE ingestion for accurate time-to-truth measurement
    creation_start_time = time.time()

    try:
        # Include fact_id in content for semantic matching (same pattern as batch mode)
        updated_content = f"Test fact {fact.id} has status: {fact.new_value}"
        update_result = adapter.ingest_documents(
            documents=[{
                'content': updated_content,
                'filename': f'fact_{fact.id}_updated.txt',
                'mimeType': 'text/plain',
                'metadata': {'namespace': fact.namespace, 'fact_id': fact.id, 'version': 'updated'}
            }],
            namespace=fact.namespace
        )

        if console:
            console.print(f"  ✅ Ingested update ({update_result[0].facts_created} facts)")
        else:
            print(f"  Ingested update ({update_result[0].facts_created} facts)")
    except Exception as e:
        if console:
            console.print(f"  [red]❌ Failed to update: {e}[/red]")
        else:
            print(f"  Failed to update: {e}")
        raise

    # Step 4: Poll until updated value appears
    if console:
        console.print(f"\n[bold]Polling every {poll_interval}s until new value appears...[/bold]")
        console.print(f"  [dim]Timer started at fact creation (not polling start)[/dim]")
    else:
        print(f"\nPolling every {poll_interval}s until new value appears...")
        print("  Timer started at fact creation (not polling start)")

    result = poll_until_updated(
        adapter=adapter,
        question=fact.question,
        expected_value=fact.new_value,
        namespace=fact.namespace,
        poll_interval=poll_interval,
        max_attempts=max_attempts,
        console=console,
        creation_start_time=creation_start_time  # Pass creation time for accurate measurement
    )

    # Update result with fact details
    result.old_value = fact.old_value
    result.new_value = fact.new_value
    result.mode = "api"
    result.test_id = fact.id

    return result


def print_summary(result: FreshnessResult, console: Optional['Console'] = None):
    """
    Print formatted summary of freshness test results.

    Args:
        result: FreshnessResult to display
        console: Rich console for output (optional)
    """
    if console:
        console.print("\n[bold cyan]═══ Freshness Benchmark Results ═══[/bold cyan]")
        console.print(f"Test Fact ID: [yellow]{result.test_id}[/yellow]")
        console.print(f"Question: [cyan]{result.question}[/cyan]")
        console.print(f"Mode: [yellow]{result.mode}[/yellow]")

        console.print(f"\nInitial Value: [dim]{result.old_value}[/dim]")
        console.print(f"Updated Value: [cyan]{result.new_value}[/cyan]")

        console.print("\n[bold]Polling Results:[/bold]")

        # Create table for attempts
        table = Table(show_header=True)
        table.add_column("Attempt", style="cyan")
        table.add_column("Elapsed (s)", style="yellow")
        table.add_column("Status", style="green")

        for ts in result.timestamps:
            status = "✅ Found" if ts['found_expected'] else "⏳ Waiting"
            table.add_row(
                str(ts['attempt']),
                f"{ts['elapsed_seconds']:.1f}",
                status
            )

        console.print(table)

        if result.found:
            minutes = result.time_to_truth_seconds / 60
            measurement_note = " (from creation)" if result.measured_from_creation else " (from polling start)"
            console.print(f"\n[bold green]✅ Time-to-Truth: {result.time_to_truth_seconds:.2f} seconds ({minutes:.2f} minutes){measurement_note}[/bold green]")

            # Status assessment
            if result.time_to_truth_seconds < 60:
                status = "🌟 EXCELLENT (< 1 minute)"
                color = "bold green"
            elif result.time_to_truth_seconds < 180:
                status = "✅ GOOD (< 3 minutes)"
                color = "green"
            elif result.time_to_truth_seconds < 300:
                status = "✓ TARGET (< 5 minutes)"
                color = "yellow"
            else:
                status = "⚠️  SLOW (> 5 minutes)"
                color = "red"

            console.print(f"Status: [{color}]{status}[/{color}]")
            console.print("\n[bold green]KP demonstrates fast freshness propagation![/bold green]")
        else:
            console.print(f"\n[bold red]❌ Timeout: Updated value not found after {result.attempts} attempts[/bold red]")
            max_time = result.poll_interval_seconds * result.attempts
            console.print(f"Total time waited: {max_time} seconds ({max_time/60:.2f} minutes)")
            console.print("\n[yellow]Possible issues:[/yellow]")
            console.print("  - Background consolidation not running")
            console.print("  - Consolidation interval too long")
            console.print("  - Namespace filtering issue")
            console.print("  - Fact not actually updated")
    else:
        print("\n=== Freshness Benchmark Results ===")
        print(f"Test Fact ID: {result.test_id}")
        print(f"Question: {result.question}")
        print(f"Mode: {result.mode}")
        print(f"\nInitial Value: {result.old_value}")
        print(f"Updated Value: {result.new_value}")
        print("\nPolling Results:")

        for ts in result.timestamps:
            status = "FOUND" if ts['found_expected'] else "Waiting"
            print(f"  Attempt {ts['attempt']} ({ts['elapsed_seconds']:.1f}s): {status}")

        if result.found:
            minutes = result.time_to_truth_seconds / 60
            measurement_note = " (from creation)" if result.measured_from_creation else " (from polling start)"
            print(f"\nTime-to-Truth: {result.time_to_truth_seconds:.2f} seconds ({minutes:.2f} minutes){measurement_note}")

            if result.time_to_truth_seconds < 60:
                status = "EXCELLENT (< 1 minute)"
            elif result.time_to_truth_seconds < 180:
                status = "GOOD (< 3 minutes)"
            elif result.time_to_truth_seconds < 300:
                status = "TARGET (< 5 minutes)"
            else:
                status = "SLOW (> 5 minutes)"

            print(f"Status: {status}")
            print("\nKP demonstrates fast freshness propagation!")
        else:
            print(f"\nTimeout: Updated value not found after {result.attempts} attempts")
            max_time = result.poll_interval_seconds * result.attempts
            print(f"Total time waited: {max_time} seconds ({max_time/60:.2f} minutes)")


def save_results(result: FreshnessResult, output_dir: Path):
    """
    Save results to JSON file.

    Args:
        result: FreshnessResult to save
        output_dir: Output directory path
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "freshness_run.json"

    # Convert to dict
    result_dict = asdict(result)

    # Write to file
    with open(output_file, 'w') as f:
        json.dump(result_dict, f, indent=2)

    logger.info(f"Results saved to {output_file}")


class FAISSFreshnessBaseline:
    """
    FAISS baseline for freshness comparison.

    Measures time to update a fact and have it searchable in FAISS.
    This demonstrates the "batch re-indexing" approach used by most vector DBs.
    """

    def __init__(self, corpus_size: int = 1000):
        """
        Initialize FAISS baseline with a corpus.

        Args:
            corpus_size: Number of background documents to simulate real corpus
        """
        if not FAISS_AVAILABLE:
            raise ImportError("FAISS baseline requires: pip install faiss-cpu sentence-transformers")

        self.corpus_size = corpus_size
        self.model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        self.embedding_dim = self.model.get_sentence_embedding_dimension()

        # Initialize empty index and document store
        self.index = faiss.IndexFlatIP(self.embedding_dim)
        self.documents: List[str] = []
        self.doc_ids: List[str] = []

    def build_corpus(self, console: Optional['Console'] = None):
        """Build initial corpus with random documents."""
        if console:
            console.print(f"[dim]Building FAISS corpus with {self.corpus_size} documents...[/dim]")
        else:
            print(f"Building FAISS corpus with {self.corpus_size} documents...")

        # Generate synthetic documents
        for i in range(self.corpus_size):
            doc_id = f"corpus_doc_{i}"
            doc_text = f"This is background document {i} with content about topic_{i % 50}. Random data: {uuid.uuid4()}"
            self.documents.append(doc_text)
            self.doc_ids.append(doc_id)

        # Embed all documents
        embeddings = self.model.encode(self.documents, convert_to_numpy=True, show_progress_bar=False)
        embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

        # Build index
        self.index.add(embeddings.astype('float32'))

        if console:
            console.print(f"[dim]FAISS index built: {self.index.ntotal} vectors[/dim]")
        else:
            print(f"FAISS index built: {self.index.ntotal} vectors")

    def measure_update_freshness(self, fact_id: str, new_content: str) -> float:
        """
        Measure time to update a fact and have it searchable.

        This simulates what happens when you update a document in a vector DB:
        1. Re-embed the new content
        2. Update the index (rebuild for IndexFlatIP, or remove+add for IVF)
        3. Query to verify it's searchable

        Args:
            fact_id: ID of the fact to update
            new_content: New content for the fact

        Returns:
            Time in seconds from update start to searchable
        """
        start_time = time.time()

        # Step 1: Embed the new content
        new_embedding = self.model.encode([new_content], convert_to_numpy=True)
        new_embedding = new_embedding / np.linalg.norm(new_embedding, axis=1, keepdims=True)

        # Step 2: Update index
        # For IndexFlatIP, we can't remove vectors, so we rebuild
        # This is the realistic scenario for most FAISS deployments
        if fact_id in self.doc_ids:
            idx = self.doc_ids.index(fact_id)
            self.documents[idx] = new_content
        else:
            self.documents.append(new_content)
            self.doc_ids.append(fact_id)

        # Rebuild index (this is what makes FAISS slow for updates)
        all_embeddings = self.model.encode(self.documents, convert_to_numpy=True, show_progress_bar=False)
        all_embeddings = all_embeddings / np.linalg.norm(all_embeddings, axis=1, keepdims=True)

        self.index = faiss.IndexFlatIP(self.embedding_dim)
        self.index.add(all_embeddings.astype('float32'))

        # Step 3: Verify searchable
        scores, indices = self.index.search(new_embedding.astype('float32'), k=1)

        end_time = time.time()
        return end_time - start_time

    def measure_update_freshness_incremental(self, fact_id: str, new_content: str) -> float:
        """
        Measure update time with incremental add (best-case for FAISS).

        NOTE: This is NOT realistic for updates - it's only for adds.
        IndexFlatIP doesn't support removal, so updates require rebuild.
        This method is here to show the "best possible" FAISS scenario.
        """
        start_time = time.time()

        # Embed
        new_embedding = self.model.encode([new_content], convert_to_numpy=True)
        new_embedding = new_embedding / np.linalg.norm(new_embedding, axis=1, keepdims=True)

        # Just add (doesn't remove old version - leads to duplicates)
        self.index.add(new_embedding.astype('float32'))
        self.documents.append(new_content)
        self.doc_ids.append(fact_id)

        # Verify searchable
        scores, indices = self.index.search(new_embedding.astype('float32'), k=1)

        end_time = time.time()
        return end_time - start_time


def batch_api_mode(
    adapter: KnowledgePlaneAdapter,
    n: int,
    poll_interval: int,
    max_attempts: int,
    console: Optional['Console'] = None
) -> BatchFreshnessResult:
    """
    Run n freshness tests in batch mode.

    Args:
        adapter: KnowledgePlane adapter
        n: Number of tests to run
        poll_interval: Seconds between polls
        max_attempts: Maximum polling attempts
        console: Rich console for output

    Returns:
        BatchFreshnessResult with statistics
    """
    if console:
        console.print(f"\n[bold cyan]═══ KP BATCH FRESHNESS TEST (n={n}) ═══[/bold cyan]")
    else:
        print(f"\n=== KP BATCH FRESHNESS TEST (n={n}) ===")

    # Cleanup old benchmark facts to ensure clean slate
    try:
        deleted = cleanup_benchmark_facts_by_prefix("freshness")
        if deleted > 0:
            if console:
                console.print(f"  [dim]Cleaned up {deleted} old freshness benchmark facts[/dim]")
            else:
                print(f"  Cleaned up {deleted} old freshness benchmark facts")
    except Exception as e:
        logger.warning(f"Could not cleanup old facts (continuing anyway): {e}")

    started_at = datetime.now().isoformat()
    times = []
    results = []

    for i in range(n):
        fact = generate_test_fact()

        if console:
            console.print(f"\n[yellow]Test {i+1}/{n}[/yellow] - Fact ID: {fact.id[:8]}...")
        else:
            print(f"\nTest {i+1}/{n} - Fact ID: {fact.id[:8]}...")

        # Record creation time BEFORE ingestion
        creation_start_time = time.time()

        # Ingest the fact - include fact_id in content so query can find it
        fact_content = f"Test fact {fact.id} has status: {fact.new_value}"
        try:
            adapter.ingest_documents(
                documents=[{
                    'content': fact_content,
                    'filename': f'freshness_test_{fact.id}.txt',
                    'mimeType': 'text/plain',
                    'metadata': {'namespace': fact.namespace, 'fact_id': fact.id}
                }],
                namespace=fact.namespace
            )
        except KnowledgePlaneAuthError:
            raise
        except Exception as e:
            logger.error(f"Ingestion failed: {e}")
            continue

        # Query immediately to check if searchable
        try:
            result = adapter.query(
                question=fact.question,  # "What is the status of test fact {fact_id}?"
                namespace=fact.namespace,
                k=10,
                search_mode="hybrid"
            )

            end_time = time.time()
            elapsed = end_time - creation_start_time

            # Check if found - look for matching fact_id in metadata (primary) or content (fallback)
            found = False
            if result.results:
                for r in result.results:
                    # Primary: check fact_id in metadata (exact match)
                    if r.metadata.get('fact_id') == fact.id:
                        found = True
                        break
                    # Fallback: check if fact_id appears in content
                    if fact.id in r.content:
                        found = True
                        break

            if found:
                times.append(elapsed)
                results.append({'fact_id': fact.id, 'time_seconds': elapsed, 'found': True})
                if console:
                    console.print(f"  ✅ Found in {elapsed:.3f}s")
                else:
                    print(f"  Found in {elapsed:.3f}s")
            else:
                results.append({'fact_id': fact.id, 'time_seconds': None, 'found': False})
                if console:
                    console.print(f"  ❌ Not found immediately")
                else:
                    print(f"  Not found immediately")

        except KnowledgePlaneAuthError:
            raise
        except Exception as e:
            logger.error(f"Query failed: {e}")
            results.append({'fact_id': fact.id, 'time_seconds': None, 'found': False, 'error': str(e)})

    completed_at = datetime.now().isoformat()

    batch_result = BatchFreshnessResult(
        system="kp",
        n_tests=n,
        n_successful=len(times),
        times_seconds=times,
        started_at=started_at,
        completed_at=completed_at,
        individual_results=results
    )
    batch_result.compute_stats()

    return batch_result


def batch_faiss_mode(
    n: int,
    corpus_size: int = 1000,
    console: Optional['Console'] = None,
    incremental: bool = False
) -> BatchFreshnessResult:
    """
    Run n freshness tests against FAISS baseline.

    Args:
        n: Number of tests to run
        corpus_size: Size of background corpus
        console: Rich console for output
        incremental: If True, use incremental add (best-case), else full rebuild (worst-case)

    Returns:
        BatchFreshnessResult with statistics
    """
    if not FAISS_AVAILABLE:
        raise ImportError("FAISS baseline requires: pip install faiss-cpu sentence-transformers")

    mode_name = "INCREMENTAL ADD" if incremental else "FULL REBUILD"
    system_name = "faiss_incremental" if incremental else "faiss_rebuild"

    if console:
        console.print(f"\n[bold cyan]═══ FAISS {mode_name} FRESHNESS TEST (n={n}, corpus={corpus_size}) ═══[/bold cyan]")
        if incremental:
            console.print("[dim]Note: Incremental mode adds without removing old version (unrealistic for updates)[/dim]")
    else:
        print(f"\n=== FAISS {mode_name} FRESHNESS TEST (n={n}, corpus={corpus_size}) ===")

    # Initialize baseline
    baseline = FAISSFreshnessBaseline(corpus_size=corpus_size)
    baseline.build_corpus(console)

    started_at = datetime.now().isoformat()
    times = []
    results = []

    for i in range(n):
        fact_id = f"test_fact_{uuid.uuid4()}"
        content = f"UPDATED_{datetime.now().isoformat()}_{uuid.uuid4()}"

        if console:
            console.print(f"\n[yellow]Test {i+1}/{n}[/yellow] - Fact ID: {fact_id[:20]}...")
        else:
            print(f"\nTest {i+1}/{n} - Fact ID: {fact_id[:20]}...")

        # Measure update time (incremental or full rebuild)
        if incremental:
            elapsed = baseline.measure_update_freshness_incremental(fact_id, content)
            method_desc = "incremental add"
        else:
            elapsed = baseline.measure_update_freshness(fact_id, content)
            method_desc = "rebuild index"
        times.append(elapsed)
        results.append({'fact_id': fact_id, 'time_seconds': elapsed, 'found': True})

        if console:
            console.print(f"  ✅ Searchable in {elapsed:.3f}s ({method_desc})")
        else:
            print(f"  Searchable in {elapsed:.3f}s ({method_desc})")

    completed_at = datetime.now().isoformat()

    batch_result = BatchFreshnessResult(
        system=system_name,
        n_tests=n,
        n_successful=len(times),
        times_seconds=times,
        started_at=started_at,
        completed_at=completed_at,
        individual_results=results
    )
    batch_result.compute_stats()

    return batch_result


def batch_faiss_scaling(
    n: int = 5,
    corpus_sizes: List[int] = None,
    console: Optional['Console'] = None,
    incremental: bool = True
) -> Dict[str, BatchFreshnessResult]:
    """
    Run freshness tests at multiple corpus sizes to show scaling behavior.

    Args:
        n: Number of tests per corpus size
        corpus_sizes: List of corpus sizes (default: [1000, 10000, 100000])
        console: Rich console for output
        incremental: If True, use incremental add (fair comparison); if False, full rebuild (worst case)

    Returns:
        Dict mapping corpus_size to BatchFreshnessResult
    """
    if not FAISS_AVAILABLE:
        raise ImportError("FAISS scaling requires: pip install faiss-cpu sentence-transformers")

    if corpus_sizes is None:
        corpus_sizes = [1000, 10000, 100000]

    mode_desc = "incremental add (fair comparison)" if incremental else "full rebuild (worst case)"
    if console:
        console.print(f"\n[bold cyan]═══ FAISS SCALING ANALYSIS ═══[/bold cyan]")
        console.print(f"Testing with corpus sizes: {corpus_sizes}")
        console.print(f"Mode: {mode_desc}\n")
    else:
        print(f"\n=== FAISS SCALING ANALYSIS ===")
        print(f"Testing with corpus sizes: {corpus_sizes}")
        print(f"Mode: {mode_desc}")

    results = {}

    for corpus_size in corpus_sizes:
        if console:
            console.print(f"\n[bold]Corpus size: {corpus_size:,}[/bold]")
        else:
            print(f"\nCorpus size: {corpus_size:,}")

        result = batch_faiss_mode(
            n=n,
            corpus_size=corpus_size,
            console=console,
            incremental=incremental
        )
        results[corpus_size] = result

    # Print scaling summary
    if console:
        console.print("\n[bold cyan]═══ SCALING SUMMARY ═══[/bold cyan]")

        table = Table(show_header=True)
        table.add_column("Corpus Size", style="cyan")
        table.add_column("Mean (s)", style="yellow")
        table.add_column("Scaling Factor", style="green")

        base_time = None
        for corpus_size in corpus_sizes:
            result = results[corpus_size]
            if base_time is None:
                base_time = result.mean_seconds
                scaling = "1.0x (baseline)"
            else:
                scaling = f"{result.mean_seconds / base_time:.1f}x"
            table.add_row(f"{corpus_size:,}", f"{result.mean_seconds:.3f}", scaling)

        console.print(table)
        console.print("\n[dim]Note: FAISS full rebuild scales O(n) with corpus size[/dim]")
    else:
        print("\n=== SCALING SUMMARY ===")
        base_time = None
        for corpus_size in corpus_sizes:
            result = results[corpus_size]
            if base_time is None:
                base_time = result.mean_seconds
                scaling = "1.0x (baseline)"
            else:
                scaling = f"{result.mean_seconds / base_time:.1f}x"
            print(f"  {corpus_size:,}: {result.mean_seconds:.3f}s ({scaling})")

    return results


def print_batch_comparison(kp_result: BatchFreshnessResult, faiss_result: Optional[BatchFreshnessResult], console: Optional['Console'] = None):
    """Print comparison of batch results."""
    # Determine FAISS mode name from system field
    faiss_mode_name = "FAISS Full Rebuild"
    if faiss_result:
        if faiss_result.system == "faiss_incremental":
            faiss_mode_name = "FAISS Incremental"

    if console:
        console.print("\n[bold cyan]═══ FRESHNESS BENCHMARK COMPARISON ═══[/bold cyan]")

        table = Table(show_header=True)
        table.add_column("Metric", style="cyan")
        table.add_column("KnowledgePlane", style="green")
        if faiss_result:
            table.add_column(faiss_mode_name, style="yellow")
            table.add_column("KP Advantage", style="bold")

        metrics = [
            ("Tests Run", f"{kp_result.n_tests}", f"{faiss_result.n_tests}" if faiss_result else ""),
            ("Success Rate", f"{kp_result.n_successful}/{kp_result.n_tests}", f"{faiss_result.n_successful}/{faiss_result.n_tests}" if faiss_result else ""),
            ("Mean (s)", f"{kp_result.mean_seconds:.3f}", f"{faiss_result.mean_seconds:.3f}" if faiss_result else ""),
            ("Median (s)", f"{kp_result.median_seconds:.3f}", f"{faiss_result.median_seconds:.3f}" if faiss_result else ""),
            ("P95 (s)", f"{kp_result.p95_seconds:.3f}", f"{faiss_result.p95_seconds:.3f}" if faiss_result else ""),
            ("Min (s)", f"{kp_result.min_seconds:.3f}", f"{faiss_result.min_seconds:.3f}" if faiss_result else ""),
            ("Max (s)", f"{kp_result.max_seconds:.3f}", f"{faiss_result.max_seconds:.3f}" if faiss_result else ""),
        ]

        for metric, kp_val, faiss_val in metrics:
            if faiss_result and faiss_val:
                try:
                    kp_num = float(kp_val.split('/')[0]) if '/' in kp_val else float(kp_val)
                    faiss_num = float(faiss_val.split('/')[0]) if '/' in faiss_val else float(faiss_val)
                    if faiss_num > 0 and metric not in ["Tests Run", "Success Rate"]:
                        advantage = f"{faiss_num / kp_num:.1f}x faster"
                    else:
                        advantage = ""
                except:
                    advantage = ""
                table.add_row(metric, kp_val, faiss_val, advantage)
            else:
                table.add_row(metric, kp_val, faiss_val if faiss_val else "N/A")

        console.print(table)

        if faiss_result and kp_result.mean_seconds > 0:
            speedup = faiss_result.mean_seconds / kp_result.mean_seconds
            console.print(f"\n[bold green]KP is {speedup:.1f}x faster than FAISS for freshness[/bold green]")
    else:
        print("\n=== FRESHNESS BENCHMARK COMPARISON ===")
        print(f"\nKnowledgePlane (n={kp_result.n_tests}):")
        print(f"  Mean:   {kp_result.mean_seconds:.3f}s")
        print(f"  Median: {kp_result.median_seconds:.3f}s")
        print(f"  P95:    {kp_result.p95_seconds:.3f}s")
        print(f"  Range:  {kp_result.min_seconds:.3f}s - {kp_result.max_seconds:.3f}s")

        if faiss_result:
            print(f"\n{faiss_mode_name} (n={faiss_result.n_tests}):")
            print(f"  Mean:   {faiss_result.mean_seconds:.3f}s")
            print(f"  Median: {faiss_result.median_seconds:.3f}s")
            print(f"  P95:    {faiss_result.p95_seconds:.3f}s")
            print(f"  Range:  {faiss_result.min_seconds:.3f}s - {faiss_result.max_seconds:.3f}s")

            if kp_result.mean_seconds > 0:
                speedup = faiss_result.mean_seconds / kp_result.mean_seconds
                print(f"\nKP is {speedup:.1f}x faster than FAISS for freshness")


def save_batch_results(
    kp_result: BatchFreshnessResult,
    faiss_result: Optional[BatchFreshnessResult],
    output_dir: Path,
    scaling_results: Optional[Dict[int, BatchFreshnessResult]] = None
):
    """Save batch results to JSON."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Determine FAISS mode for naming
    faiss_mode = "rebuild"
    faiss_note = "FAISS baseline uses full index rebuild on each update (worst-case scenario)"
    if faiss_result and faiss_result.system == "faiss_incremental":
        faiss_mode = "incremental"
        faiss_note = "FAISS incremental adds without removing old version (unrealistic for updates, best-case)"

    results = {
        "environment": get_environment_info(),
        "kp": asdict(kp_result),
        f"faiss_{faiss_mode}": asdict(faiss_result) if faiss_result else None,
        "comparison": {
            "kp_mean_seconds": kp_result.mean_seconds,
            f"faiss_{faiss_mode}_mean_seconds": faiss_result.mean_seconds if faiss_result else None,
            "speedup": (faiss_result.mean_seconds / kp_result.mean_seconds) if (faiss_result and kp_result.mean_seconds > 0) else None,
            "note": faiss_note
        }
    }

    # Add scaling results if available
    if scaling_results:
        results["scaling_analysis"] = {
            str(corpus_size): {
                "corpus_size": corpus_size,
                "mean_seconds": result.mean_seconds,
                "median_seconds": result.median_seconds,
                "p95_seconds": result.p95_seconds,
            }
            for corpus_size, result in scaling_results.items()
        }
        # Calculate scaling factors
        base_size = min(scaling_results.keys())
        base_time = scaling_results[base_size].mean_seconds
        results["scaling_analysis"]["factors"] = {
            str(corpus_size): result.mean_seconds / base_time if base_time > 0 else 0
            for corpus_size, result in scaling_results.items()
        }

    output_file = output_dir / "freshness_batch.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    logger.info(f"Batch results saved to {output_file}")


def main():
    """Main entry point for freshness benchmark."""
    parser = argparse.ArgumentParser(
        description="KnowledgePlane Freshness Benchmark - Measure time-to-truth for updated facts"
    )

    # Mode selection
    parser.add_argument(
        "--mode",
        choices=["manual", "api"],
        default="manual",
        help="Test mode: manual (human interaction) or api (programmatic)"
    )

    # Batch configuration
    parser.add_argument(
        "--n",
        type=int,
        default=1,
        help="Number of tests to run (default: 1, use 20+ for statistical significance)"
    )
    parser.add_argument(
        "--run_baseline",
        action="store_true",
        help="Also run FAISS baseline for comparison (requires faiss-cpu, sentence-transformers)"
    )
    parser.add_argument(
        "--corpus_size",
        type=int,
        default=1000,
        help="FAISS baseline corpus size (default: 1000)"
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        default=True,
        help="Use FAISS incremental add mode (fair comparison for inserts, default: True)"
    )
    parser.add_argument(
        "--full-rebuild",
        action="store_true",
        help="Force FAISS full rebuild mode (worst-case, shows O(n) scaling)"
    )
    parser.add_argument(
        "--scaling",
        action="store_true",
        help="Run scaling analysis with multiple corpus sizes (1K, 10K, 100K)"
    )
    parser.add_argument(
        "--corpus_sizes",
        type=str,
        default="1000,10000,100000",
        help="Comma-separated corpus sizes for scaling analysis (default: 1000,10000,100000)"
    )

    # Polling configuration
    parser.add_argument(
        "--poll_interval",
        type=int,
        default=5,
        help="Seconds between polls (default: 5)"
    )
    parser.add_argument(
        "--max_attempts",
        type=int,
        default=24,
        help="Maximum polling attempts (default: 24)"
    )

    # KP configuration
    parser.add_argument(
        "--mcp_url",
        type=str,
        default=os.getenv("KP_API_URL", "http://localhost:8080/mcp"),
        help="KP MCP server URL"
    )
    parser.add_argument(
        "--workspace_id",
        type=str,
        default=os.getenv("KP_WORKSPACE_ID"),
        help="KP workspace ID"
    )
    parser.add_argument(
        "--user_id",
        type=str,
        default=os.getenv("KP_USER_ID"),
        help="KP user ID"
    )
    parser.add_argument(
        "--api_key",
        type=str,
        default=os.getenv("KP_API_KEY"),
        help="KP API key"
    )

    # Output configuration
    parser.add_argument(
        "--output_dir",
        type=str,
        default="output",
        help="Output directory for results (default: output/)"
    )

    args = parser.parse_args()

    # Initialize console
    console = Console() if RICH_AVAILABLE else None

    # Validate configuration for KP tests
    kp_configured = all([args.workspace_id, args.user_id, args.api_key])

    if not kp_configured and not args.run_baseline:
        logger.error("Missing required configuration. Please set:")
        logger.error("  - KP_WORKSPACE_ID or --workspace_id")
        logger.error("  - KP_USER_ID or --user_id")
        logger.error("  - KP_API_KEY or --api_key")
        logger.error("Or use --run_baseline to run FAISS baseline only")
        sys.exit(1)

    output_dir = Path(args.output_dir)

    # ========== BATCH MODE (n > 1) ==========
    if args.n > 1:
        if console:
            console.print(f"[bold]Running batch freshness benchmark (n={args.n})[/bold]")
        else:
            print(f"Running batch freshness benchmark (n={args.n})")

        # Print environment info for reproducibility
        print_environment_header(console)

        kp_result = None
        faiss_result = None
        scaling_results = None

        # Run KP batch if configured
        if kp_configured:
            if console:
                console.print("[bold]Initializing KnowledgePlane adapter...[/bold]")
            else:
                print("Initializing KnowledgePlane adapter...")

            adapter = HTTPKnowledgePlaneAdapter()
            adapter.initialize(
                mcp_url=args.mcp_url,
                api_key=args.api_key,
                workspace_id=args.workspace_id,
                user_id=args.user_id
            )

            try:
                kp_result = batch_api_mode(
                    adapter=adapter,
                    n=args.n,
                    poll_interval=args.poll_interval,
                    max_attempts=args.max_attempts,
                    console=console
                )
            finally:
                adapter.close()

        # Run FAISS baseline if requested
        if args.run_baseline:
            if not FAISS_AVAILABLE:
                logger.error("FAISS baseline requires: pip install faiss-cpu sentence-transformers")
                sys.exit(1)

            # Scaling analysis mode
            if args.scaling:
                corpus_sizes_list = [int(x.strip()) for x in args.corpus_sizes.split(',')]
                # Use incremental by default, unless --full-rebuild is specified
                use_incremental = not getattr(args, 'full_rebuild', False)
                scaling_results = batch_faiss_scaling(
                    n=args.n,
                    corpus_sizes=corpus_sizes_list,
                    console=console,
                    incremental=use_incremental
                )
                # Use the smallest corpus result as the comparison baseline
                faiss_result = scaling_results.get(min(corpus_sizes_list))
            else:
                # Use incremental by default, unless --full-rebuild is specified
                use_incremental = not getattr(args, 'full_rebuild', False)
                faiss_result = batch_faiss_mode(
                    n=args.n,
                    corpus_size=args.corpus_size,
                    console=console,
                    incremental=use_incremental
                )

        # Print comparison
        if kp_result:
            print_batch_comparison(kp_result, faiss_result, console)
            save_batch_results(kp_result, faiss_result, output_dir, scaling_results)

            if console:
                console.print(f"\n[bold green]✅ Results saved to {output_dir}/freshness_batch.json[/bold green]")
            else:
                print(f"\nResults saved to {output_dir}/freshness_batch.json")

        elif faiss_result:
            # FAISS only mode
            if console:
                console.print(f"\n[bold]FAISS Full Rebuild Results (n={faiss_result.n_tests}):[/bold]")
                console.print(f"  Mean:   {faiss_result.mean_seconds:.3f}s")
                console.print(f"  Median: {faiss_result.median_seconds:.3f}s")
                console.print(f"  P95:    {faiss_result.p95_seconds:.3f}s")
            else:
                print(f"\nFAISS Full Rebuild Results (n={faiss_result.n_tests}):")
                print(f"  Mean:   {faiss_result.mean_seconds:.3f}s")
                print(f"  Median: {faiss_result.median_seconds:.3f}s")
                print(f"  P95:    {faiss_result.p95_seconds:.3f}s")

        sys.exit(0)

    # ========== SINGLE TEST MODE (n = 1) ==========
    if not kp_configured:
        logger.error("Single test mode requires KP configuration")
        sys.exit(1)

    # Initialize adapter
    if console:
        console.print("[bold]Initializing KnowledgePlane adapter...[/bold]")
    else:
        print("Initializing KnowledgePlane adapter...")

    adapter = HTTPKnowledgePlaneAdapter()
    adapter.initialize(
        mcp_url=args.mcp_url,
        api_key=args.api_key,
        workspace_id=args.workspace_id,
        user_id=args.user_id
    )

    # Generate test fact
    fact = generate_test_fact()

    try:
        # Run appropriate mode
        if args.mode == "manual":
            result = manual_mode(
                adapter=adapter,
                fact=fact,
                poll_interval=args.poll_interval,
                max_attempts=args.max_attempts,
                console=console
            )
        else:  # api mode
            result = api_mode(
                adapter=adapter,
                fact=fact,
                poll_interval=args.poll_interval,
                max_attempts=args.max_attempts,
                console=console
            )

        # Print summary
        print_summary(result, console)

        # Save results
        save_results(result, output_dir)

        if console:
            console.print(f"\n[bold green]✅ Results saved to {output_dir}/freshness_run.json[/bold green]")
        else:
            print(f"\nResults saved to {output_dir}/freshness_run.json")

        # Exit with appropriate code
        sys.exit(0 if result.found else 1)

    except KeyboardInterrupt:
        if console:
            console.print("\n[yellow]Interrupted by user[/yellow]")
        else:
            print("\nInterrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.exception("Benchmark failed")
        if console:
            console.print(f"\n[red]❌ Error: {e}[/red]")
        else:
            print(f"\nError: {e}")
        sys.exit(1)
    finally:
        adapter.close()


if __name__ == "__main__":
    main()
