#!/usr/bin/env python3
"""
Demo script for freshness benchmark using mock adapter.

This demonstrates the freshness benchmark without requiring a live
KnowledgePlane instance. Shows both manual and API modes with
simulated delays.
"""

import time
from pathlib import Path

from bench_freshness import (
    FreshnessResult,
    generate_test_fact,
    poll_until_updated,
    print_summary,
    save_results,
)
from kp_adapter import MockKnowledgePlaneAdapter

try:
    from rich.console import Console
    console = Console()
except ImportError:
    console = None
    print("Note: Install 'rich' for colored output: pip install rich")


def demo_instant_update():
    """Demo: Fact appears immediately (< 1 minute = EXCELLENT)."""
    if console:
        console.print("\n[bold cyan]═══ DEMO 1: Instant Update (EXCELLENT) ═══[/bold cyan]")
    else:
        print("\n=== DEMO 1: Instant Update (EXCELLENT) ===")

    # Initialize mock adapter
    adapter = MockKnowledgePlaneAdapter()
    adapter.initialize(
        mcp_url="http://localhost:8080",
        api_key="demo_key",
        workspace_id="demo_workspace",
        user_id="demo_user"
    )

    # Generate test fact
    fact = generate_test_fact()

    if console:
        console.print(f"[yellow]Test Fact ID:[/yellow] {fact.id}")
        console.print(f"[yellow]Question:[/yellow] {fact.question}")
        console.print(f"\n[bold]Step 1:[/bold] Ingesting initial fact...")
    else:
        print(f"Test Fact ID: {fact.id}")
        print(f"Question: {fact.question}")
        print("\nStep 1: Ingesting initial fact...")

    # Ingest initial fact
    adapter.ingest_documents(
        documents=[{
            'content': fact.old_value,
            'filename': f'fact_{fact.id}.txt',
            'metadata': {'namespace': fact.namespace}
        }],
        namespace=fact.namespace
    )

    if console:
        console.print("[bold]Step 2:[/bold] Updating fact...")
    else:
        print("Step 2: Updating fact...")

    # Immediately ingest updated fact (simulates instant propagation)
    adapter.ingest_documents(
        documents=[{
            'content': fact.new_value,
            'filename': f'fact_{fact.id}_updated.txt',
            'metadata': {'namespace': fact.namespace}
        }],
        namespace=fact.namespace
    )

    if console:
        console.print("[bold]Step 3:[/bold] Polling for updated value...")
    else:
        print("Step 3: Polling for updated value...")

    # Poll (should find immediately)
    result = poll_until_updated(
        adapter=adapter,
        question=fact.question,
        expected_value=fact.new_value,
        namespace=fact.namespace,
        poll_interval=5,
        max_attempts=10,
        console=console
    )

    result.test_id = fact.id
    result.old_value = fact.old_value
    result.new_value = fact.new_value
    result.mode = "demo_instant"

    # Print summary
    print_summary(result, console)

    return result


def demo_delayed_update():
    """Demo: Fact appears after 2 minutes (GOOD)."""
    if console:
        console.print("\n[bold cyan]═══ DEMO 2: Delayed Update (GOOD) ═══[/bold cyan]")
    else:
        print("\n=== DEMO 2: Delayed Update (GOOD) ===")

    # Initialize mock adapter
    adapter = MockKnowledgePlaneAdapter()
    adapter.initialize(
        mcp_url="http://localhost:8080",
        api_key="demo_key",
        workspace_id="demo_workspace",
        user_id="demo_user"
    )

    # Generate test fact
    fact = generate_test_fact()

    if console:
        console.print(f"[yellow]Test Fact ID:[/yellow] {fact.id}")
        console.print(f"[yellow]Question:[/yellow] {fact.question}")
        console.print(f"\n[bold]Step 1:[/bold] Ingesting initial fact...")
    else:
        print(f"Test Fact ID: {fact.id}")
        print(f"Question: {fact.question}")
        print("\nStep 1: Ingesting initial fact...")

    # Ingest initial fact
    adapter.ingest_documents(
        documents=[{
            'content': fact.old_value,
            'filename': f'fact_{fact.id}.txt',
            'metadata': {'namespace': fact.namespace}
        }],
        namespace=fact.namespace
    )

    if console:
        console.print("[bold]Step 2:[/bold] Updating fact (with 2-minute delay simulation)...")
    else:
        print("Step 2: Updating fact (with 2-minute delay simulation)...")

    # Create delayed query function
    call_count = [0]
    original_query = adapter.query
    update_ingested = [False]

    def delayed_query(question, namespace=None, k=5, search_mode="hybrid"):
        call_count[0] += 1
        # Simulate 2-minute delay (appears on 3rd poll at 10s interval = ~30s)
        # But we'll pretend it's 2 minutes for the demo
        if call_count[0] == 3 and not update_ingested[0]:
            adapter.ingest_documents(
                documents=[{
                    'content': fact.new_value,
                    'filename': f'fact_{fact.id}_updated.txt',
                    'metadata': {'namespace': namespace}
                }],
                namespace=namespace
            )
            update_ingested[0] = True
        return original_query(question, namespace, k, search_mode)

    adapter.query = delayed_query

    if console:
        console.print("[bold]Step 3:[/bold] Polling for updated value...")
    else:
        print("Step 3: Polling for updated value...")

    # Poll with short interval for demo
    result = poll_until_updated(
        adapter=adapter,
        question=fact.question,
        expected_value=fact.new_value,
        namespace=fact.namespace,
        poll_interval=5,  # 5 seconds for demo
        max_attempts=10,
        console=console
    )

    result.test_id = fact.id
    result.old_value = fact.old_value
    result.new_value = fact.new_value
    result.mode = "demo_delayed"

    # Adjust time to reflect 2-minute scenario
    if result.found:
        result.time_to_truth_seconds = 120  # Pretend it was 2 minutes

    # Print summary
    print_summary(result, console)

    return result


def demo_timeout():
    """Demo: Update never appears (timeout)."""
    if console:
        console.print("\n[bold cyan]═══ DEMO 3: Timeout Scenario ═══[/bold cyan]")
    else:
        print("\n=== DEMO 3: Timeout Scenario ===")

    # Initialize mock adapter
    adapter = MockKnowledgePlaneAdapter()
    adapter.initialize(
        mcp_url="http://localhost:8080",
        api_key="demo_key",
        workspace_id="demo_workspace",
        user_id="demo_user"
    )

    # Generate test fact
    fact = generate_test_fact()

    if console:
        console.print(f"[yellow]Test Fact ID:[/yellow] {fact.id}")
        console.print(f"[yellow]Question:[/yellow] {fact.question}")
        console.print(f"\n[bold]Step 1:[/bold] Ingesting initial fact...")
    else:
        print(f"Test Fact ID: {fact.id}")
        print(f"Question: {fact.question}")
        print("\nStep 1: Ingesting initial fact...")

    # Ingest initial fact only (no update)
    adapter.ingest_documents(
        documents=[{
            'content': fact.old_value,
            'filename': f'fact_{fact.id}.txt',
            'metadata': {'namespace': fact.namespace}
        }],
        namespace=fact.namespace
    )

    if console:
        console.print("[bold]Step 2:[/bold] Simulating update that never propagates...")
        console.print("[bold]Step 3:[/bold] Polling for updated value (will timeout)...")
    else:
        print("Step 2: Simulating update that never propagates...")
        print("Step 3: Polling for updated value (will timeout)...")

    # Poll (will never find the update)
    result = poll_until_updated(
        adapter=adapter,
        question=fact.question,
        expected_value=fact.new_value,
        namespace=fact.namespace,
        poll_interval=3,  # Short interval for demo
        max_attempts=5,  # Few attempts
        console=console
    )

    result.test_id = fact.id
    result.old_value = fact.old_value
    result.new_value = fact.new_value
    result.mode = "demo_timeout"

    # Print summary
    print_summary(result, console)

    return result


def main():
    """Run all demos."""
    if console:
        console.print("[bold green]KnowledgePlane Freshness Benchmark - Demo[/bold green]")
        console.print("This demo shows the freshness benchmark in action using a mock adapter.")
        console.print("No live KnowledgePlane instance required!\n")
    else:
        print("KnowledgePlane Freshness Benchmark - Demo")
        print("This demo shows the freshness benchmark in action using a mock adapter.")
        print("No live KnowledgePlane instance required!\n")

    results = []

    # Run demos
    try:
        results.append(demo_instant_update())
        time.sleep(1)

        results.append(demo_delayed_update())
        time.sleep(1)

        results.append(demo_timeout())

    except KeyboardInterrupt:
        if console:
            console.print("\n[yellow]Demo interrupted by user[/yellow]")
        else:
            print("\nDemo interrupted by user")
        return

    # Save results
    output_dir = Path("output/demo")
    output_dir.mkdir(parents=True, exist_ok=True)

    for i, result in enumerate(results, 1):
        save_results(result, output_dir / f"demo_{i}")

    if console:
        console.print(f"\n[bold green]✅ Demo results saved to {output_dir}/[/bold green]")
    else:
        print(f"\nDemo results saved to {output_dir}/")

    # Summary
    if console:
        console.print("\n[bold cyan]═══ Demo Summary ═══[/bold cyan]")
        console.print("The freshness benchmark measures time-to-truth for KnowledgePlane:")
        console.print("  • [green]EXCELLENT:[/green] < 1 minute")
        console.print("  • [green]GOOD:[/green] < 3 minutes")
        console.print("  • [yellow]TARGET:[/yellow] < 5 minutes")
        console.print("  • [red]SLOW:[/red] > 5 minutes")
        console.print("\nTo test with a live KnowledgePlane instance:")
        console.print("  [cyan]python bench_freshness.py --mode manual[/cyan]")
        console.print("  [cyan]python bench_freshness.py --mode api[/cyan]")
    else:
        print("\n=== Demo Summary ===")
        print("The freshness benchmark measures time-to-truth for KnowledgePlane:")
        print("  • EXCELLENT: < 1 minute")
        print("  • GOOD: < 3 minutes")
        print("  • TARGET: < 5 minutes")
        print("  • SLOW: > 5 minutes")
        print("\nTo test with a live KnowledgePlane instance:")
        print("  python bench_freshness.py --mode manual")
        print("  python bench_freshness.py --mode api")


if __name__ == "__main__":
    main()
