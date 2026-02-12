# KnowledgePlane Benchmarking Suite - File Index

## Overview

This document provides a complete index of all files in the benchmarking suite, organized by purpose and implementation step.

## Quick Navigation

- [Core Benchmark Scripts](#core-benchmark-scripts)
- [Adapters and Utilities](#adapters-and-utilities)
- [Test Suites](#test-suites)
- [Demos and Examples](#demos-and-examples)
- [Documentation](#documentation)
- [Configuration](#configuration)
- [Output Directory](#output-directory)

---

## Core Benchmark Scripts

### `run_all.py` (Step 6)
**Lines:** 230+
**Purpose:** Master orchestration script
**Usage:**
```bash
python run_all.py --n-hotpot 20 --freshness-mode skip
```
**Dependencies:** bench_hotpotqa.py, bench_freshness.py
**Outputs:** Combined report + all individual benchmark outputs

### `bench_hotpotqa.py` (Step 2)
**Lines:** 980
**Purpose:** HotpotQA multi-hop reasoning benchmark
**Usage:**
```bash
python bench_hotpotqa.py --n 20 --run_kp true --run_vector true
```
**Dependencies:** kp_adapter.py, vector_baseline.py, HuggingFace datasets
**Outputs:** hotpotqa_results.csv, hotpotqa_summary.json

### `bench_freshness.py` (Step 3)
**Lines:** 750
**Purpose:** Freshness time-to-truth benchmark
**Usage:**
```bash
python bench_freshness.py --mode manual
python bench_freshness.py --mode api
```
**Dependencies:** kp_adapter.py, rich (optional)
**Outputs:** freshness_run.json

---

## Adapters and Utilities

### `kp_adapter.py` (Step 4)
**Lines:** 600+
**Purpose:** KnowledgePlane adapter interface
**Classes:**
- `KnowledgePlaneAdapter` (abstract base)
- `HTTPKnowledgePlaneAdapter` (real implementation)
- `MockKnowledgePlaneAdapter` (testing)
**Key Methods:**
- `initialize()` - Setup connection
- `ingest_documents()` - Ingest documents
- `query()` - Query knowledge base
- `close()` - Cleanup
**Usage:**
```python
from kp_adapter import HTTPKnowledgePlaneAdapter

adapter = HTTPKnowledgePlaneAdapter()
adapter.initialize(mcp_url="...", api_key="...", ...)
result = adapter.query(question="...", namespace="...")
```

### `vector_baseline.py` (Step 5)
**Lines:** 563
**Purpose:** FAISS-based vector baseline
**Classes:**
- `VectorBaseline` - Main class
- `Document` - Document dataclass
**Key Methods:**
- `ingest_documents()` - Add documents
- `query()` - Retrieve and answer
- `get_stats()` - System statistics
**Usage:**
```python
from vector_baseline import VectorBaseline

baseline = VectorBaseline(chunk_size=512, chunk_overlap=128)
baseline.ingest_documents(docs)
answer = baseline.query(question="...", k=5)
```

---

## Test Suites

### `test_run_all.py` (Step 6)
**Lines:** 320+
**Purpose:** Test master orchestration script
**Test Cases:**
- Script existence and executability
- Help flag functionality
- Import verification
- Subprocess execution (success/failure)
- Argument parsing
- Combined report generation
**Usage:**
```bash
python test_run_all.py
```

### `test_hotpotqa_scoring.py` (Step 2)
**Lines:** 148
**Purpose:** Test HotpotQA scoring functions
**Test Cases:**
- Answer normalization
- Exact match computation
- F1 score computation
- Edge cases (empty strings, special characters)
**Usage:**
```bash
python test_hotpotqa_scoring.py
```

### `test_bench_freshness.py` (Step 3)
**Lines:** 7,800 bytes
**Purpose:** Test freshness benchmark
**Test Cases:**
- Test fact generation
- Poll timing logic
- Mode switching (manual/api)
- Result formatting
**Usage:**
```bash
python test_bench_freshness.py
```

### `test_vector_baseline.py` (Step 5)
**Lines:** 306
**Purpose:** Test vector baseline
**Test Cases:**
- Document ingestion
- Chunking strategy
- Embedding generation
- Query and retrieval
- Statistics computation
**Usage:**
```bash
python test_vector_baseline.py
```

---

## Demos and Examples

### `example_hotpotqa.py` (Step 2)
**Lines:** 281
**Purpose:** Usage examples for HotpotQA benchmark
**Demonstrates:**
- Basic usage
- Mock KP mode
- Custom configurations
- Result interpretation
**Usage:**
```bash
python example_hotpotqa.py
```

### `demo_freshness.py` (Step 3)
**Lines:** 13KB
**Purpose:** Interactive freshness benchmark demo
**Demonstrates:**
- Test fact generation
- Poll simulation
- Result formatting
- Both modes (manual/api)
**Usage:**
```bash
python demo_freshness.py
```

### `demo_vector_baseline.py` (Step 5)
**Lines:** 362
**Purpose:** Vector baseline demo
**Demonstrates:**
- Document ingestion
- Query examples
- Extractive vs generative modes
- Statistics display
**Usage:**
```bash
python demo_vector_baseline.py
```

---

## Documentation

### Main Documentation

#### `README.md` (Step 1 + updates)
**Lines:** 450+
**Sections:**
- Overview and goals
- Quick start guide
- Environment variables
- Running each benchmark
- Expected outputs
- Troubleshooting
- Next steps

#### `spec.md` (Step 0 + updates)
**Lines:** 250+
**Sections:**
- Implementation roadmap
- Progress tracking
- Step-by-step deliverables
- Success criteria
- Environment requirements

### Quick Start

#### `QUICKSTART.md` (Step 6)
**Lines:** 180
**Purpose:** 5-minute quick start guide
**Sections:**
- Install dependencies
- Quick test (no server)
- Full run (with server)
- Common commands
- Understanding results
- Troubleshooting

### Benchmark-Specific

#### `HOTPOTQA_USAGE.md` (Step 2)
**Lines:** 458
**Purpose:** Comprehensive HotpotQA guide
**Sections:**
- Dataset overview
- Usage examples
- Configuration options
- Scoring metrics
- Troubleshooting
- Expected results

#### `FRESHNESS_BENCHMARK.md` (Step 3)
**Lines:** 400+
**Purpose:** Freshness benchmark guide
**Sections:**
- Time-to-truth concept
- Manual vs API modes
- Configuration options
- Success criteria
- Integration guide

#### `VECTOR_BASELINE_README.md` (Step 5)
**Lines:** 458
**Purpose:** Vector baseline documentation
**Sections:**
- Architecture overview
- Chunking strategies
- Embedding options
- Query modes
- Performance tuning

### Implementation Summaries

#### `COMPLETION_SUMMARY.md` (Step 6)
**Lines:** 350
**Purpose:** Step 6 completion summary
**Sections:**
- What was delivered
- File structure
- Usage examples
- Quality assurance
- Test results
- Next steps

#### `STEP6_COMPLETE.md` (Step 6)
**Lines:** 450+
**Purpose:** Detailed Step 6 report
**Sections:**
- Implementation details
- Usage examples
- Output formats
- Testing
- Verification checklist
- Integration notes

#### `IMPLEMENTATION_SUMMARY.md` (Steps 1-5)
**Lines:** 500+
**Purpose:** Summary of Steps 1-5
**Sections:**
- Each step's deliverables
- Code statistics
- Integration points
- Testing status

#### `INDEX.md` (This file)
**Lines:** 800+
**Purpose:** Complete file index
**Sections:**
- File organization
- Purpose and usage
- Dependencies
- Quick reference

---

## Configuration

### `requirements-bench.txt` (Step 1)
**Lines:** 25+
**Purpose:** Python dependencies
**Contents:**
```
datasets>=2.14.0
pandas>=2.0.0
numpy>=1.24.0
tqdm>=4.65.0
faiss-cpu>=1.7.4
sentence-transformers>=2.2.0
openai>=1.0.0
anthropic>=0.25.0
rich>=13.0.0
pytest>=7.4.0
pytest-asyncio>=0.21.0
```

### `.gitignore` (Step 1)
**Lines:** 66
**Purpose:** Exclude generated files
**Excludes:**
- output/ (except .gitkeep)
- __pycache__/
- *.pyc
- Virtual environments
- IDE files
- Logs
- FAISS indexes
- Dataset caches

---

## Output Directory

### `output/` (Step 1)
**Purpose:** Store benchmark results
**Files Generated:**
- `hotpotqa_results.csv` - Per-question results
- `hotpotqa_summary.json` - Aggregate HotpotQA metrics
- `freshness_run.json` - Freshness timing data
- `benchmark_report_YYYYMMDD_HHMMSS.json` - Combined reports

### `output/.gitkeep` (Step 1)
**Purpose:** Preserve directory in git

---

## File Dependencies Graph

```
requirements-bench.txt
    ↓
kp_adapter.py
    ↓
    ├→ bench_hotpotqa.py ←── vector_baseline.py
    │       ↓
    │   test_hotpotqa_scoring.py
    │   example_hotpotqa.py
    │
    └→ bench_freshness.py
            ↓
        test_bench_freshness.py
        demo_freshness.py

run_all.py → bench_hotpotqa.py
           → bench_freshness.py
           → test_run_all.py
```

---

## Usage Patterns

### For First-Time Users
1. Read: `QUICKSTART.md`
2. Install: `requirements-bench.txt`
3. Run: `run_all.py --n-hotpot 10 --mock_kp --freshness-mode skip`
4. Review: `output/benchmark_report_*.json`

### For Understanding the Codebase
1. Read: `README.md` (overview)
2. Read: `spec.md` (implementation roadmap)
3. Read: `IMPLEMENTATION_SUMMARY.md` (steps 1-5 details)
4. Read: `STEP6_COMPLETE.md` (step 6 details)
5. Read: `INDEX.md` (this file)

### For Running HotpotQA Only
1. Read: `HOTPOTQA_USAGE.md`
2. Run: `python bench_hotpotqa.py --n 20`
3. Review: `output/hotpotqa_summary.json`

### For Running Freshness Only
1. Read: `FRESHNESS_BENCHMARK.md`
2. Run: `python bench_freshness.py --mode manual`
3. Review: `output/freshness_run.json`

### For Developers
1. Read: `spec.md` (requirements)
2. Review: `kp_adapter.py` (interface)
3. Review: `vector_baseline.py` (baseline implementation)
4. Run: All test files
5. Extend: Add new benchmark following pattern

### For Extending the Suite
1. Create: `bench_<name>.py` (following existing patterns)
2. Create: `test_<name>.py` (test suite)
3. Update: `run_all.py` (add new benchmark function)
4. Update: `README.md` (document usage)
5. Create: `<NAME>_USAGE.md` (detailed guide)

---

## Statistics

### Total Files: 27

**By Type:**
- Python scripts: 12
- Test files: 4
- Demo files: 3
- Documentation: 8
- Configuration: 2

**By Step:**
- Step 0: 1 file (discovery report)
- Step 1: 3 files (harness)
- Step 2: 4 files (HotpotQA)
- Step 3: 4 files (Freshness)
- Step 4: 1 file (KP adapter)
- Step 5: 4 files (Vector baseline)
- Step 6: 5 files (Master runner)
- Supplementary: 5 files (index, guides, etc.)

**By Size:**
- Largest: `bench_hotpotqa.py` (980 lines)
- Smallest: `.gitkeep` (empty)
- Total code: ~5,000 lines
- Total documentation: ~3,500 lines
- **Total: ~8,500 lines**

---

## Quick Reference

| Want to... | Use this file |
|------------|---------------|
| Run all benchmarks | `run_all.py` |
| Run HotpotQA only | `bench_hotpotqa.py` |
| Run freshness only | `bench_freshness.py` |
| Understand HotpotQA | `HOTPOTQA_USAGE.md` |
| Understand freshness | `FRESHNESS_BENCHMARK.md` |
| Get started quickly | `QUICKSTART.md` |
| See what was built | `INDEX.md` (this file) |
| Understand implementation | `IMPLEMENTATION_SUMMARY.md` |
| Test the suite | `test_*.py` files |
| See examples | `example_*.py` or `demo_*.py` files |
| Configure environment | `requirements-bench.txt` |
| Understand adapters | `kp_adapter.py` |
| Understand baseline | `vector_baseline.py` |

---

## Maintenance

### Adding New Files
1. Create the file
2. Add entry to this INDEX.md
3. Update README.md if user-facing
4. Update spec.md if part of roadmap

### Updating Existing Files
1. Update line counts in this INDEX.md
2. Update documentation if interface changes
3. Update tests if behavior changes

### Removing Files
1. Remove entry from this INDEX.md
2. Update dependencies graph
3. Update README.md references
4. Update run_all.py if necessary

---

**Last Updated:** 2026-02-12
**Version:** 1.0
**Status:** Complete
