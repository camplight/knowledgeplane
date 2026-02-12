#!/usr/bin/env python3
"""
Freshness "Time-to-Truth" Benchmark for KnowledgePlane

This benchmark measures how quickly KnowledgePlane reflects updated facts
by measuring the time between fact ingestion/update and when the fact
becomes retrievable via search.

Two modes:
1. Manual mode: Prints instructions for human to inject/update facts
2. API mode: Programmatically injects and updates facts via KP adapter

Success Criteria:
- Excellent: < 1 minute time-to-truth
- Good: < 3 minutes
- Target: < 5 minutes
"""

import argparse
import json
import logging
import os
import sys
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

try:
    from rich.console import Console
    from rich.table import Table
    from rich.progress import Progress, SpinnerColumn, TextColumn
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    print("Note: Install 'rich' for colored output: pip install rich")

from kp_adapter import (
    HTTPKnowledgePlaneAdapter,
    KnowledgePlaneAdapter,
    QueryResult,
)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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
    console: Optional['Console'] = None
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

    Returns:
        FreshnessResult with timing and attempt data
    """
    start_time = time.time()
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
                    timestamps=timestamps
                )

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
        timestamps=timestamps
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
        console.print("  Press ENTER when updated...")
    else:
        print("\nStep 3: Update the Fact")
        print(f"  New content: {fact.new_value}")
        print("  Update the fact in KnowledgePlane")
        print("  Press ENTER when updated...")

    input()

    # Poll until updated value appears
    if console:
        console.print(f"\n[bold]Polling every {poll_interval}s until new value appears...[/bold]")
    else:
        print(f"\nPolling every {poll_interval}s until new value appears...")

    start_time = time.time()
    result = poll_until_updated(
        adapter=adapter,
        question=fact.question,
        expected_value=fact.new_value,
        namespace=fact.namespace,
        poll_interval=poll_interval,
        max_attempts=max_attempts,
        console=console
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
        ingestion_result = adapter.ingest_documents(
            documents=[{
                'content': fact.old_value,
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

    if initial_result.results and fact.old_value in initial_result.results[0].content:
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

    try:
        update_result = adapter.ingest_documents(
            documents=[{
                'content': fact.new_value,
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
    else:
        print(f"\nPolling every {poll_interval}s until new value appears...")

    result = poll_until_updated(
        adapter=adapter,
        question=fact.question,
        expected_value=fact.new_value,
        namespace=fact.namespace,
        poll_interval=poll_interval,
        max_attempts=max_attempts,
        console=console
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
            console.print(f"\n[bold green]✅ Time-to-Truth: {result.time_to_truth_seconds:.2f} seconds ({minutes:.2f} minutes)[/bold green]")

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
            print(f"\nTime-to-Truth: {result.time_to_truth_seconds:.2f} seconds ({minutes:.2f} minutes)")

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

    # Polling configuration
    parser.add_argument(
        "--poll_interval",
        type=int,
        default=30,
        help="Seconds between polls (default: 30)"
    )
    parser.add_argument(
        "--max_attempts",
        type=int,
        default=20,
        help="Maximum polling attempts (default: 20)"
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

    # Validate configuration
    if not all([args.workspace_id, args.user_id, args.api_key]):
        logger.error("Missing required configuration. Please set:")
        logger.error("  - KP_WORKSPACE_ID or --workspace_id")
        logger.error("  - KP_USER_ID or --user_id")
        logger.error("  - KP_API_KEY or --api_key")
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
        output_dir = Path(args.output_dir)
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
