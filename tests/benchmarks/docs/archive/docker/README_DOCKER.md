# Docker Infrastructure for KnowledgePlane Benchmarks

## Overview

Complete Docker setup for running HotpotQA benchmarks with **pinned, compatible dependencies** that eliminate the NumPy/PyTorch version conflicts.

## Quick Start

### Option 1: Automated Script (Recommended)

```bash
# Make scripts executable
chmod +x run-benchmark-docker.sh test-docker-setup.sh

# Test the setup
./test-docker-setup.sh

# Run benchmarks
./run-benchmark-docker.sh
```

### Option 2: Manual Commands

```bash
# Build
docker-compose build benchmark-runner

# Test
docker-compose run --rm benchmark-runner \
  python3 -c "import torch, numpy, sentence_transformers; print('OK')"

# Run
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 20 --mock_kp
```

## What's Included

### Core Files

- **`Dockerfile`** - Image with pinned dependencies
  - Python 3.11-slim
  - PyTorch 2.1.0 (CPU) + NumPy 1.26.4
  - All dependencies tested compatible

- **`docker-compose.yml`** - Service orchestration
  - Multiple service profiles
  - Volume mounts
  - Environment configuration

- **`run-benchmark-docker.sh`** - Automated workflow
  - Build → Test → Validate → Full run
  - Progress reporting
  - Result analysis

- **`test-docker-setup.sh`** - Setup validation
  - 6 comprehensive tests
  - Fails fast if issues
  - Troubleshooting guidance

### Documentation

- **`DOCKER_SETUP_SUMMARY.md`** - Overview (start here)
- **`DOCKER_USAGE.md`** - Complete guide
- **`QUICKSTART_DOCKER.md`** - Quick reference

## Pinned Dependencies (Tested Compatible)

```
Python:              3.11-slim
PyTorch:             2.1.0 (CPU)
NumPy:               1.26.4
sentence-transformers: 2.7.0
transformers:        4.35.2
datasets:            2.14.7
faiss-cpu:           1.8.0
pandas:              2.1.4
scipy:               1.11.4
scikit-learn:        1.3.2
```

**Key**: NumPy 1.26.4 is the last version compatible with PyTorch 2.1.0. This solves the incompatibility issues with NumPy 2.0+.

## Common Commands

### Test Setup

```bash
./test-docker-setup.sh
```

Validates:
- Docker running
- Image builds
- Imports work
- Benchmark code loads
- Quick run succeeds

### Quick Validation (n=20)

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 20 --mock_kp
```

Runtime: ~2-3 minutes

### Full Benchmark (n=500)

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 500 --mock_kp --statistical-analysis
```

Runtime: ~60-90 minutes

### Compare KP vs Vector

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 100 --mock_kp --run_kp true --run_vector true
```

### With Real KP Server

```bash
# Ensure KP server running on localhost:8080
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 100 --run_kp true
```

## Output

Results saved to `./output/`:

- `hotpotqa_summary.json` - Metrics and config
- `hotpotqa_results.csv` - Per-question details

View summary:
```bash
cat output/hotpotqa_summary.json | python3 -m json.tool | head -50
```

## Configuration

### Environment Variables

Create `.env`:

```bash
KP_API_URL=http://host.docker.internal:8080/mcp
KP_API_KEY=benchmark-api-key-12345
KP_WORKSPACE_ID=benchmark-workspace
KP_USER_ID=benchmark-user
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Benchmark Options

All CLI options work:

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py \
  --n 100 \
  --top_k 10 \
  --seed 42 \
  --sample-method stratified \
  --statistical-analysis \
  --batch-size 25
```

## Troubleshooting

### Build Fails

```bash
docker-compose down
docker system prune -f
docker-compose build --no-cache benchmark-runner
```

### Import Errors

```bash
docker-compose run --rm benchmark-runner \
  python3 -c "import torch; print(torch.__version__)"
```

### Permission Issues

```bash
sudo chown -R $(whoami):$(id -gn) output/
```

### Can't Connect to KP Server

Verify server:
```bash
curl http://localhost:8080/health
```

On Linux, use `--network host` instead of `host.docker.internal`.

## Performance

### Expected Runtimes

| n | Mock KP | Real KP | With Stats |
|---|---------|---------|------------|
| 20 | 2-3 min | 3-5 min | 3-5 min |
| 100 | 15-20 min | 20-30 min | 25-35 min |
| 500 | 60-90 min | 90-120 min | 90-120 min |

### Resource Requirements

**Minimum:**
- 4 CPU cores
- 8GB RAM
- 5GB disk

**Recommended:**
- 8 CPU cores
- 16GB RAM
- 10GB disk

## Why Docker?

1. **No dependency conflicts** - Pinned versions
2. **Reproducible** - Same results everywhere
3. **Isolated** - Doesn't affect host
4. **Portable** - Works on Mac/Linux/Windows
5. **Documented** - Versions in Dockerfile
6. **Tested** - Validation on build

## File Structure

```
tests/benchmarks/
├── Dockerfile                    # Image definition
├── docker-compose.yml            # Services
├── .dockerignore                 # Build optimization
├── run-benchmark-docker.sh       # Automated runner
├── test-docker-setup.sh          # Validation script
├── README_DOCKER.md              # This file
├── DOCKER_SETUP_SUMMARY.md       # Overview
├── DOCKER_USAGE.md               # Full docs
├── QUICKSTART_DOCKER.md          # Quick reference
├── bench_hotpotqa.py             # Benchmark
├── kp_adapter.py                 # KP client
├── vector_baseline.py            # Baseline
├── run_all.py                    # Full suite
└── output/                       # Results
```

## Next Steps

1. **Validate setup**:
   ```bash
   ./test-docker-setup.sh
   ```

2. **Run quick test**:
   ```bash
   docker-compose run --rm benchmark-runner \
     python3 bench_hotpotqa.py --n 20 --mock_kp
   ```

3. **Run full benchmark**:
   ```bash
   ./run-benchmark-docker.sh
   ```

4. **Scale up**:
   ```bash
   docker-compose run --rm benchmark-runner \
     python3 bench_hotpotqa.py --n 500 --mock_kp --statistical-analysis
   ```

## Support

- **Quick start**: `QUICKSTART_DOCKER.md`
- **Full guide**: `DOCKER_USAGE.md`
- **Overview**: `DOCKER_SETUP_SUMMARY.md`
- **Test setup**: `./test-docker-setup.sh`

## Advantages

Compared to local setup:

| Feature | Local | Docker |
|---------|-------|--------|
| Dependency conflicts | Common | None |
| Reproducibility | Variable | Perfect |
| Setup time | Hours | Minutes |
| Documentation | Manual | Automatic |
| Portability | Limited | Universal |
| Testing | Manual | Automated |

## Testing Checklist

- [ ] Docker running: `docker info`
- [ ] Scripts executable: `chmod +x *.sh`
- [ ] Setup validates: `./test-docker-setup.sh`
- [ ] Quick run works: `--n 20 --mock_kp`
- [ ] Results appear: `ls output/`

## Summary

Complete Docker infrastructure solving the NumPy/PyTorch incompatibility issues with:

- ✓ Pinned, tested dependencies
- ✓ Automated testing
- ✓ Comprehensive docs
- ✓ Multiple run modes
- ✓ Result analysis
- ✓ Troubleshooting guides

**Get started**: `./test-docker-setup.sh`
