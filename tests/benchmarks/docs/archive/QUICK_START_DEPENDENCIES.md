# Quick Start: Dependency Setup

Fast guide to get the benchmark dependencies installed correctly.

## TL;DR

```bash
# Python 3.11 recommended
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements-docker.txt
python scripts/validate_dependencies.py
```

## Prerequisites

- Python 3.10, 3.11, or 3.12 (3.11 recommended)
- pip 23.0+
- 4GB+ free RAM
- 3GB+ free disk space

## Installation Methods

### Method 1: Docker (Recommended for Production)

```bash
# Build the Docker image
cd /Users/altras/home/dev/knowledgeplane/tests/benchmarks
docker build -t knowledgeplane-bench:latest -f docker/Dockerfile .

# Run benchmarks in container
docker run --rm \
  -v $(pwd)/results:/app/results \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  knowledgeplane-bench:latest \
  python run_benchmarks.py

# Or get a shell
docker run -it --rm knowledgeplane-bench:latest bash
```

### Method 2: Virtual Environment (Development)

```bash
# Create virtual environment
python3.11 -m venv venv

# Activate it
source venv/bin/activate  # Linux/macOS
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install --upgrade pip setuptools wheel
pip install -r requirements-docker.txt

# Validate installation
python scripts/validate_dependencies.py

# You're ready!
python run_benchmarks.py --help
```

### Method 3: System-wide (Not Recommended)

```bash
# Only if you know what you're doing
pip install --user -r requirements-docker.txt
python scripts/validate_dependencies.py
```

## Validation

After installation, run the validation script:

```bash
# Quick check (imports only)
python scripts/validate_dependencies.py --quick

# Full validation (recommended)
python scripts/validate_dependencies.py

# Verbose output
python scripts/validate_dependencies.py --verbose
```

Expected output:
```
================================================================================
        KnowledgePlane Benchmark Dependency Validator
================================================================================

✓ Python Version: Python 3.11.7
✓ numpy: numpy imported successfully (version 1.26.4)
✓ torch: torch imported successfully (version 2.2.0)
✓ transformers: transformers imported successfully (version 4.38.2)
✓ sentence-transformers: sentence-transformers imported successfully (version 2.5.1)
✓ datasets: datasets imported successfully (version 2.17.1)
...
================================================================================
                              Summary
================================================================================

✓ All 20 checks passed! ✨
```

## Troubleshooting

### Problem: "No module named 'X'"

**Solution:**
```bash
# Check you're in the virtual environment
which python  # Should show venv path

# Reinstall dependencies
pip install -r requirements-docker.txt
```

### Problem: Version conflicts

**Solution:**
```bash
# Force reinstall with exact versions
pip install -r requirements-docker.txt --force-reinstall

# Or start fresh
deactivate
rm -rf venv
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements-docker.txt
```

### Problem: "numpy.dtype size changed"

**Solution:**
```bash
# NumPy binary incompatibility - force rebuild
pip uninstall numpy -y
pip install numpy==1.26.4 --no-binary numpy
pip install -r requirements-docker.txt --force-reinstall
```

### Problem: Import torch fails

**Solution:**
```bash
# Make sure you have the CPU version
pip uninstall torch torchvision torchaudio -y
pip install torch==2.2.0 torchvision==0.17.0 torchaudio==2.2.0 --index-url https://download.pytorch.org/whl/cpu
```

### Problem: Out of memory during installation

**Solution:**
```bash
# Install one package at a time
pip install numpy==1.26.4
pip install torch==2.2.0 torchvision==0.17.0 torchaudio==2.2.0
pip install transformers==4.38.2
pip install sentence-transformers==2.5.1
pip install -r requirements-docker.txt
```

## Updating Dependencies

### When to Update

- Security advisories (update immediately)
- Critical bug fixes (update soon)
- New features needed (update after testing)
- Regular maintenance (quarterly)

### How to Update

1. **Check current versions:**
   ```bash
   pip list | grep -E "torch|numpy|transformers"
   ```

2. **Review changelog:**
   - Check release notes for breaking changes
   - Review security advisories

3. **Test in development:**
   ```bash
   python -m venv test_env
   source test_env/bin/activate
   # Edit requirements-docker.txt with new versions
   pip install -r requirements-docker.txt
   python scripts/validate_dependencies.py
   pytest tests/
   deactivate
   rm -rf test_env
   ```

4. **Update production:**
   ```bash
   # Backup current environment
   pip freeze > requirements-backup.txt

   # Install new versions
   pip install -r requirements-docker.txt --upgrade

   # Validate
   python scripts/validate_dependencies.py

   # If issues, rollback
   pip install -r requirements-backup.txt
   ```

## Development vs Production

### Development Environment

```bash
# Use loose constraints for flexibility
pip install -r requirements-bench.txt

# This allows pip to resolve versions
# Good for: development, experimentation, testing new versions
```

### Production Environment

```bash
# Use pinned versions for reproducibility
pip install -r requirements-docker.txt

# This ensures exact versions
# Good for: production, Docker, CI/CD, reproducible results
```

## Platform-Specific Notes

### Linux
```bash
# Everything should work out of the box
pip install -r requirements-docker.txt
```

### macOS (Intel)
```bash
# Works the same as Linux
pip install -r requirements-docker.txt
```

### macOS (Apple Silicon)
```bash
# May need Rosetta for some packages
arch -x86_64 pip install -r requirements-docker.txt
# Or use ARM-native packages (slower for some ops)
pip install -r requirements-docker.txt
```

### Windows
```bash
# Use PowerShell or CMD
python -m venv venv
venv\Scripts\activate
pip install -r requirements-docker.txt

# If you see SSL errors:
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements-docker.txt
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Set up Python
  uses: actions/setup-python@v4
  with:
    python-version: '3.11'

- name: Install dependencies
  run: |
    python -m pip install --upgrade pip
    pip install -r requirements-docker.txt

- name: Validate dependencies
  run: python scripts/validate_dependencies.py
```

### Docker Build

```yaml
# docker-compose.yml
services:
  benchmark:
    build:
      context: .
      dockerfile: docker/Dockerfile
    volumes:
      - ./results:/app/results
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
```

## Performance Tips

### Faster Installation

```bash
# Use binary wheels (faster than building from source)
pip install -r requirements-docker.txt --prefer-binary

# Use pip's cache
pip install -r requirements-docker.txt --cache-dir ~/.cache/pip

# Parallel downloads (pip 23.1+)
pip install -r requirements-docker.txt --use-feature=fast-deps
```

### Smaller Docker Images

```dockerfile
# Use slim base image
FROM python:3.11-slim

# Install in one layer
RUN pip install --no-cache-dir -r requirements-docker.txt

# Remove unnecessary files
RUN find /usr/local/lib/python3.11/site-packages -name "*.pyc" -delete
```

### Faster Runtime

```python
# Set optimal thread counts
import torch
torch.set_num_threads(4)  # Adjust based on CPU cores

# Disable tokenizer parallelism if using multiprocessing
import os
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
```

## Getting Help

1. **Check validation output:**
   ```bash
   python scripts/validate_dependencies.py --verbose
   ```

2. **Check for conflicts:**
   ```bash
   pip check
   ```

3. **View installed versions:**
   ```bash
   pip list | grep -E "torch|numpy|transformers|sentence-transformers|datasets"
   ```

4. **Check documentation:**
   - `docs/DOCKER_SETUP.md` - Full setup guide
   - `docs/VERSION_MATRIX.md` - Version compatibility
   - `docs/DEPENDENCY_RESEARCH.md` - Research rationale

5. **Common issues:**
   - Memory errors → Increase Docker memory limit
   - Import errors → Check virtual environment
   - Version conflicts → Use `--force-reinstall`
   - Slow installation → Use `--prefer-binary`

## Next Steps

After successful installation:

1. **Run validation:**
   ```bash
   python scripts/validate_dependencies.py
   ```

2. **Test the benchmark suite:**
   ```bash
   python run_benchmarks.py --help
   ```

3. **Run a quick test:**
   ```bash
   python run_benchmarks.py --datasets dummy --limit 10
   ```

4. **Check the results:**
   ```bash
   ls -lh results/
   ```

## Summary

✅ **Recommended setup:**
```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements-docker.txt
python scripts/validate_dependencies.py
```

✅ **For Docker:**
```bash
docker build -t knowledgeplane-bench:latest -f docker/Dockerfile .
docker run knowledgeplane-bench:latest python scripts/validate_dependencies.py
```

✅ **Validation passes:** You're ready to run benchmarks!

---

Need more details? See:
- 📘 [Full Setup Guide](DOCKER_SETUP.md)
- 📊 [Version Matrix](VERSION_MATRIX.md)
- 🔬 [Research Summary](DEPENDENCY_RESEARCH.md)
