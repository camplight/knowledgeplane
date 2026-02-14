#!/bin/bash
# KnowledgePlane Benchmark Runner - Docker Edition
# Runs benchmarks in isolated Docker container with pinned dependencies

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VALIDATION_N=20
FULL_N=500
OUTPUT_DIR="./output"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   KnowledgePlane Benchmarks - Docker Runner               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Docker is not running!${NC}"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build Docker image
echo ""
echo -e "${BLUE}Building Docker image with pinned dependencies...${NC}"
if docker-compose build benchmark-runner; then
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
else
    echo -e "${RED}ERROR: Docker build failed${NC}"
    exit 1
fi

# Test imports
echo ""
echo -e "${BLUE}Testing Python imports...${NC}"
if docker-compose run --rm benchmark-runner python3 -c "import torch; import numpy; import sentence_transformers; import datasets; import faiss; print('All imports successful!')"; then
    echo -e "${GREEN}✓ All dependencies imported successfully${NC}"
else
    echo -e "${RED}ERROR: Import test failed${NC}"
    exit 1
fi

# Run validation benchmark (n=20)
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Step 1: Validation Run (n=${VALIDATION_N})${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

if docker-compose run --rm benchmark-runner \
    python3 bench_hotpotqa.py \
    --n "$VALIDATION_N" \
    --mock_kp \
    --run_kp true \
    --run_vector false \
    --output_dir output; then
    echo -e "${GREEN}✓ Validation run completed${NC}"
else
    echo -e "${RED}ERROR: Validation run failed${NC}"
    exit 1
fi

# Check validation results
VALIDATION_RESULTS="$OUTPUT_DIR/hotpotqa_summary.json"
if [ -f "$VALIDATION_RESULTS" ]; then
    echo ""
    echo -e "${GREEN}✓ Validation results saved to: $VALIDATION_RESULTS${NC}"

    # Extract key metrics using Python
    VALIDATION_METRICS=$(python3 -c "
import json
import sys
try:
    with open('$VALIDATION_RESULTS') as f:
        data = json.load(f)
    kp = data.get('kp', {})
    print(f\"EM: {kp.get('avg_em', 0)*100:.1f}%, F1: {kp.get('avg_f1', 0)*100:.1f}%, Latency: {kp.get('avg_latency_ms', 0):.0f}ms\")
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
")

    if [ $? -eq 0 ]; then
        echo -e "${YELLOW}Validation Metrics: ${VALIDATION_METRICS}${NC}"
    fi
else
    echo -e "${YELLOW}WARNING: Validation results file not found${NC}"
fi

# Ask user if they want to proceed with full run
echo ""
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Validation complete! Ready for full benchmark run.${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""
read -p "$(echo -e ${YELLOW}Proceed with full run \(n=${FULL_N}\)? [y/N]: ${NC})" -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Skipping full run. Validation results available in: $OUTPUT_DIR${NC}"
    exit 0
fi

# Run full benchmark (n=500)
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Step 2: Full Benchmark Run (n=${FULL_N})${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

START_TIME=$(date +%s)

if docker-compose run --rm benchmark-runner \
    python3 bench_hotpotqa.py \
    --n "$FULL_N" \
    --mock_kp \
    --run_kp true \
    --run_vector false \
    --statistical-analysis \
    --output_dir output; then
    echo -e "${GREEN}✓ Full benchmark completed${NC}"
else
    echo -e "${RED}ERROR: Full benchmark failed${NC}"
    exit 1
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
ELAPSED_MIN=$((ELAPSED / 60))
ELAPSED_SEC=$((ELAPSED % 60))

# Check full results
FULL_RESULTS="$OUTPUT_DIR/hotpotqa_summary.json"
if [ -f "$FULL_RESULTS" ]; then
    echo ""
    echo -e "${GREEN}✓ Full benchmark results saved to: $FULL_RESULTS${NC}"
    echo -e "${GREEN}✓ Detailed results: $OUTPUT_DIR/hotpotqa_results.csv${NC}"

    # Extract key metrics
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}           BENCHMARK RESULTS SUMMARY                        ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"

    python3 -c "
import json
with open('$FULL_RESULTS') as f:
    data = json.load(f)
kp = data.get('kp', {})
config = data.get('config', {})
timing = data.get('timing', {})
stats = data.get('statistical_analysis', {})

print(f\"Configuration:\")
print(f\"  Questions: {config.get('n_questions', 'N/A')}\")
print(f\"  Seed: {config.get('seed', 'N/A')}\")
print(f\"  Sample Method: {config.get('sample_method', 'N/A')}\")
print()
print(f\"KnowledgePlane Performance:\")
print(f\"  Exact Match (EM): {kp.get('avg_em', 0)*100:.2f}%\")
print(f\"  F1 Score:         {kp.get('avg_f1', 0)*100:.2f}%\")
print(f\"  Avg Latency:      {kp.get('avg_latency_ms', 0):.1f}ms\")
print(f\"  Questions:        {kp.get('questions_answered', 0)}/{kp.get('questions_evaluated', 0)}\")
print()
print(f\"Timing:\")
print(f\"  Total Time:       {timing.get('total_seconds', 0):.1f}s ({${ELAPSED_MIN}}m ${ELAPSED_SEC}s)\")
print(f\"  Avg per Question: {timing.get('avg_per_question', 0):.2f}s\")

if stats:
    print()
    print(f\"Statistical Analysis:\")
    summary = stats.get('summary', {})
    if summary:
        print(f\"  Samples: {summary.get('n_samples', 'N/A')}\")
        print(f\"  Mean Difference: {summary.get('mean_difference', 0):.4f}\")
        sig = stats.get('hypothesis_test', {})
        if sig and sig.get('p_value'):
            p = sig['p_value']
            print(f\"  P-value: {p:.4f} ({'significant' if p < 0.05 else 'not significant'})\")
"

    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
else
    echo -e "${YELLOW}WARNING: Full results file not found${NC}"
fi

# Cleanup
echo ""
echo -e "${BLUE}Cleaning up Docker containers...${NC}"
docker-compose down > /dev/null 2>&1

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Benchmark Complete!                                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Results saved to:${NC}"
echo -e "  - ${YELLOW}$OUTPUT_DIR/hotpotqa_summary.json${NC}"
echo -e "  - ${YELLOW}$OUTPUT_DIR/hotpotqa_results.csv${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  - Review results in $OUTPUT_DIR"
echo "  - Run with real KP server: docker-compose up benchmark-runner-kp"
echo "  - Run full suite: docker-compose --profile full up benchmark-suite"
echo ""
