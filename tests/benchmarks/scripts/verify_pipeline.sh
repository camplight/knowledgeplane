#!/bin/bash
# Pipeline Verification Script
# Quick checks for database state, embeddings, and retrieval

set -e

# Load environment
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Configuration
API_URL="${KP_API_URL:-http://localhost:8081}"
API_KEY="${KP_API_KEY}"
WORKSPACE_ID="${KP_WORKSPACE_ID}"
NAMESPACE="${1:-incremental_test}"

echo "=========================================="
echo "KnowledgePlane Pipeline Verification"
echo "=========================================="
echo "API URL: $API_URL"
echo "Workspace: $WORKSPACE_ID"
echo "Namespace: $NAMESPACE"
echo ""

# Check 1: Count facts in namespace
echo "[1/3] Counting facts in namespace..."
FACTS_COUNT=$(curl -s -X POST "$API_URL/api/facts/search?workspace_id=$WORKSPACE_ID" \
  -H "Content-Type: application/json" \
  -H "knowledgeplane-key: $API_KEY" \
  -d "{\"query\": \"*\", \"k\": 1000}" | \
  jq -r '[.hits[] | select(.metadata.namespace == "'$NAMESPACE'")] | length')

echo "✓ Found $FACTS_COUNT facts in namespace '$NAMESPACE'"

if [ "$FACTS_COUNT" -eq 0 ]; then
    echo "✗ No facts found in namespace. Run test_incremental.py first."
    exit 1
fi

# Check 2: Test semantic search (verifies embeddings exist)
echo ""
echo "[2/3] Testing semantic search..."
SEARCH_RESULT=$(curl -s -X POST "$API_URL/api/facts/search?workspace_id=$WORKSPACE_ID" \
  -H "Content-Type: application/json" \
  -H "knowledgeplane-key: $API_KEY" \
  -d "{\"query\": \"test query for embeddings\", \"k\": 5}")

RESULTS_COUNT=$(echo "$SEARCH_RESULT" | jq -r '[.hits[] | select(.metadata.namespace == "'$NAMESPACE'")] | length')

echo "✓ Semantic search returned $RESULTS_COUNT results"

if [ "$RESULTS_COUNT" -eq 0 ]; then
    echo "✗ No results from semantic search. Embeddings may not exist."
    echo "   Run: python test_incremental.py"
    exit 1
fi

# Check 3: Verify embeddings have valid scores
echo ""
echo "[3/3] Verifying embedding quality..."
HAS_SCORES=$(echo "$SEARCH_RESULT" | jq -r '[.hits[] | select(.metadata.namespace == "'$NAMESPACE'" and .score > 0)] | length')

echo "✓ $HAS_SCORES results have valid embedding scores"

if [ "$HAS_SCORES" -lt "$RESULTS_COUNT" ]; then
    echo "⚠ Warning: Some results missing embedding scores"
    echo "   Expected: $RESULTS_COUNT, Got: $HAS_SCORES"
fi

# Summary
echo ""
echo "=========================================="
echo "Pipeline Verification Summary"
echo "=========================================="
echo "Facts in namespace:     $FACTS_COUNT"
echo "Semantic search works:  ✓"
echo "Embeddings exist:       ✓"
echo "Embedding scores valid: $HAS_SCORES/$RESULTS_COUNT"
echo ""
echo "✓ Pipeline is operational"
echo "=========================================="
