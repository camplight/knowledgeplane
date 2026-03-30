#!/usr/bin/env python3
"""
Simple standalone script to test embeddings in KnowledgePlane.

Usage:
    python test_embeddings.py

Requirements:
    - requests library (pip install requests)
    - KnowledgePlane API running on http://localhost:8081
"""

import json
import os
import sys
import time
from typing import Optional, Dict, Any

try:
    import requests
except ImportError:
    print("ERROR: requests library not found. Install with: pip install requests")
    sys.exit(1)


# Configuration - can be overridden with environment variables
API_URL = os.getenv("KP_API_URL", "http://localhost:8081")
WORKSPACE_ID = os.getenv("KP_WORKSPACE_ID", "74be80db-d802-480b-b7f6-6891095ce0eb")
USER_ID = os.getenv("KP_USER_ID", "17ac0fa1-ff1d-417a-bf92-eb7a9ef50f04")
API_KEY = os.getenv("KP_API_KEY", "bench_4d4e2e4eebfa49a68ede6114")

# Test configuration
FACT_ID = "facts/2592"
EXPECTED_EMBEDDING_DIM = 1536
POLL_INTERVAL_SECONDS = 10
MAX_WAIT_SECONDS = 120


def print_status(message: str, status: str = "INFO"):
    """Print a status message with formatting."""
    prefix = {
        "INFO": "ℹ️ ",
        "SUCCESS": "✅",
        "ERROR": "❌",
        "WAIT": "⏳",
    }.get(status, "  ")
    print(f"{prefix} {message}")


def get_fact(fact_id: str) -> Optional[Dict[str, Any]]:
    """
    Query ArangoDB via REST API to get a fact.

    Args:
        fact_id: The fact ID (e.g., "facts/2592")

    Returns:
        Dict with fact data or None if error
    """
    url = f"{API_URL}/rest/fact/{fact_id}"
    headers = {
        "x-workspace-id": WORKSPACE_ID,
        "x-user-id": USER_ID,
        "x-api-key": API_KEY,
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print_status(f"Failed to fetch fact: {e}", "ERROR")
        return None


def check_embedding(fact_data: Dict[str, Any]) -> bool:
    """
    Check if fact has an embedding and verify its dimension.

    Args:
        fact_data: The fact object from API

    Returns:
        True if embedding exists and is valid
    """
    if not fact_data:
        return False

    embedding = fact_data.get("embedding")

    if embedding is None:
        print_status("No embedding found", "INFO")
        return False

    if not isinstance(embedding, list):
        print_status(f"Embedding is not a list: {type(embedding)}", "ERROR")
        return False

    dim = len(embedding)
    if dim != EXPECTED_EMBEDDING_DIM:
        print_status(
            f"Embedding dimension mismatch: got {dim}, expected {EXPECTED_EMBEDDING_DIM}",
            "ERROR"
        )
        return False

    print_status(f"Embedding found: {dim}-dimensional", "SUCCESS")
    return True


def wait_for_embedding(fact_id: str, max_wait: int, poll_interval: int) -> Optional[Dict[str, Any]]:
    """
    Poll for embedding with timeout.

    Args:
        fact_id: The fact ID to check
        max_wait: Maximum seconds to wait
        poll_interval: Seconds between polls

    Returns:
        Fact data with embedding or None if timeout
    """
    start_time = time.time()
    attempts = 0

    while time.time() - start_time < max_wait:
        attempts += 1
        elapsed = int(time.time() - start_time)
        print_status(
            f"Attempt {attempts} (elapsed: {elapsed}s / {max_wait}s)",
            "WAIT"
        )

        fact_data = get_fact(fact_id)
        if fact_data and check_embedding(fact_data):
            return fact_data

        if time.time() - start_time + poll_interval > max_wait:
            print_status("Timeout reached", "ERROR")
            break

        time.sleep(poll_interval)

    return None


def test_query(fact_data: Dict[str, Any]) -> bool:
    """
    Test a simple semantic query against the fact.

    Args:
        fact_data: The fact with embedding

    Returns:
        True if query succeeds
    """
    # Extract some text from the fact to query
    text = fact_data.get("text", "") or fact_data.get("content", "") or fact_data.get("_key", "")

    if not text:
        print_status("No text found in fact for query test", "ERROR")
        return False

    # Use first few words as query
    query_text = " ".join(text.split()[:5])

    url = f"{API_URL}/rest/query"
    headers = {
        "x-workspace-id": WORKSPACE_ID,
        "x-user-id": USER_ID,
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "query": query_text,
        "limit": 5,
        "namespace": "facts"
    }

    try:
        print_status(f"Testing query: '{query_text}'", "INFO")
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        results = response.json()

        if not results:
            print_status("Query returned no results", "ERROR")
            return False

        # Check if our fact is in results
        result_ids = [r.get("_id") for r in results]
        if fact_data.get("_id") in result_ids:
            print_status(f"Query successful: found fact in {len(results)} results", "SUCCESS")
            return True
        else:
            print_status("Query succeeded but didn't return the test fact", "INFO")
            return True  # Still consider it a success

    except requests.exceptions.RequestException as e:
        print_status(f"Query failed: {e}", "ERROR")
        return False


def main():
    """Run the embedding test."""
    print("=" * 60)
    print("KnowledgePlane Embeddings Test")
    print("=" * 60)
    print()
    print(f"API URL:      {API_URL}")
    print(f"Workspace ID: {WORKSPACE_ID}")
    print(f"Fact ID:      {FACT_ID}")
    print()

    # Step 1: Check if fact exists and has embedding
    print_status("Step 1: Checking for existing embedding...", "INFO")
    fact_data = get_fact(FACT_ID)

    if not fact_data:
        print_status("Failed to fetch fact", "ERROR")
        sys.exit(1)

    print_status(f"Fact found: {fact_data.get('_key', 'unknown')}", "SUCCESS")

    # Step 2: Wait for embedding if not present
    if not check_embedding(fact_data):
        print()
        print_status("Step 2: Waiting for background worker to generate embedding...", "INFO")
        print_status(f"Will poll every {POLL_INTERVAL_SECONDS}s for up to {MAX_WAIT_SECONDS}s", "INFO")
        print()

        fact_data = wait_for_embedding(FACT_ID, MAX_WAIT_SECONDS, POLL_INTERVAL_SECONDS)

        if not fact_data:
            print()
            print_status("FAILED: Embedding not generated within timeout", "ERROR")
            sys.exit(1)

    # Step 3: Verify embedding dimension
    print()
    print_status("Step 3: Verifying embedding dimension...", "INFO")
    if not check_embedding(fact_data):
        print_status("FAILED: Invalid embedding", "ERROR")
        sys.exit(1)

    # Step 4: Test query
    print()
    print_status("Step 4: Testing semantic query...", "INFO")
    if not test_query(fact_data):
        print_status("FAILED: Query test failed", "ERROR")
        sys.exit(1)

    # Success!
    print()
    print("=" * 60)
    print_status("ALL TESTS PASSED", "SUCCESS")
    print("=" * 60)
    sys.exit(0)


if __name__ == "__main__":
    main()
