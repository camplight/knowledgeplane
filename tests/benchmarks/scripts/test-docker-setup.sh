#!/bin/bash
# Test Docker setup for KnowledgePlane benchmarks
# Validates that all dependencies work before running full benchmarks

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Docker Setup Validation for KnowledgePlane Benchmarks   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

FAILED=0

# Test 1: Docker running
echo -e "${YELLOW}[1/6] Checking Docker...${NC}"
if docker info > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker is running${NC}"
else
    echo -e "${RED}✗ Docker is not running${NC}"
    echo "Please start Docker Desktop and try again"
    FAILED=1
fi
echo ""

# Test 2: Docker Compose available
echo -e "${YELLOW}[2/6] Checking Docker Compose...${NC}"
if docker-compose --version > /dev/null 2>&1; then
    VERSION=$(docker-compose --version)
    echo -e "${GREEN}✓ Docker Compose is available: $VERSION${NC}"
else
    echo -e "${RED}✗ Docker Compose not found${NC}"
    FAILED=1
fi
echo ""

# Test 3: Build Docker image
echo -e "${YELLOW}[3/6] Building Docker image (this may take 5-10 minutes)...${NC}"
if docker-compose build benchmark-runner 2>&1 | tee /tmp/docker-build.log | grep -q "Successfully built" || grep -q "Successfully tagged" /tmp/docker-build.log; then
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
else
    echo -e "${RED}✗ Docker build failed${NC}"
    echo "Check /tmp/docker-build.log for details"
    FAILED=1
fi
echo ""

# Test 4: Test Python imports
echo -e "${YELLOW}[4/6] Testing Python imports...${NC}"
if docker-compose run --rm benchmark-runner python3 -c "
import sys
print('Python:', sys.version)
import torch
print('PyTorch:', torch.__version__)
import numpy
print('NumPy:', numpy.__version__)
import sentence_transformers
print('sentence-transformers:', sentence_transformers.__version__)
import datasets
print('datasets:', datasets.__version__)
import faiss
print('faiss:', faiss.__version__)
print('All imports successful!')
" 2>&1 | tee /tmp/imports.log; then
    echo -e "${GREEN}✓ All Python imports successful${NC}"
else
    echo -e "${RED}✗ Import test failed${NC}"
    FAILED=1
fi
echo ""

# Test 5: Test benchmark code imports
echo -e "${YELLOW}[5/6] Testing benchmark code...${NC}"
if docker-compose run --rm benchmark-runner python3 -c "
from bench_hotpotqa import HotpotQABenchmark
from kp_adapter import MockKnowledgePlaneAdapter
from vector_baseline import VectorBaseline
print('Benchmark code imports successful!')
" 2>&1; then
    echo -e "${GREEN}✓ Benchmark code loads successfully${NC}"
else
    echo -e "${RED}✗ Benchmark code import failed${NC}"
    FAILED=1
fi
echo ""

# Test 6: Quick benchmark run (n=5 for speed)
echo -e "${YELLOW}[6/6] Running quick benchmark (n=5)...${NC}"
if docker-compose run --rm benchmark-runner \
    python3 bench_hotpotqa.py --n 5 --mock_kp --run_vector false 2>&1 | tee /tmp/quick-bench.log; then
    echo -e "${GREEN}✓ Quick benchmark completed${NC}"
else
    echo -e "${RED}✗ Quick benchmark failed${NC}"
    FAILED=1
fi
echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo -e "${GREEN}Docker setup is working correctly.${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Run validation benchmark:"
    echo "     ${YELLOW}docker-compose run --rm benchmark-runner python3 bench_hotpotqa.py --n 20 --mock_kp${NC}"
    echo ""
    echo "  2. Or use the automated script:"
    echo "     ${YELLOW}./run-benchmark-docker.sh${NC}"
    echo ""
    echo "  3. For full benchmark with statistics:"
    echo "     ${YELLOW}docker-compose run --rm benchmark-runner python3 bench_hotpotqa.py --n 500 --mock_kp --statistical-analysis${NC}"
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo -e "${BLUE}Troubleshooting:${NC}"
    echo "  1. Make sure Docker Desktop is running"
    echo "  2. Try rebuilding from scratch:"
    echo "     ${YELLOW}docker-compose down${NC}"
    echo "     ${YELLOW}docker-compose build --no-cache benchmark-runner${NC}"
    echo "  3. Check logs:"
    echo "     ${YELLOW}cat /tmp/docker-build.log${NC}"
    echo "     ${YELLOW}cat /tmp/imports.log${NC}"
    echo "  4. Clean Docker cache:"
    echo "     ${YELLOW}docker system prune -f${NC}"
fi
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

exit $FAILED
