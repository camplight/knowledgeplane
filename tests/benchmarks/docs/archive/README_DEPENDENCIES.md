# Benchmark Dependencies Documentation

Complete documentation for KnowledgePlane benchmark dependency management.

## Overview

This directory contains comprehensive documentation for managing the benchmark suite's Python dependencies. The selected stack prioritizes **stability, compatibility, and reproducibility** while providing modern features and good performance.

## Selected Stack (Option B - Recommended)

| Component | Version | Rationale |
|-----------|---------|-----------|
| **Python** | 3.10-3.12 (3.11 recommended) | Best compatibility |
| **PyTorch** | 2.2.0 | Stable, CPU-optimized |
| **NumPy** | 1.26.4 | Last pre-2.0, broad compatibility |
| **sentence-transformers** | 2.5.1 | Stable, good model support |
| **transformers** | 4.38.2 | Well-tested, compatible |
| **datasets** | 2.17.1 | Stable Arrow implementation |
| **FAISS** | 1.8.0 | Latest CPU version |

See [DEPENDENCY_RESEARCH.md](DEPENDENCY_RESEARCH.md) for detailed rationale.

## Documentation Files

### Quick Reference
- **[QUICK_START_DEPENDENCIES.md](QUICK_START_DEPENDENCIES.md)** - Fast installation guide
  - TL;DR commands
  - Common troubleshooting
  - Platform-specific notes

### Comprehensive Guides
- **[DOCKER_SETUP.md](DOCKER_SETUP.md)** - Complete Docker setup guide
  - Build instructions
  - Known issues and workarounds
  - Performance optimization
  - Update procedures

- **[VERSION_MATRIX.md](VERSION_MATRIX.md)** - Version compatibility reference
  - Compatibility rules
  - Alternative version sets
  - Migration paths
  - Testing matrix

- **[DEPENDENCY_RESEARCH.md](DEPENDENCY_RESEARCH.md)** - Research summary
  - Three evaluated options
  - Decision rationale
  - Performance characteristics
  - Future update plans

### Implementation Files
- **[../requirements-docker.txt](../requirements-docker.txt)** - Pinned dependencies
  - Exact versions for reproducible builds
  - All transitive dependencies
  - Detailed comments

- **[../scripts/validate_dependencies.py](../scripts/validate_dependencies.py)** - Validation script
  - Import tests
  - Functional tests
  - Version verification

## Quick Start

### For Developers (Local Development)

```bash
# 1. Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements-docker.txt

# 3. Validate
python scripts/validate_dependencies.py

# 4. Run benchmarks
python run_benchmarks.py --help
```

### For Production (Docker)

```bash
# 1. Build image
docker build -t knowledgeplane-bench:latest -f docker/Dockerfile .

# 2. Validate
docker run knowledgeplane-bench:latest python scripts/validate_dependencies.py

# 3. Run benchmarks
docker run --rm \
  -v $(pwd)/results:/app/results \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  knowledgeplane-bench:latest \
  python run_benchmarks.py
```

## File Organization

```
tests/benchmarks/
├── requirements-bench.txt           # Loose constraints (development)
├── requirements-docker.txt          # Pinned versions (production) ✅
├── scripts/
│   └── validate_dependencies.py    # Validation tool
└── docs/
    ├── README_DEPENDENCIES.md      # This file
    ├── QUICK_START_DEPENDENCIES.md # Quick start guide
    ├── DOCKER_SETUP.md             # Comprehensive setup
    ├── VERSION_MATRIX.md           # Compatibility matrix
    └── DEPENDENCY_RESEARCH.md      # Research summary
```

## When to Use Which File

### requirements-bench.txt
- Development and experimentation
- Flexible version ranges
- Let pip resolve dependencies
- Testing compatibility with newer versions

```bash
pip install -r requirements-bench.txt
```

### requirements-docker.txt (Recommended)
- Production deployments
- Docker containers
- CI/CD pipelines
- Reproducible builds
- When exact versions matter

```bash
pip install -r requirements-docker.txt
```

## Validation

Always validate after installation:

```bash
# Quick validation (imports only)
python scripts/validate_dependencies.py --quick

# Full validation (recommended)
python scripts/validate_dependencies.py

# With verbose output
python scripts/validate_dependencies.py --verbose
```

Expected output:
- ✅ All imports successful
- ✅ Versions match expected
- ✅ No dependency conflicts
- ✅ Functional tests pass

## Version Selection Summary

We selected **Option B (Newer, Stable)** after evaluating three alternatives:

| Option | Focus | Best For |
|--------|-------|----------|
| A (Conservative) | Maximum stability | Legacy systems |
| **B (Selected)** ✅ | **Balance** | **Production** |
| C (Latest) | Newest features | Development |

**Why Option B:**
- 12+ months of production testing
- No known major bugs
- Excellent compatibility
- Good performance
- Modern features
- Broad platform support

See [DEPENDENCY_RESEARCH.md](DEPENDENCY_RESEARCH.md) for detailed analysis.

## Key Files Summary

| File | Purpose | When to Use |
|------|---------|-------------|
| **requirements-docker.txt** | Pinned versions | Production, Docker, CI/CD |
| **requirements-bench.txt** | Loose constraints | Development, experimentation |
| **validate_dependencies.py** | Validation script | After any installation |
| **QUICK_START_DEPENDENCIES.md** | Quick guide | First-time setup |
| **DOCKER_SETUP.md** | Comprehensive guide | Production deployment |
| **VERSION_MATRIX.md** | Compatibility matrix | Version updates |
| **DEPENDENCY_RESEARCH.md** | Research details | Understanding decisions |

## Deliverables Checklist

✅ **requirements-docker.txt** - Pinned dependencies with all transitive deps
✅ **DOCKER_SETUP.md** - Comprehensive setup and troubleshooting guide
✅ **VERSION_MATRIX.md** - Compatibility matrix and migration paths
✅ **DEPENDENCY_RESEARCH.md** - Research summary with decision rationale
✅ **QUICK_START_DEPENDENCIES.md** - Quick start guide
✅ **validate_dependencies.py** - Validation script with tests
✅ **README_DEPENDENCIES.md** - This overview document

## Next Steps

1. **Review**: Read [QUICK_START_DEPENDENCIES.md](QUICK_START_DEPENDENCIES.md)
2. **Install**: Follow installation instructions
3. **Validate**: Run `python scripts/validate_dependencies.py`
4. **Develop**: Start using the benchmark suite

For production deployment, see [DOCKER_SETUP.md](DOCKER_SETUP.md).

---

**Last Updated**: 2026-02-12
**Status**: ✅ Complete and validated
**Recommended Stack**: Option B (PyTorch 2.2.0, NumPy 1.26.4, sentence-transformers 2.5.1)
