# Docker Execution Guide

## Quick Start

### Phase 1: Validation (ALWAYS RUN FIRST)

```bash
# Set required environment variables
export KP_WORKSPACE_ID="your-workspace-id"
export KP_USER_ID="your-user-id"
export KP_API_KEY="your-api-key"
export OPENAI_API_KEY="your-openai-key"

# Build and run validation (n=20, ~5-10 minutes)
docker compose --profile validation up --build

# Verify results
python3 verify_real_results.py --phase validation
```

**If validation passes**, proceed to Phase 2. **If it fails**, see [EXECUTION_PLAN.md](./EXECUTION_PLAN.md) for troubleshooting.

### Phase 2: Full Run (After validation passes)

```bash
# Run full benchmark (n=500, ~2-4 hours)
docker compose --profile full up

# Verify results
python3 verify_real_results.py --phase full --n 500

# Run statistical analysis
python3 statistical_analysis.py \
  --results output/hotpotqa_results.csv \
  --output output/statistical_report.json
```

## Available Profiles

Docker Compose profiles let you run different benchmark configurations:

| Profile | Command | Purpose | Duration |
|---------|---------|---------|----------|
| `validation` | `docker compose --profile validation up` | Smoke test (n=20) | ~5-10 min |
| `full` | `docker compose --profile full up` | Complete run (n=500) | ~2-4 hours |
| `msmarco` | `docker compose --profile msmarco up` | MS MARCO benchmark | ~30-60 min |
| `all` | `docker compose --profile all up` | All benchmarks | ~3-5 hours |
| (default) | `docker compose up` | Mock mode (testing) | ~2-3 min |

## Environment Variables

### Required (for real KP server)

```bash
export KP_API_URL="http://localhost:8080"       # KP server URL
export KP_WORKSPACE_ID="your-workspace-id"      # KP workspace
export KP_USER_ID="your-user-id"                # KP user
export KP_API_KEY="your-api-key"                # KP API key
export OPENAI_API_KEY="sk-..."                  # OpenAI key
```

### Optional

```bash
export ANTHROPIC_API_KEY="sk-ant-..."           # For Claude (optional)
```

### Using .env File

Create a `.env` file in the benchmarks directory:

```bash
# .env file
KP_API_URL=http://localhost:8080
KP_WORKSPACE_ID=your-workspace-id
KP_USER_ID=your-user-id
KP_API_KEY=your-api-key
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Docker Compose will automatically load these variables.

## Network Configuration

### Mac/Windows (Docker Desktop)

Uses `host.docker.internal` to reach KP server on host:

```yaml
environment:
  - KP_API_URL=http://host.docker.internal:8080
extra_hosts:
  - "host.docker.internal:host-gateway"
```

This is **automatic** in the docker-compose.yml.

### Linux

Option 1: Use `--network host` (add to docker-compose.yml):

```yaml
network_mode: host
environment:
  - KP_API_URL=http://localhost:8080
```

Option 2: Use host's IP address:

```bash
export KP_API_URL="http://$(hostname -I | awk '{print $1}'):8080"
docker compose --profile validation up
```

### Testing Connectivity

```bash
# Test 1: Can container reach host?
docker compose run --rm benchmark-validation ping -c 3 host.docker.internal

# Test 2: Can container reach KP server?
docker compose run --rm benchmark-validation \
  curl -v http://host.docker.internal:8080/health

# Test 3: Full authentication test
docker compose run --rm benchmark-validation \
  curl -H "Authorization: Bearer ${KP_API_KEY}" \
    http://host.docker.internal:8080/mcp
```

## Common Commands

### Building

```bash
# Build image
docker compose build

# Rebuild from scratch (clear cache)
docker compose build --no-cache

# Build specific service
docker compose build benchmark-validation
```

### Running

```bash
# Run with logs
docker compose --profile validation up

# Run in background
docker compose --profile validation up -d

# Run and remove container when done
docker compose --profile validation up --rm

# Run specific command
docker compose run --rm benchmark-validation \
  python3 bench_hotpotqa.py --n 50 --run_kp true
```

### Monitoring

```bash
# View logs (real-time)
docker compose logs -f benchmark-validation

# View logs (last 100 lines)
docker compose logs --tail 100 benchmark-validation

# Check container status
docker compose ps

# Check resource usage
docker stats kp-bench-validation
```

### Cleanup

```bash
# Stop containers
docker compose down

# Remove containers and volumes
docker compose down -v

# Remove images
docker compose down --rmi all

# Clean everything
docker compose down -v --rmi all
docker system prune -a
```

## Volume Mounting

Results are automatically persisted to the host:

```yaml
volumes:
  - ./output:/app/output
```

This means:
- Results survive container restarts
- You can access files directly on host
- No data loss if container crashes

**Important**: Ensure `output/` directory exists and is writable:

```bash
mkdir -p output
chmod 755 output
```

## Troubleshooting

### Issue: Container can't reach KP server

**Symptom**: Connection refused, timeout errors

**Fix**:

```bash
# Check KP server is running on host
curl localhost:8080/health

# Test from container
docker compose run --rm benchmark-validation \
  curl -v http://host.docker.internal:8080/health

# If host.docker.internal doesn't work, use host IP
export KP_API_URL="http://$(ipconfig getifaddr en0):8080"  # Mac
docker compose --profile validation up
```

### Issue: Permission denied on output files

**Symptom**: Cannot write to output directory

**Fix**:

```bash
# Fix permissions
sudo chown -R $(id -u):$(id -g) output/

# Or run container as current user (add to docker-compose.yml)
user: "${UID}:${GID}"
```

### Issue: Image build fails

**Symptom**: Dependency conflicts, import errors

**Fix**:

```bash
# Rebuild from scratch
docker compose build --no-cache

# Check Dockerfile has correct dependencies
cat Dockerfile

# Verify PyTorch and dependencies are compatible
docker compose run --rm benchmark-validation \
  python3 -c "import torch; import sentence_transformers; print('OK')"
```

### Issue: Mock data instead of real results

**Symptom**: All results identical, no latency variation

**Fix**:

```bash
# Ensure --mock_kp flag is NOT present
docker compose run --rm benchmark-validation \
  python3 bench_hotpotqa.py --n 20 --run_kp true --run_vector false

# Verify environment variables are set
docker compose config | grep KP_

# Check logs for "Mock adapter" warnings
docker compose logs benchmark-validation | grep -i mock
```

### Issue: Out of memory

**Symptom**: Container crashes, killed by OOM

**Fix**:

```bash
# Increase Docker memory limit (Docker Desktop -> Settings -> Resources)
# Recommend: 4GB minimum, 8GB preferred

# Or reduce batch size
docker compose run --rm benchmark-validation \
  python3 bench_hotpotqa.py --n 20 --batch_size 1
```

### Issue: Slow performance

**Symptom**: Benchmark takes much longer than expected

**Fix**:

```bash
# Check if vector baseline is running (slower)
# Disable it for faster testing
docker compose run --rm benchmark-validation \
  python3 bench_hotpotqa.py --n 20 --run_kp true --run_vector false

# Check Docker resource usage
docker stats kp-bench-validation

# Check KP server logs for slow queries
# May need to scale KP server resources
```

## Advanced Usage

### Custom Benchmark Commands

```bash
# Run with custom parameters
docker compose run --rm benchmark-validation \
  python3 bench_hotpotqa.py \
    --n 100 \
    --top_k 10 \
    --seed 42 \
    --run_kp true \
    --run_vector true

# Run MS MARCO
docker compose run --rm benchmark-validation \
  python3 bench_msmarco.py --n 100 --k 10

# Run all benchmarks
docker compose run --rm benchmark-validation \
  python3 run_all.py --n-hotpot 100 --freshness-mode skip
```

### Interactive Shell

```bash
# Open shell in container
docker compose run --rm benchmark-validation bash

# Then run commands interactively
python3 bench_hotpotqa.py --n 20
python3 verify_real_results.py --phase validation
exit
```

### Debugging

```bash
# Run with verbose output
docker compose run --rm benchmark-validation \
  python3 -v bench_hotpotqa.py --n 20

# Check Python environment
docker compose run --rm benchmark-validation \
  python3 -c "import sys; print(sys.version); print(sys.path)"

# Test imports
docker compose run --rm benchmark-validation \
  python3 -c "
  import torch
  import sentence_transformers
  import datasets
  import faiss
  print('All imports successful')
  "
```

### Parallel Runs

Run multiple benchmarks in parallel (separate workspaces):

```bash
# Terminal 1: HotpotQA
export KP_WORKSPACE_ID="workspace-hotpot"
docker compose --profile validation up

# Terminal 2: MS MARCO
export KP_WORKSPACE_ID="workspace-msmarco"
docker compose --profile msmarco up
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Benchmark

on:
  push:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up environment
        env:
          KP_WORKSPACE_ID: ${{ secrets.KP_WORKSPACE_ID }}
          KP_USER_ID: ${{ secrets.KP_USER_ID }}
          KP_API_KEY: ${{ secrets.KP_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          cd tests/benchmarks
          docker compose --profile validation up --abort-on-container-exit

      - name: Verify results
        run: |
          cd tests/benchmarks
          python3 verify_real_results.py --phase validation

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: tests/benchmarks/output/
```

## Performance Tips

1. **Use SSD for output directory** - Results are written incrementally
2. **Increase Docker memory** - 4GB minimum, 8GB preferred
3. **Close other applications** - Benchmarks are CPU-intensive
4. **Use cached index** - Vector baseline will reuse FAISS index if present
5. **Run validation first** - Catches issues before long runs

## Security Notes

- API keys are passed as environment variables (never hardcode)
- Use `.env` file (add to .gitignore)
- Container runs as non-root user (in Dockerfile)
- No privileged mode required
- Read-only mounts for code (only output is writable)

## Next Steps

After successful benchmark runs:

1. **Verify results**: `python3 verify_real_results.py`
2. **Statistical analysis**: `python3 statistical_analysis.py`
3. **Generate report**: Results in `output/` directory
4. **Archive results**: Git tag or export to S3
5. **Publish findings**: Use in docs, blog, paper

## Resources

- [EXECUTION_PLAN.md](./EXECUTION_PLAN.md) - Detailed execution strategy
- [README.md](../README.md) - Benchmark suite overview
- [HOTPOTQA_USAGE.md](./HOTPOTQA_USAGE.md) - HotpotQA benchmark guide
- [MSMARCO_USAGE.md](./MSMARCO_USAGE.md) - MS MARCO benchmark guide
- Docker Compose docs: https://docs.docker.com/compose/

## Support

If you encounter issues:

1. Check logs: `docker compose logs`
2. Test connectivity: See "Testing Connectivity" section
3. Verify environment variables: `docker compose config`
4. Review [EXECUTION_PLAN.md](./EXECUTION_PLAN.md) troubleshooting section
5. Open an issue on GitHub with logs and configuration
