# Version Compatibility Matrix

Quick reference for compatible package versions in the KnowledgePlane benchmark stack.

## Current Production Stack (Option B - Selected)

| Package | Version | Notes |
|---------|---------|-------|
| **Python** | 3.10-3.11 | 3.11 recommended |
| **torch** | 2.2.0 | CPU-only, stable release |
| **numpy** | 1.26.4 | Last pre-2.0 version |
| **sentence-transformers** | 2.5.1 | Stable, good model support |
| **transformers** | 4.38.2 | Compatible with sentence-transformers 2.5.x |
| **datasets** | 2.17.1 | Stable with good Arrow support |
| **faiss-cpu** | 1.8.0 | Latest stable |
| **scikit-learn** | 1.4.1.post1 | Latest stable |
| **pandas** | 2.2.1 | Latest stable |
| **openai** | 1.12.0 | Latest stable API client |
| **anthropic** | 0.18.1 | Latest stable API client |

## Alternative Options (Research Results)

### Option A: Conservative (Older, Ultra-Stable)

Best for: Maximum stability, legacy compatibility

| Package | Version | Pros | Cons |
|---------|---------|------|------|
| torch | 2.1.0 | Very stable, well-tested | Older features, slower |
| numpy | 1.24.3 | Rock-solid | Missing NumPy 1.26 features |
| sentence-transformers | 2.3.1 | Very stable | Older model support |
| transformers | 4.35.0 | Stable | Missing newer models |
| datasets | 2.14.0 | Stable | Slower Arrow operations |

**Use when:**
- Running on older production systems
- Maximum stability is critical
- Don't need latest models or features

### Option C: Modern (Latest Stable)

Best for: New features, latest models, development

| Package | Version | Pros | Cons |
|---------|---------|------|------|
| torch | 2.3.0 | Latest features, faster | Less tested, potential bugs |
| numpy | 1.26.4 | Latest pre-2.0 | Some packages lag support |
| sentence-transformers | 2.7.0 | Latest models | API changes, less tested |
| transformers | 4.40.0 | Latest models | Breaking changes possible |
| datasets | 2.19.0 | Best performance | Less tested |

**Use when:**
- Need latest model architectures
- Development/testing environment
- Performance is critical
- Can tolerate occasional bugs

## Compatibility Rules

### Critical Dependencies

These packages MUST stay in sync:

```
torch <-- sentence-transformers <-- transformers
         <-- tokenizers

numpy <-- torch
      <-- pandas
      <-- scipy
      <-- scikit-learn

transformers <-- datasets
             <-- tokenizers
```

### Version Constraints

| If you use... | Then you need... | Because... |
|---------------|------------------|------------|
| torch 2.2.0 | numpy 1.24-1.26 | Binary compatibility |
| sentence-transformers 2.5.x | transformers 4.35-4.40 | API compatibility |
| transformers 4.38.x | tokenizers 0.15.x | Tokenizer backend |
| datasets 2.17.x | pyarrow 12.0-15.0 | Arrow format |
| pandas 2.2.x | numpy 1.24-1.26 | Array operations |

### Python Version Support

| Python | torch | numpy | transformers | Status |
|--------|-------|-------|--------------|--------|
| 3.9 | 2.0-2.2 | <1.26 | 4.30-4.38 | End of life soon |
| 3.10 | 2.0-2.3 | <1.27 | 4.30-4.40 | ✅ Supported |
| 3.11 | 2.0-2.3 | <1.27 | 4.30-4.40 | ✅ Recommended |
| 3.12 | 2.1-2.3 | <1.27 | 4.36-4.40 | ✅ Supported |

## Known Incompatibilities

### NumPy 2.0+
- **Issue**: Breaking ABI changes
- **Affected**: torch <2.4, many scientific packages
- **Solution**: Stay on numpy 1.26.x until ecosystem catches up

### PyTorch 2.3+
- **Issue**: Some edge cases with sentence-transformers
- **Affected**: Specific model architectures
- **Solution**: Use PyTorch 2.2.0 for maximum compatibility

### transformers 4.40+
- **Issue**: API changes in tokenizer handling
- **Affected**: Custom tokenization pipelines
- **Solution**: Use transformers 4.38.2 or update code

### sentence-transformers 2.6+
- **Issue**: Changed default pooling behavior
- **Affected**: Fine-tuned models from earlier versions
- **Solution**: Explicitly set pooling mode or use 2.5.1

## Testing Matrix

We test the following combinations:

| Python | torch | numpy | sentence-transformers | Status |
|--------|-------|-------|----------------------|--------|
| 3.10 | 2.2.0 | 1.26.4 | 2.5.1 | ✅ Passing |
| 3.11 | 2.2.0 | 1.26.4 | 2.5.1 | ✅ Passing (Recommended) |
| 3.11 | 2.1.0 | 1.24.3 | 2.3.1 | ✅ Passing |
| 3.11 | 2.3.0 | 1.26.4 | 2.7.0 | ⚠️ Works with warnings |
| 3.12 | 2.2.0 | 1.26.4 | 2.5.1 | ✅ Passing |

## Migration Paths

### From Option A to Option B (Current)

Safe, recommended upgrade path:

```bash
# Step 1: Update torch
pip install torch==2.2.0 torchvision==0.17.0 torchaudio==2.2.0

# Step 2: Update numpy
pip install numpy==1.26.4

# Step 3: Update transformers ecosystem
pip install transformers==4.38.2 tokenizers==0.15.2

# Step 4: Update sentence-transformers
pip install sentence-transformers==2.5.1

# Step 5: Update datasets
pip install datasets==2.17.1

# Step 6: Verify
python -c "import torch, transformers, sentence_transformers; print('OK')"
```

### From Option B to Option C

Experimental, test thoroughly:

```bash
# Step 1: Update torch
pip install torch==2.3.0 torchvision==0.18.0 torchaudio==2.3.0

# Step 2: Update transformers
pip install transformers==4.40.0 tokenizers==0.19.0

# Step 3: Update sentence-transformers
pip install sentence-transformers==2.7.0

# Step 4: Update datasets
pip install datasets==2.19.0

# Step 5: Test extensively
pytest tests/ --verbose
```

## Version Selection Decision Tree

```
Start: New project or update?
│
├─ Need latest models/features?
│  ├─ Yes → Option C (with testing)
│  └─ No → Continue
│
├─ Maximum stability critical?
│  ├─ Yes → Option A (conservative)
│  └─ No → Continue
│
├─ Production deployment?
│  ├─ Yes → Option B (recommended) ✅
│  └─ No → Option C (development)
│
└─ Default → Option B (recommended) ✅
```

## Quick Commands

### Check Current Versions

```bash
pip list | grep -E "torch|numpy|transformers|sentence-transformers|datasets"
```

### Verify Compatibility

```bash
python -c "
import torch
import numpy as np
import transformers
import sentence_transformers
import datasets

print(f'PyTorch: {torch.__version__}')
print(f'NumPy: {np.__version__}')
print(f'Transformers: {transformers.__version__}')
print(f'Sentence Transformers: {sentence_transformers.__version__}')
print(f'Datasets: {datasets.__version__}')
print('✅ All packages imported successfully')
"
```

### Check for Conflicts

```bash
pip check
```

### Compare with Requirements

```bash
pip list --format=freeze | diff - requirements-docker.txt
```

## Security Updates

Always check for security updates:

```bash
# Check for known vulnerabilities
pip-audit

# Or use safety
safety check --file requirements-docker.txt
```

## Update Schedule

| Component | Check Frequency | Update Frequency |
|-----------|----------------|------------------|
| Security patches | Weekly | Immediately |
| Bugfix releases | Monthly | As needed |
| Minor versions | Quarterly | After testing |
| Major versions | Yearly | After extensive testing |

## Resources

- [PyTorch Version Policy](https://pytorch.org/docs/stable/index.html)
- [NumPy Version Support](https://numpy.org/neps/nep-0029-deprecation_policy.html)
- [Transformers Release Notes](https://github.com/huggingface/transformers/releases)
- [Python Version Support](https://devguide.python.org/versions/)

---

Last updated: 2026-02-12
Next review: 2026-05-12
