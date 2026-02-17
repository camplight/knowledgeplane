# KnowledgePlane Benchmarks - Docker Usage Guide

## Overview

This Docker setup provides a fully isolated environment for running KnowledgePlane benchmarks with pinned, compatible dependencies. No need to worry about Python version conflicts, dependency issues, or system-specific problems.

## Quick Start

### 1. Build and Run with Automated Script

The easiest way to run benchmarks:

```bash
chmod +x run-benchmark-docker.sh  # Make executable (first time only)
./run-benchmark-docker.sh
```

This will:
1. Build the Docker image with all pinned dependencies
2. Test imports to verify everything works
3. Run validation benchmark (n=20)
4. Ask if you want to proceed with full benchmark (n=500)
5. Generate comprehensive results with statistical analysis

### 2. Manual Docker Commands

#### Build the image:

```bash
docker-compose build benchmark-runner
```

#### Run validation (n=20):

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 20 --mock_kp
```

#### Run full benchmark (n=500):

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 500 --mock_kp --statistical-analysis
```

#### Run with real KP server:

```bash
# Make sure KP server is running on host at localhost:8080
docker-compose run --rm benchmark-runner-kp \
  python3 bench_hotpotqa.py --n 100 --run_kp true
```

## Pinned Dependencies

The Docker image uses carefully selected, compatible versions:

- **Python**: 3.11-slim
- **PyTorch**: 2.1.0 (CPU version)
- **NumPy**: 1.26.4 (compatible with PyTorch 2.1.0)
- **sentence-transformers**: 2.7.0
- **transformers**: 4.35.2
- **datasets**: 2.14.7
- **faiss-cpu**: 1.8.0
- **pandas**: 2.1.4
- **scipy**: 1.11.4
- **scikit-learn**: 1.3.2

All versions have been tested to work together without conflicts.

## Configuration

### Environment Variables

Set these in `.env` file or pass to Docker:

```bash
# KP Server Connection
KP_API_URL=http://host.docker.internal:8080/mcp
KP_API_KEY=benchmark-api-key-12345
KP_WORKSPACE_ID=benchmark-workspace
KP_USER_ID=benchmark-user

# Optional: OpenAI API Key (for embeddings)
OPENAI_API_KEY=sk-...

# Optional: Anthropic API Key (for Claude)
ANTHROPIC_API_KEY=sk-ant-...
```

### Docker Compose Profiles

The setup includes multiple service profiles:

#### Default Profile (mock KP):
```bash
docker-compose up benchmark-runner
```

#### Full Profile (with real KP server):
```bash
docker-compose --profile full up benchmark-runner-kp
```

#### Full Suite (all benchmarks):
```bash
docker-compose --profile full up benchmark-suite
```

## Output Files

All results are saved to `./output/` directory (mounted from host):

- `hotpotqa_results.csv` - Detailed per-question results
- `hotpotqa_summary.json` - Aggregate metrics and configuration
- `benchmark_report_*.json` - Combined report from full suite

## Common Use Cases

### 1. Quick Validation Test

Test that everything works (runs in ~2 minutes):

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 20 --mock_kp
```

### 2. Full Statistical Benchmark

Run with statistical analysis (runs in ~30-60 minutes):

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 500 --mock_kp --statistical-analysis
```

### 3. Compare KP vs Vector Baseline

Run both systems side-by-side:

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 100 --mock_kp --run_kp true --run_vector true
```

### 4. Custom Configuration

Override any parameter:

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py \
  --n 50 \
  --top_k 10 \
  --seed 123 \
  --sample-method stratified \
  --statistical-analysis
```

### 5. Run Full Benchmark Suite

Run HotpotQA + Freshness benchmarks:

```bash
docker-compose run --rm benchmark-runner \
  python3 run_all.py --n-hotpot 100 --mock_kp --freshness-mode skip
```

## Troubleshooting

### Docker Build Fails

If the build fails with dependency conflicts:

1. Clean Docker cache:
   ```bash
   docker-compose down
   docker system prune -f
   ```

2. Rebuild from scratch:
   ```bash
   docker-compose build --no-cache benchmark-runner
   ```

### Import Errors

Test imports explicitly:

```bash
docker-compose run --rm benchmark-runner python3 -c "
import torch
import numpy
import sentence_transformers
import datasets
import faiss
print('All imports successful!')
print(f'PyTorch: {torch.__version__}')
print(f'NumPy: {numpy.__version__}')
"
```

### Cannot Connect to KP Server

Make sure:
1. KP server is running on host: `curl http://localhost:8080/health`
2. Docker can access host network (should work with `host.docker.internal`)
3. Check firewall settings

On Linux, use `--network host` instead of `host.docker.internal`:

```bash
docker run --rm --network host \
  -v $(pwd):/app \
  -v $(pwd)/output:/app/output \
  kp-benchmark-runner \
  python3 bench_hotpotqa.py --n 20
```

### Permission Issues with Output Files

If output files have wrong permissions:

```bash
# Fix ownership (replace 1000:1000 with your UID:GID)
sudo chown -R 1000:1000 output/
```

Or add user mapping to docker-compose.yml:

```yaml
services:
  benchmark-runner:
    user: "${UID}:${GID}"
```

Then run with:

```bash
UID=$(id -u) GID=$(id -g) docker-compose run --rm benchmark-runner ...
```

## Performance Notes

### Expected Runtimes

- **n=20** (validation): ~2-3 minutes
- **n=50**: ~5-8 minutes
- **n=100**: ~15-20 minutes
- **n=500**: ~60-90 minutes (with statistical analysis)

Times vary based on:
- Hardware (CPU cores, RAM)
- Whether using mock or real KP server
- Network latency (if using real APIs)
- Disk I/O speed

### Resource Requirements

Recommended:
- **CPU**: 4+ cores
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 5GB for image + output files

Docker resource settings (Docker Desktop → Settings → Resources):
- CPUs: 4
- Memory: 8GB
- Disk: 20GB

## Development

### Updating Dependencies

To update dependencies, edit `Dockerfile` and rebuild:

```bash
# Edit Dockerfile to change version numbers
vim Dockerfile

# Rebuild
docker-compose build --no-cache benchmark-runner

# Test
docker-compose run --rm benchmark-runner python3 -c "import torch; print(torch.__version__)"
```

### Adding New Benchmarks

1. Add Python file to `/app/`
2. Update docker-compose.yml with new service
3. Rebuild and test

### Mounting Local Code

The docker-compose.yml already mounts `.:/app`, so local changes are immediately available:

```bash
# Edit local file
vim bench_hotpotqa.py

# Run with changes (no rebuild needed)
docker-compose run --rm benchmark-runner python3 bench_hotpotqa.py --n 10
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Benchmark
on: [push]
jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker-compose build benchmark-runner
      - name: Run benchmarks
        run: docker-compose run --rm benchmark-runner python3 bench_hotpotqa.py --n 20 --mock_kp
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: output/
```

## Support

For issues or questions:
- Check container logs: `docker-compose logs benchmark-runner`
- Test imports: `docker-compose run --rm benchmark-runner python3 -c "import torch; import numpy"`
- Rebuild from scratch: `docker-compose build --no-cache`
- Review Dockerfile for pinned versions

## License

Same as KnowledgePlane project.
