#!/bin/bash
# Full benchmark stack runner
# Usage: ./scripts/run-full-benchmark.sh [--n N] [--mode MODE] [args...]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BENCHMARK_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== KnowledgePlane Benchmark Runner ===${NC}"

# Check for .env file
if [ ! -f "$BENCHMARK_DIR/.env" ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Create .env with: KP_WORKSPACE_ID, KP_USER_ID, KP_API_KEY, OPENAI_API_KEY"
    exit 1
fi

# Load environment
set -a
source "$BENCHMARK_DIR/.env"
set +a

# Parse arguments or use defaults
BENCHMARK_ARGS="${@:---n 20 --run_kp true --run_vector false --mode timestamped}"

echo -e "${YELLOW}Starting full stack...${NC}"
cd "$BENCHMARK_DIR"

# Start infrastructure (db, api, workers)
docker compose -f docker-compose.full.yml up -d db rest-api background-workers

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services...${NC}"
for i in {1..30}; do
    if docker compose -f docker-compose.full.yml ps | grep -q "healthy"; then
        echo -e "${GREEN}Services ready!${NC}"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

# Run benchmark
echo -e "${GREEN}Running benchmark: $BENCHMARK_ARGS${NC}"
docker compose -f docker-compose.full.yml run --rm benchmark python3 bench_hotpotqa.py $BENCHMARK_ARGS

echo -e "${GREEN}=== Benchmark Complete ===${NC}"
echo "Results in: $BENCHMARK_DIR/output/"

# Optional: tear down
read -p "Tear down infrastructure? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose -f docker-compose.full.yml down -v
fi
