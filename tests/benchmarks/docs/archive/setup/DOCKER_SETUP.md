# Docker Setup Guide for KnowledgePlane Benchmarks

Last updated: 2026-02-12

## Overview

This guide explains the Docker setup for the KnowledgePlane benchmarking suite, including dependency management, version selection rationale, and troubleshooting.

## Table of Contents

- [Version Selection Rationale](#version-selection-rationale)
- [Dependency Stack Architecture](#dependency-stack-architecture)
- [Building the Docker Image](#building-the-docker-image)
- [Known Issues and Workarounds](#known-issues-and-workarounds)
- [Updating Dependencies](#updating-dependencies)
- [Troubleshooting](#troubleshooting)
- [Performance Optimization](#performance-optimization)

## Version Selection Rationale

### Core ML Stack: Option B (Newer, Stable)

We selected **Option B** from our research matrix:

```
torch==2.2.0
numpy==1.26.4
sentence-transformers==2.5.1
transformers==4.38.2
datasets==2.17.1
```

### Why These Versions?

#### PyTorch 2.2.0
- **Chosen over 2.1.x**: Better performance, more features
- **Chosen over 2.3.x**: More stable, better tested, fewer edge-case bugs
- **CPU support**: Excellent CPU inference performance
- **Compatibility**: Well-tested with sentence-transformers 2.5.x
- **Size**: Reasonable Docker image size (~1GB for CPU-only version)

#### NumPy 1.26.4
- **Last pre-2.0 version**: NumPy 2.0+ introduced breaking changes
- **PyTorch compatibility**: Known to work well with PyTorch 2.2.0
- **Stability**: Very stable, widely used version
- **Binary compatibility**: Good binary wheel availability

#### sentence-transformers 2.5.1
- **Model support**: Supports all models we need (all-MiniLM-L6-v2, etc.)
- **Transformers compatibility**: Works with transformers 4.38.x
- **API stability**: Stable API, no major breaking changes
- **Performance**: Good inference speed on CPU

#### transformers 4.38.2
- **sentence-transformers compatibility**: Tested with sentence-transformers 2.5.x
- **Model coverage**: Supports all models in our benchmarks
- **Stability**: Well-tested release, fewer bugs than 4.39+
- **API**: Stable API without recent breaking changes

#### datasets 2.17.1
- **transformers compatibility**: Designed to work with transformers 4.38.x
- **Performance**: Good Arrow/Parquet support
- **Streaming**: Efficient dataset streaming for large files
- **Caching**: Reliable caching mechanism

## Dependency Stack Architecture

### Layer 1: Core Numerical Computing
```
numpy==1.26.4
scipy==1.12.0
```
Foundation for all numerical operations.

### Layer 2: Machine Learning Framework
```
torch==2.2.0
torchvision==0.17.0
torchaudio==2.2.0
```
PyTorch ecosystem for tensor operations and neural networks.

### Layer 3: NLP & Transformers
```
transformers==4.38.2
tokenizers==0.15.2
sentence-transformers==2.5.1
```
Language model inference and embeddings.

### Layer 4: Data & Datasets
```
datasets==2.17.1
pandas==2.2.1
pyarrow==15.0.0
```
Data loading, processing, and manipulation.

### Layer 5: Vector Search & Similarity
```
faiss-cpu==1.8.0
scikit-learn==1.4.1.post1
```
Efficient similarity search and machine learning utilities.

### Layer 6: API Clients & Utilities
```
openai==1.12.0
anthropic==0.18.1
aiohttp==3.9.3
requests==2.31.0
```
External API clients and HTTP utilities.

### Layer 7: Metrics & Evaluation
```
rouge-score==0.1.2
bert-score==0.3.13
nltk==3.8.1
```
Evaluation metrics for text quality.

### Layer 8: Application Utilities
```
python-dotenv==1.0.1
tqdm==4.66.2
rich==13.7.1
pytest==8.0.2
```
Environment management, progress tracking, testing.

## Building the Docker Image

### Basic Build

```bash
cd /Users/altras/home/dev/knowledgeplane/tests/benchmarks
docker build -t knowledgeplane-bench:latest -f docker/Dockerfile .
```

### Build Arguments

```bash
# Use different Python version
docker build --build-arg PYTHON_VERSION=3.11 -t knowledgeplane-bench:latest .

# Skip model pre-download (faster build, models downloaded at runtime)
docker build --build-arg PREDOWNLOAD_MODELS=false -t knowledgeplane-bench:latest .

# Use custom requirements file (for testing)
docker build --build-arg REQUIREMENTS_FILE=requirements-test.txt -t knowledgeplane-bench:latest .
```

### Multi-stage Build Benefits

1. **Smaller final image**: Only runtime dependencies included
2. **Build cache**: Intermediate layers cached for faster rebuilds
3. **Security**: No build tools in final image
4. **Reproducibility**: Exact versions locked in requirements-docker.txt

## Known Issues and Workarounds

### Issue 1: NumPy Version Conflicts

**Symptom**: Error about NumPy version mismatch or ABI incompatibility.

```
ValueError: numpy.dtype size changed, may indicate binary incompatibility
```

**Cause**: Multiple packages depend on different NumPy versions.

**Solution**: Use pinned requirements-docker.txt which ensures NumPy 1.26.4 is installed first and all other packages are compatible.

**Workaround**: If error persists, rebuild without cache:
```bash
docker build --no-cache -t knowledgeplane-bench:latest .
```

### Issue 2: PyTorch CPU vs GPU

**Symptom**: PyTorch tries to use CUDA but it's not available.

```
RuntimeError: CUDA not available
```

**Cause**: Using GPU version of PyTorch in CPU-only container.

**Solution**: Ensure requirements-docker.txt uses CPU-only PyTorch:
```
torch==2.2.0
# Not torch==2.2.0+cu118
```

**Workaround**: Set environment variable:
```bash
docker run -e CUDA_VISIBLE_DEVICES="" knowledgeplane-bench:latest
```

### Issue 3: Model Download Failures

**Symptom**: Timeout or connection error when downloading models.

```
HTTPError: 503 Server Error: Service Unavailable for url: https://huggingface.co/...
```

**Cause**: Network issues, Hugging Face API rate limits, or server downtime.

**Solution**: Pre-download models during Docker build (default behavior).

**Workaround**: Mount local cache directory:
```bash
docker run -v ~/.cache/huggingface:/root/.cache/huggingface knowledgeplane-bench:latest
```

### Issue 4: Memory Issues with Large Models

**Symptom**: Container crashes with "Killed" or OOM error.

```
Killed
```

**Cause**: Insufficient memory allocated to Docker.

**Solution**: Increase Docker memory limit (Docker Desktop settings) to at least 4GB.

**Workaround**: Use smaller models or limit batch size:
```bash
docker run -e BATCH_SIZE=1 knowledgeplane-bench:latest
```

### Issue 5: Slow First Run

**Symptom**: First benchmark run takes very long.

**Cause**: Models being downloaded and cached at runtime.

**Solution**: Use Docker image with pre-downloaded models (default build).

**Workaround**: Warm up the cache in a separate step:
```bash
docker run knowledgeplane-bench:latest python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
```

### Issue 6: Tokenizers Parallelism Warning

**Symptom**: Warning about tokenizers parallelism.

```
The current process just got forked, after parallelism has already been used. Disabling parallelism to avoid deadlocks...
```

**Cause**: Tokenizers using multiple processes by default.

**Solution**: Set environment variable:
```bash
docker run -e TOKENIZERS_PARALLELISM=false knowledgeplane-bench:latest
```

## Updating Dependencies

### When to Update

Consider updating dependencies when:
- Security vulnerabilities are announced
- Major new features are needed
- Bug fixes are available for issues you're experiencing
- PyPI shows new stable releases (wait 2-4 weeks after release)

### How to Update Safely

#### 1. Update One Layer at a Time

Start with the lowest layer and work up:

```bash
# Step 1: Update numpy (foundation)
pip install numpy==1.27.0  # hypothetical new version
pip check  # verify no conflicts

# Step 2: Update torch
pip install torch==2.3.0
pip check

# Step 3: Update transformers ecosystem
pip install transformers==4.40.0 sentence-transformers==2.6.0
pip check

# Step 4: Update application layer
pip install datasets==2.19.0
pip check
```

#### 2. Test Thoroughly

After each update, run:
```bash
# Unit tests
pytest tests/

# Integration tests
pytest tests/integration/

# Run a small benchmark
python run_benchmarks.py --datasets dummy --limit 10
```

#### 3. Generate New requirements-docker.txt

```bash
# Export all installed versions
pip freeze > requirements-docker-new.txt

# Clean up (remove local packages, editable installs, etc.)
# Organize by category
# Add comments explaining version choices

# Test the new file
python -m venv test_env
source test_env/bin/activate
pip install -r requirements-docker-new.txt
pytest tests/
deactivate
rm -rf test_env

# If all tests pass, replace old file
mv requirements-docker-new.txt requirements-docker.txt
```

#### 4. Update Docker Image

```bash
# Build with new requirements
docker build --no-cache -t knowledgeplane-bench:new .

# Test the new image
docker run knowledgeplane-bench:new pytest tests/

# If tests pass, tag as latest
docker tag knowledgeplane-bench:new knowledgeplane-bench:latest
```

#### 5. Document Changes

Update this file with:
- New version numbers
- Reasons for updating
- Any breaking changes
- New known issues

### Version Update Strategy

#### Conservative (Recommended)
- Only update when security issues or critical bugs
- Wait 4-8 weeks after new releases
- Test thoroughly before updating production

#### Moderate
- Update quarterly
- Stay 1-2 minor versions behind latest
- Balance stability with features

#### Aggressive (Not Recommended for Production)
- Update monthly
- Use latest stable releases
- Accept some instability for newest features

## Troubleshooting

### General Debugging Strategy

1. **Check logs**: Look at Docker build logs and runtime logs
2. **Verify versions**: Ensure all packages match requirements-docker.txt
3. **Check dependencies**: Run `pip check` to find conflicts
4. **Isolate the issue**: Test components individually
5. **Check resources**: Ensure sufficient CPU, RAM, disk space

### Common Commands

```bash
# Check installed versions in container
docker run knowledgeplane-bench:latest pip list

# Check for dependency conflicts
docker run knowledgeplane-bench:latest pip check

# Interactive debugging
docker run -it knowledgeplane-bench:latest bash

# Check resource usage
docker stats knowledgeplane-bench

# View build history
docker history knowledgeplane-bench:latest

# Inspect image details
docker inspect knowledgeplane-bench:latest
```

### Build Failures

#### Error: "Could not find a version that satisfies the requirement..."

**Cause**: Package version not available or typo in requirements.txt.

**Solution**:
1. Check package name spelling
2. Verify version exists on PyPI
3. Try with version range instead of exact pin temporarily

#### Error: "No matching distribution found for..."

**Cause**: Package doesn't have wheels for your platform/Python version.

**Solution**:
1. Check Python version compatibility
2. Try different Python version in Dockerfile
3. Install build dependencies (gcc, python-dev) if source build needed

#### Error: Build hangs during pip install

**Cause**: Large downloads, slow network, or source compilation.

**Solution**:
1. Increase Docker build timeout
2. Use PyPI mirror closer to your location
3. Pre-download large packages

### Runtime Failures

#### Error: "ModuleNotFoundError: No module named..."

**Cause**: Package not installed or not in PYTHONPATH.

**Solution**:
1. Verify package in pip list
2. Check virtual environment activation
3. Rebuild Docker image

#### Error: "ImportError: ... undefined symbol..."

**Cause**: Binary incompatibility between packages.

**Solution**:
1. Use requirements-docker.txt with verified versions
2. Rebuild without cache
3. Check NumPy version compatibility

#### Error: "RuntimeError: DataLoader worker ... is killed by signal: Bus error"

**Cause**: Shared memory too small.

**Solution**:
```bash
docker run --shm-size=2g knowledgeplane-bench:latest
```

## Performance Optimization

### Docker Build Performance

#### 1. Use Build Cache Effectively

```dockerfile
# Install dependencies before copying code (cache-friendly)
COPY requirements-docker.txt /app/
RUN pip install -r requirements-docker.txt

# Copy code last (changes frequently)
COPY . /app/
```

#### 2. Multi-stage Builds

```dockerfile
# Builder stage: compile dependencies
FROM python:3.11-slim as builder
RUN pip install --user -r requirements-docker.txt

# Runtime stage: copy only needed files
FROM python:3.11-slim
COPY --from=builder /root/.local /root/.local
```

#### 3. Parallel Downloads

```dockerfile
# Use pip's parallel download
RUN pip install --no-cache-dir -r requirements-docker.txt --prefer-binary
```

### Runtime Performance

#### 1. Pre-download Models

```dockerfile
# Download during build, not runtime
RUN python -c "from sentence_transformers import SentenceTransformer; \
    SentenceTransformer('all-MiniLM-L6-v2')"
```

#### 2. Optimize PyTorch

```python
import torch
torch.set_num_threads(4)  # Adjust based on CPU cores
torch.set_num_interop_threads(2)
```

#### 3. Enable Caching

```bash
# Mount cache directory
docker run -v ~/.cache/huggingface:/root/.cache/huggingface \
           -v ~/.cache/torch:/root/.cache/torch \
           knowledgeplane-bench:latest
```

#### 4. Use Faster Image Base

```dockerfile
# Use slim instead of full Python image
FROM python:3.11-slim

# Or use Alpine for even smaller size (may need build deps)
FROM python:3.11-alpine
```

### Memory Optimization

#### 1. Clean Up After Build

```dockerfile
RUN pip install --no-cache-dir -r requirements-docker.txt \
    && rm -rf /root/.cache/pip \
    && find /usr/local/lib/python3.11/site-packages -name "*.pyc" -delete
```

#### 2. Use Smaller Models

```python
# Instead of all-mpnet-base-v2 (420MB)
model = SentenceTransformer('all-MiniLM-L6-v2')  # 80MB
```

#### 3. Limit Batch Size

```python
# Process in smaller batches
embeddings = model.encode(texts, batch_size=16)  # Instead of 32 or 64
```

## Best Practices

### 1. Always Pin Versions

```txt
# Good
torch==2.2.0

# Bad
torch>=2.0.0
torch
```

### 2. Document Version Choices

Add comments explaining why specific versions were chosen.

### 3. Test Before Deploying

Always test new Docker images thoroughly before production deployment.

### 4. Use Multi-stage Builds

Separate build and runtime stages for smaller, more secure images.

### 5. Tag Images Properly

```bash
# Tag with version and date
docker tag knowledgeplane-bench:latest knowledgeplane-bench:2.2.0-20260212
```

### 6. Monitor Security

Regularly scan for vulnerabilities:
```bash
docker scan knowledgeplane-bench:latest
```

### 7. Keep Documentation Updated

Update this document whenever you make changes to dependencies.

## References

- [PyTorch Installation Guide](https://pytorch.org/get-started/locally/)
- [Hugging Face Transformers Documentation](https://huggingface.co/docs/transformers)
- [sentence-transformers Documentation](https://www.sbert.net/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [NumPy Version Compatibility](https://numpy.org/neps/nep-0029-deprecation_policy.html)

## Changelog

### 2026-02-12
- Initial version selection: PyTorch 2.2.0, NumPy 1.26.4, sentence-transformers 2.5.1
- Created comprehensive dependency documentation
- Documented known issues and workarounds
- Added troubleshooting guide

---

For questions or issues, please contact the development team or file an issue in the repository.
