#!/usr/bin/env bash
#
# Start benchmark dependencies (ArangoDB, reranker, REST API, background workers)
# and run the benchmark CLI. Used by: npm run bench:quick | bench:all
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-all}"
case "$MODE" in
  quick|all) ;;
  *)
    echo "Usage: $0 {quick|all}"
    exit 1
    ;;
esac

COMPOSE=(docker compose -p kp-bench -f infra/docker-compose.yml)
COMPOSE_RERANKER=(docker compose -p kp-bench -f infra/docker-compose.yml --profile with-reranker)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

# BENCH_SKIP_RERANKER=1 — do not start or wait for the reranker container.
# BENCH_STRICT_RERANKER=1 — if the reranker is started but never becomes healthy, exit (default is soft-skip after timeout).

if [[ ! -f .env ]]; then
  echo -e "${RED}Missing .env at repo root.${NC}"
  exit 1
fi
if [[ ! -f .env.benchmark ]]; then
  echo -e "${RED}Missing .env.benchmark.${NC}"
  echo "Start ArangoDB, then run: bash tests/benchmarks/scripts/setup-benchmark-env.sh"
  exit 1
fi

export RERANKER_URL="${RERANKER_URL:-http://localhost:8082}"

DOCKER_BENCH_STARTED=0
CONC_PID=""

is_arango_up() {
  curl -sS --connect-timeout 2 -u "${ARANGO_USER:-root}:${ARANGO_PASSWORD:-root}" \
    "${ARANGO_URL:-http://localhost:8529}/_api/version" >/dev/null 2>&1
}

is_reranker_up() {
  curl -sS --connect-timeout 2 "${RERANKER_URL}/health" >/dev/null 2>&1
}

is_api_up() {
  curl -sS --connect-timeout 2 "http://localhost:8081/health" >/dev/null 2>&1
}

stop_node_stack() {
  if [[ -n "${CONC_PID}" ]] && kill -0 "${CONC_PID}" 2>/dev/null; then
    echo -e "${BLUE}Stopping REST API and background workers…${NC}"
    kill -TERM "${CONC_PID}" 2>/dev/null || true
    wait "${CONC_PID}" 2>/dev/null || true
  fi
  CONC_PID=""
}

stop_docker_bench() {
  if [[ "${DOCKER_BENCH_STARTED}" -eq 1 ]]; then
    echo -e "${BLUE}Stopping benchmark Docker stack (kp-bench)…${NC}"
    "${COMPOSE_RERANKER[@]}" down --remove-orphans >/dev/null 2>&1 || true
  fi
}

finalize() {
  local rc=$1
  stop_node_stack
  stop_docker_bench
  exit "${rc}"
}

trap 'stop_node_stack; stop_docker_bench; exit 130' INT
trap 'stop_node_stack; stop_docker_bench; exit 143' TERM

wait_api() {
  local i=0
  local max=60
  while [[ $i -lt $max ]]; do
    if is_api_up; then
      echo -e "${GREEN}✓${NC} REST API ready (8081)"
      return 0
    fi
    echo -e "${BLUE}Waiting for REST API…${NC} ($((i + 1))/${max})"
    sleep 2
    i=$((i + 1))
  done
  echo -e "${RED}REST API did not become ready on port 8081.${NC}"
  return 1
}

reranker_logs_tail() {
  local cid
  cid="$("${COMPOSE_RERANKER[@]}" ps -q reranker 2>/dev/null | head -1)"
  if [[ -n "${cid}" ]]; then
    echo -e "${YELLOW}── Last reranker container logs (docker logs ${cid}) ──${NC}"
    docker logs "${cid}" 2>&1 | tail -n 80 || true
  else
    echo -e "${YELLOW}(No kp-bench reranker container id from compose ps.)${NC}"
  fi
}

wait_reranker() {
  local i=0
  local max=900
  echo -e "${BLUE}Waiting for reranker (first model download can take 15–30+ minutes)…${NC}"
  while [[ $i -lt $max ]]; do
    if is_reranker_up; then
      echo -e "${GREEN}✓${NC} Reranker ready (${RERANKER_URL})"
      return 0
    fi
    if ((i % 15 == 0)); then
      echo -e "${YELLOW}…${NC} still waiting for reranker ($((i + 1))/${max})"
    fi
    sleep 2
    i=$((i + 1))
  done
  echo -e "${RED}Reranker did not become healthy in time.${NC}"
  reranker_logs_tail
  return 1
}

# Soft-skip reranker after timeout unless BENCH_STRICT_RERANKER=1
handle_reranker_optional() {
  if [[ "${BENCH_STRICT_RERANKER:-0}" == "1" ]]; then
    finalize 1
  fi
  echo -e "${YELLOW}Continuing without reranker (embedding-only). Workers fall back automatically.${NC}"
  echo -e "${DIM}To skip waiting entirely: BENCH_SKIP_RERANKER=1 npm run bench:quick${NC}"
  echo -e "${DIM}To fail hard on reranker: BENCH_STRICT_RERANKER=1 npm run bench:quick${NC}"
}

echo -e "${BLUE}━━ Benchmark stack ━━${NC}"

if is_arango_up; then
  echo -e "${GREEN}✓${NC} ArangoDB already reachable"
else
  echo -e "${BLUE}Starting ArangoDB (docker project kp-bench)…${NC}"
  "${COMPOSE[@]}" up -d db
  DOCKER_BENCH_STARTED=1
  node scripts/wait-for-db.js
fi

echo -e "${BLUE}Ensuring DB schema and benchmark credentials (.env.benchmark)…${NC}"
DOTENV_CLI="${ROOT}/node_modules/.bin/dotenv"
if [[ ! -x "${DOTENV_CLI}" ]]; then
  echo -e "${RED}Missing dotenv-cli. Run: npm install${NC}"
  finalize 1
fi
"${DOTENV_CLI}" -e "${ROOT}/.env" -e "${ROOT}/.env.benchmark" -- \
  npm exec -s -- tsx scripts/bench-warm-db.ts || finalize 1

if [[ "${BENCH_SKIP_RERANKER:-0}" == "1" ]] || [[ "${BENCH_SKIP_RERANKER:-}" == "true" ]]; then
  echo -e "${YELLOW}BENCH_SKIP_RERANKER: skipping reranker (no container on ${RERANKER_URL}).${NC}"
elif is_reranker_up; then
  echo -e "${GREEN}✓${NC} Reranker already reachable"
else
  echo -e "${BLUE}Starting reranker (docker project kp-bench)…${NC}"
  "${COMPOSE_RERANKER[@]}" up -d reranker
  DOCKER_BENCH_STARTED=1
  if ! wait_reranker; then
    handle_reranker_optional
  fi
fi

echo -e "${BLUE}Starting REST API and background workers…${NC}"
npm exec -- concurrently --kill-others-on-fail \
  -n "rest-api,bg-workers" \
  -c "cyan,magenta" \
  "npm run bench --workspace=apps/rest-api" \
  "npm run bench --workspace=apps/background-workers" &
CONC_PID=$!

wait_api || finalize 1

pushd tests/benchmarks >/dev/null
set +e
if [[ "$MODE" == "quick" ]]; then
  echo -e "${BLUE}Running: ./bench all --quick${NC}"
  ./bench all --quick
else
  echo -e "${BLUE}Running: ./bench all${NC}"
  ./bench all
fi
BENCH_RC=$?
set -e
popd >/dev/null

if [[ "${BENCH_RC}" -eq 0 ]]; then
  echo -e "${GREEN}Benchmark run finished.${NC}"
else
  echo -e "${RED}Benchmark exited with status ${BENCH_RC}.${NC}"
fi

finalize "${BENCH_RC}"
