# Docker Benchmark Quickstart

## Prerequisites

- Docker Desktop installed (Mac/Windows) or Docker Engine (Linux)
- KP server running on host at `localhost:8080`
- Environment variables set

## Setup (One-time)

```bash
# Navigate to benchmarks directory
cd tests/benchmarks

# Set environment variables
export KP_WORKSPACE_ID="your-workspace-id"
export KP_USER_ID="your-user-id"
export KP_API_KEY="your-api-key"
export OPENAI_API_KEY="your-openai-key"

# Or create .env file
cat > .env <<EOF
KP_API_URL=http://localhost:8080
KP_WORKSPACE_ID=your-workspace-id
KP_USER_ID=your-user-id
KP_API_KEY=your-api-key
OPENAI_API_KEY=sk-...
EOF

# Create output directory
mkdir -p output
```

## Phase 1: Validation (REQUIRED FIRST)

**Purpose**: Verify setup works before long runs

```bash
# Build and run validation (n=20, ~5-10 minutes)
docker compose --profile validation up --build

# Verify results
python3 verify_real_results.py --phase validation
```

**Success criteria:**
- ✅ Container completes without errors
- ✅ Files exist: `output/hotpotqa_results.csv`, `output/hotpotqa_summary.json`
- ✅ Verification script passes all checks
- ✅ At least 18/20 questions succeed

**If validation fails:** See [EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) troubleshooting.

## Phase 2: Full Run (After validation passes)

**Purpose**: Collect statistically significant results

```bash
# Run full benchmark (n=500, ~2-4 hours)
docker compose --profile full up

# Monitor progress (in another terminal)
watch -n 30 'wc -l output/hotpotqa_results.csv'

# Verify results
python3 verify_real_results.py --phase full --n 500

# Run statistical analysis
python3 statistical_analysis.py \
  --results output/hotpotqa_results.csv \
  --output output/statistical_report.json
```

**Success criteria:**
- ✅ At least 475/500 questions succeed (95%)
- ✅ KP shows >10pp EM improvement over baseline
- ✅ Statistical tests pass (p < 0.05)
- ✅ Results are reproducible

## Quick Commands

```bash
# Test connectivity
docker compose run --rm benchmark-validation \
  curl http://host.docker.internal:8080/health

# Run custom benchmark
docker compose run --rm benchmark-validation \
  python3 bench_hotpotqa.py --n 50 --run_kp true

# View logs
docker compose logs -f benchmark-validation

# Stop containers
docker compose down

# Clean up everything
docker compose down -v --rmi all
```

## Troubleshooting

### Can't reach KP server
```bash
# Check server is running
curl localhost:8080/health

# Test from container
docker compose run --rm benchmark-validation \
  curl -v http://host.docker.internal:8080/health
```

### Permission errors
```bash
sudo chown -R $(id -u):$(id -g) output/
```

### Build failures
```bash
docker compose build --no-cache
```

### Mock data detected
```bash
# Ensure no --mock_kp flag
# Check environment variables are set
docker compose config | grep KP_
```

## What Gets Generated

```
output/
├── hotpotqa_results.csv       # Per-question results (incremental)
├── hotpotqa_summary.json      # Final aggregate metrics
├── statistical_report.json    # Statistical analysis
└── benchmark_report_*.json    # Combined report
```

## Success Metrics

**Phase 1 (Validation):**
- Container runs to completion
- Output files created
- Network connectivity confirmed
- ≥90% questions succeed

**Phase 2 (Full Run):**
- ≥95% questions succeed
- KP EM improvement >10pp vs baseline
- Statistical significance (p < 0.05)
- Results reproducible (±5%)

## Next Steps

1. ✅ Run Phase 1 validation
2. ✅ Verify results with script
3. ✅ Run Phase 2 full benchmark
4. ✅ Verify and analyze results
5. ✅ Generate report for publication

## Resources

- **[EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md)** - Complete execution strategy
- **[DOCKER_EXECUTION.md](docs/DOCKER_EXECUTION.md)** - Docker details and troubleshooting
- **[README.md](README.md)** - Benchmark suite overview

## Quick Reference Card

| Task | Command | Time |
|------|---------|------|
| Validation | `docker compose --profile validation up --build` | 5-10 min |
| Verify validation | `python3 verify_real_results.py --phase validation` | <1 min |
| Full run | `docker compose --profile full up` | 2-4 hours |
| Verify full | `python3 verify_real_results.py --phase full --n 500` | <1 min |
| Analysis | `python3 statistical_analysis.py --results output/hotpotqa_results.csv` | 1-2 min |
| Clean up | `docker compose down -v` | <1 min |

---

**Remember:** Always run Phase 1 validation before Phase 2 full run!
