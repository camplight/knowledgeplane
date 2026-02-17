# Quick Start - Docker Benchmarks

## Prerequisites

1. **Docker Desktop** installed and running
2. **Docker Compose** (included with Docker Desktop)

Verify installation:
```bash
docker --version
docker-compose --version
```

## Step 1: Build the Image

From the `tests/benchmarks` directory:

```bash
cd /Users/altras/home/dev/knowledgeplane/tests/benchmarks
docker-compose build benchmark-runner
```

Expected output:
- Building image (5-10 minutes first time)
- Installing Python dependencies with pinned versions
- Testing imports

## Step 2: Test Imports

Verify all dependencies work:

```bash
docker-compose run --rm benchmark-runner python3 -c "
import torch
import numpy
import sentence_transformers
import datasets
import faiss
print('✓ All imports successful!')
print(f'PyTorch: {torch.__version__}')
print(f'NumPy: {numpy.__version__}')
print(f'sentence-transformers: {sentence_transformers.__version__}')
"
```

Expected output:
```
✓ All imports successful!
PyTorch: 2.1.0+cpu
NumPy: 1.26.4
sentence-transformers: 2.7.0
```

## Step 3: Run Quick Test (n=20)

Run a quick validation with mock KP server:

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 20 --mock_kp
```

This will:
- Load 20 questions from HotpotQA
- Run benchmark with mock KP adapter
- Save results to `output/hotpotqa_summary.json`
- Take about 2-3 minutes

## Step 4: Check Results

View summary:

```bash
cat output/hotpotqa_summary.json | python3 -m json.tool | head -50
```

Or use the automated script:

```bash
chmod +x run-benchmark-docker.sh
./run-benchmark-docker.sh
```

## Common Issues

### Issue: Docker build fails with "no space left on device"

**Solution:** Clean up Docker:
```bash
docker system prune -a -f
docker volume prune -f
```

### Issue: Import errors (incompatible versions)

**Solution:** Rebuild from scratch:
```bash
docker-compose down
docker-compose build --no-cache benchmark-runner
```

### Issue: Permission denied on run-benchmark-docker.sh

**Solution:** Make it executable:
```bash
chmod +x run-benchmark-docker.sh
```

### Issue: Output files have wrong permissions

**Solution:** Fix ownership:
```bash
sudo chown -R $(whoami):$(id -gn) output/
```

## Next Steps

### Run Full Benchmark (n=500)

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 500 --mock_kp --statistical-analysis
```

Takes 60-90 minutes, generates statistical analysis.

### Run with Real KP Server

1. Start KP server on host (port 8080)
2. Run benchmark:
```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 100 --run_kp true --run_vector false
```

### Compare KP vs Vector Baseline

```bash
docker-compose run --rm benchmark-runner \
  python3 bench_hotpotqa.py --n 100 --mock_kp --run_kp true --run_vector true
```

## Pinned Versions (Tested & Compatible)

| Package | Version | Notes |
|---------|---------|-------|
| Python | 3.11-slim | Base image |
| PyTorch | 2.1.0 | CPU version, stable |
| NumPy | 1.26.4 | Compatible with PyTorch 2.1.0 |
| sentence-transformers | 2.7.0 | Works with PyTorch 2.1.0 |
| transformers | 4.35.2 | HuggingFace transformers |
| datasets | 2.14.7 | HuggingFace datasets |
| faiss-cpu | 1.8.0 | Vector search |
| pandas | 2.1.4 | Data manipulation |
| scipy | 1.11.4 | Scientific computing |
| scikit-learn | 1.3.2 | ML utilities |

## Troubleshooting Commands

Test specific import:
```bash
docker-compose run --rm benchmark-runner python3 -c "import torch; print(torch.__version__)"
```

Check Python version:
```bash
docker-compose run --rm benchmark-runner python3 --version
```

List installed packages:
```bash
docker-compose run --rm benchmark-runner pip list
```

Shell into container:
```bash
docker-compose run --rm benchmark-runner bash
```

View logs:
```bash
docker-compose logs benchmark-runner
```

## Clean Up

Remove containers:
```bash
docker-compose down
```

Remove images:
```bash
docker-compose down --rmi all
```

Clean everything:
```bash
docker system prune -a -f
```

## Performance Tips

1. **Allocate more resources** to Docker Desktop:
   - Settings → Resources → Advanced
   - CPUs: 4+ cores
   - Memory: 8+ GB

2. **Use SSD** for better I/O performance

3. **Run in background** for long benchmarks:
   ```bash
   docker-compose run -d benchmark-runner python3 bench_hotpotqa.py --n 500
   ```

4. **Monitor resource usage**:
   ```bash
   docker stats
   ```

## Support

Full documentation in `DOCKER_USAGE.md`.

For issues:
1. Check Docker is running: `docker info`
2. Verify image built: `docker images | grep benchmark`
3. Test imports: See Step 2 above
4. Review logs: `docker-compose logs`
