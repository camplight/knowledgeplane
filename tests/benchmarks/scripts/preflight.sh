#!/bin/bash
#
# Benchmark Preflight Checks
# Run this before any benchmark to ensure environment is ready
#
# Usage: ./scripts/preflight.sh [--fix]
#
# Options:
#   --fix    Attempt to auto-fix issues
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BENCHMARK_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$BENCHMARK_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

# Counters
PASSED=0
FAILED=0
WARNINGS=0
AUTO_FIX=${1:-""}

echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║           KnowledgePlane Benchmark Preflight                 ║${NC}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((++PASSED))  # Pre-increment to avoid set -e exit when PASSED=0
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((++FAILED))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((++WARNINGS))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

section() {
    echo ""
    echo -e "${BOLD}$1${NC}"
    echo "────────────────────────────────────────"
}

# ═══════════════════════════════════════════════════════════════
section "1. Environment Files"
# ═══════════════════════════════════════════════════════════════

# Check root .env
if [ -f "$PROJECT_ROOT/.env" ]; then
    pass ".env file exists"

    # Check required vars
    if grep -q "OPENAI_API_KEY=sk-" "$PROJECT_ROOT/.env"; then
        pass "OPENAI_API_KEY is set"
    else
        fail "OPENAI_API_KEY missing or invalid"
    fi

    if grep -q "KP_WORKSPACE_ID=" "$PROJECT_ROOT/.env"; then
        pass "KP_WORKSPACE_ID is set"
    else
        warn "KP_WORKSPACE_ID not set (will use default)"
    fi

    if grep -q "KP_USER_ID=" "$PROJECT_ROOT/.env"; then
        pass "KP_USER_ID is set"
    else
        warn "KP_USER_ID not set (will use default)"
    fi
else
    fail ".env file not found at $PROJECT_ROOT/.env"
    if [ "$AUTO_FIX" == "--fix" ]; then
        info "Creating template .env..."
        cat > "$PROJECT_ROOT/.env" << 'EOF'
# KnowledgePlane Configuration
OPENAI_API_KEY=sk-your-key-here

# Benchmark settings
KP_API_URL=http://localhost:8081
KP_WORKSPACE_ID=benchmark-workspace
KP_USER_ID=00000000-0000-0000-0000-000000000001
KP_API_KEY=benchmark-api-key
EOF
        warn "Created .env template - please add your OPENAI_API_KEY"
    fi
fi

# ═══════════════════════════════════════════════════════════════
section "2. Docker"
# ═══════════════════════════════════════════════════════════════

if docker info > /dev/null 2>&1; then
    pass "Docker daemon is running"
else
    fail "Docker daemon not running"
    if [ "$AUTO_FIX" == "--fix" ]; then
        info "Please start Docker Desktop manually"
    fi
fi

# Check Docker Compose
if docker compose version > /dev/null 2>&1; then
    pass "Docker Compose available"
else
    fail "Docker Compose not found"
fi

# ═══════════════════════════════════════════════════════════════
section "3. ArangoDB"
# ═══════════════════════════════════════════════════════════════

DB_STATUS=$(docker compose -f "$PROJECT_ROOT/infra/docker-compose.dev.yml" ps --format "{{.Status}}" db 2>/dev/null || echo "not running")

if echo "$DB_STATUS" | grep -q "Up"; then
    if echo "$DB_STATUS" | grep -q "healthy"; then
        pass "ArangoDB is running and healthy"
    else
        warn "ArangoDB is running but unhealthy"
        info "Try: docker compose -f infra/docker-compose.dev.yml restart db"
    fi
else
    fail "ArangoDB is not running"
    if [ "$AUTO_FIX" == "--fix" ]; then
        info "Starting ArangoDB..."
        docker compose -f "$PROJECT_ROOT/infra/docker-compose.dev.yml" up -d db
        info "Waiting for startup (15s)..."
        sleep 15
    fi
fi

# ═══════════════════════════════════════════════════════════════
section "4. REST API (port 8081)"
# ═══════════════════════════════════════════════════════════════

API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/api/facts?limit=1 2>/dev/null || echo "000")

if [ "$API_RESPONSE" == "200" ] || [ "$API_RESPONSE" == "400" ] || [ "$API_RESPONSE" == "401" ] || [ "$API_RESPONSE" == "404" ]; then
    pass "REST API responding on port 8081 (HTTP $API_RESPONSE)"
else
    fail "REST API not responding on port 8081"
    if [ "$AUTO_FIX" == "--fix" ]; then
        info "Starting REST API..."
        cd "$PROJECT_ROOT/apps/rest-api"
        PORT=8081 npx tsx src/server.ts > /tmp/kp-rest-api.log 2>&1 &
        info "Waiting for startup (8s)..."
        sleep 8

        # Recheck
        API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/api/facts?limit=1 2>/dev/null || echo "000")
        if [ "$API_RESPONSE" != "000" ]; then
            ((FAILED--))  # Undo the fail count since we fixed it
            pass "REST API started successfully"
        else
            fail "REST API failed to start - check /tmp/kp-rest-api.log"
        fi
    else
        info "Start manually: cd apps/rest-api && PORT=8081 npx tsx src/server.ts &"
    fi
fi

# ═══════════════════════════════════════════════════════════════
section "5. Benchmark Docker Image"
# ═══════════════════════════════════════════════════════════════

if docker images | grep -q "kp-benchmarks"; then
    pass "Benchmark image exists"
else
    warn "Benchmark image not built"
    if [ "$AUTO_FIX" == "--fix" ]; then
        info "Building benchmark image..."
        cd "$BENCHMARK_DIR"
        docker compose build benchmark-validation
    else
        info "Build with: cd tests/benchmarks && docker compose build benchmark-validation"
    fi
fi

# ═══════════════════════════════════════════════════════════════
section "6. Network Connectivity"
# ═══════════════════════════════════════════════════════════════

# Test Docker can reach host
if docker run --rm --add-host=host.docker.internal:host-gateway alpine:latest ping -c 1 host.docker.internal > /dev/null 2>&1; then
    pass "Docker can reach host.docker.internal"
else
    warn "Docker may not reach host.docker.internal"
    info "Benchmarks use extra_hosts to handle this"
fi

# ═══════════════════════════════════════════════════════════════
section "7. Python Dependencies (optional)"
# ═══════════════════════════════════════════════════════════════

if python3 -c "import faiss; import sentence_transformers" 2>/dev/null; then
    pass "Local Python dependencies available"
else
    info "Local Python deps not installed (OK - benchmarks use Docker)"
fi

# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Summary${NC}"
echo -e "═══════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${RED}Failed:${NC}   $FAILED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ All checks passed! Ready to run benchmarks.${NC}"
    echo ""
    echo "Quick start:"
    echo "  docker compose --profile freshness-batch up   # Freshness (5-10 min)"
    echo "  docker compose --profile validation up        # HotpotQA (10 min)"
    exit 0
else
    echo -e "${RED}${BOLD}✗ $FAILED check(s) failed.${NC}"
    if [ "$AUTO_FIX" != "--fix" ]; then
        echo ""
        echo "Run with --fix to attempt auto-repair:"
        echo "  ./scripts/preflight.sh --fix"
    fi
    exit 1
fi
