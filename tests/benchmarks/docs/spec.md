# KnowledgePlane Benchmarking Suite - Specification

## Goal
Implement a minimal, credible benchmarking suite that proves KP's advantages (graph-native multi-hop reasoning + active freshness) BEFORE we invest in a full competitor bake-off.

## High-level Strategy
- We benchmark KP against a reproducible vector-RAG baseline we control (FAISS/Qdrant + simple chunking) rather than trying to integrate Mem0/Supermemory in v1.
- We only run benchmarks where we can also control/ingest the evaluation corpus, so results are meaningful.
- Build this step-by-step with working increments. Do NOT overbuild.

## Hard Requirements
1. Create a new folder: `tests/benchmarks/`
2. Everything must run from the repo root with clear commands.
3. Keep the first version small (20–50 questions, small doc subsets) to control cost/time.
4. All scripts should be deterministic and save outputs to CSV/JSON.

## Implementation Roadmap

### Step 0: Discovery (REQUIRED FIRST)
**Status:** ✅ Complete
**Assigned to:** Repository Analyzer Agent
**Report:** `tests/kp_discovery_report.md`

**Key Findings:**
- ✅ 3 ingestion methods: file upload, direct fact writing, bulk fact writing
- ✅ Query interface with 3 search modes: fulltext, vector, hybrid
- ✅ ArangoDB with graph structure (facts as vertices, relations as edges)
- ✅ MCP tools provide API access with workspace isolation
- ⚠️ Gap: No answer generation (retrieval only)
- ⚠️ Gap: No citation formatting built-in
- ⚠️ Gap: Background consolidation runs async (5-min intervals)

### Step 1: Benchmark Harness Skeleton
**Status:** ✅ Complete
**Assigned to:** Infrastructure Agent
**Deliverables:**
- ✅ README.md (12KB comprehensive guide)
- ✅ requirements-bench.txt (all dependencies)
- ✅ .gitignore (proper exclusions)
- ✅ output/.gitkeep (directory preservation)

**Deliverables:**
- `tests/benchmarks/README.md` explaining:
  - what we're benchmarking, why these benchmarks
  - how to run each script
  - what environment variables are needed
  - where to plug in the real KP client if not already available
- `tests/benchmarks/requirements-bench.txt` with:
  - `datasets`
  - `pandas`
  - `numpy`
  - `tqdm`
  - plus any lightweight vector baseline deps (prefer FAISS-cpu)

### Step 2: HotpotQA "Kill Shot" (Graph vs Vector)
**Status:** ✅ Complete
**Depends on:** Step 1, Step 4
**Assigned to:** Benchmark Implementation Agent

**Implementation Summary:**
- ✅ `bench_hotpotqa.py` (980 lines, complete implementation)
- ✅ `test_hotpotqa_scoring.py` (148 lines, unit tests for scoring)
- ✅ `example_hotpotqa.py` (281 lines, usage examples)
- ✅ `HOTPOTQA_USAGE.md` (458 lines, comprehensive guide)
- ✅ HuggingFace dataset loading with HotpotQA distractor
- ✅ Document preparation from context (title + sentences)
- ✅ Dual system evaluation (KP + Vector baseline)
- ✅ EM & F1 scoring with normalization
- ✅ CLI arguments with full configurability
- ✅ CSV and JSON output with detailed metrics
- ✅ Mock KP adapter support for testing
- ✅ Namespace isolation for reproducibility
- ✅ Progress tracking with tqdm
- ✅ Comprehensive error handling

**Deliverables:**
Create `tests/benchmarks/bench_hotpotqa.py` that:

**A) Dataset Loading:**
- Loads a SMALL subset of HotpotQA (distractor) from HuggingFace
- Take 20 questions first (configurable via CLI arg)

**B) Evaluation Corpus:**
- For each question, collect the supporting documents/titles and their sentences from the dataset entry
- Convert them into documents we can ingest (e.g., one doc per title)
- IMPORTANT: ensure the benchmark only asks questions about docs that were ingested into the system

**C) Two Systems:**
1. **KP system (Graph-native):** ingest docs into KP, then query KP
2. **Vector baseline (owned by us):** build a simple vector index over the same docs and answer by:
   - retrieve top-k chunks
   - feed them to the same LLM or a simple extractive heuristic (choose simplest, but must be consistent)

**D) Scoring:**
- Implement exact-match (EM) and token-level F1 against the dataset's answer
- Track latency per question

**E) Output:**
- Save per-question results to `tests/benchmarks/output/hotpotqa_results.csv`
- Save summary metrics (avg EM, avg F1, avg latency) to `tests/benchmarks/output/hotpotqa_summary.json`

**F) CLI Arguments:**
- `--n 20`, `--top_k 5`, `--seed 42`
- `--run_kp true/false`, `--run_vector true/false`

**Implementation Notes:**
- If KP ingestion requires unique IDs or namespaces, isolate each run in a unique namespace (e.g., `bench_hotpotqa_<timestamp>`)
- If KP cannot ingest programmatically yet, create a clear adapter class with TODO methods and a "mock mode" so the code still runs for the vector baseline

### Step 3: Freshness "Time-to-Truth" Benchmark
**Status:** ✅ Complete
**Depends on:** Step 1, Step 4
**Assigned to:** Benchmark Implementation Agent
**Deliverables:**
- ✅ `bench_freshness.py` (23KB, full implementation)
- ✅ `test_bench_freshness.py` (7.8KB, comprehensive tests)
- ✅ `demo_freshness.py` (13KB, interactive demo)
- ✅ Both manual and API modes implemented
- ✅ Rich colored output with progress tracking
- ✅ JSON result export with full timing data

**Deliverables:**
Create `tests/benchmarks/bench_freshness.py` that:

**A) Controlled Fact Update:**
- Defines a unique fact (UUID) and an update event in a controlled source

**B) Two Modes:**
- `--manual`: prints instructions for a human to inject/update the fact in the connected source (e.g., Notion page or file)
- `--api`: if the repo supports programmatic updates, do it automatically

**C) Polling Logic:**
- Poll KP every 30 seconds asking a fixed question
- Stop when KP returns the new fact

**D) Output:**
- `tests/benchmarks/output/freshness_run.json` with timestamps and time-to-truth seconds

### Step 4: KP Adapters
**Status:** ✅ Complete
**Assigned to:** Infrastructure Agent
**Deliverables:**
- ✅ `kp_adapter.py` with HTTPKnowledgePlaneAdapter
- ✅ MockKnowledgePlaneAdapter for testing
- ✅ Helper functions for workspace setup/cleanup
- ✅ Full type hints and comprehensive documentation

**Deliverables:**
Create `tests/benchmarks/kp_adapter.py` that provides a clean interface:
- `ingest_documents(docs: list[Document], namespace: str) -> None`
- `query(question: str, namespace: str) -> Answer`

**Implementation Notes:**
- If the repo already has these, wrap existing functions; don't duplicate
- Make sure adapters log errors clearly

### Step 5: Vector Baseline
**Status:** ✅ Complete
**Assigned to:** Baseline Implementation Agent
**Deliverables:**
- ✅ `vector_baseline.py` (563 lines, full implementation)
- ✅ `test_vector_baseline.py` (306 lines, 15+ tests)
- ✅ `demo_vector_baseline.py` (362 lines, interactive demo)
- ✅ `VECTOR_BASELINE_README.md` (458 lines, complete docs)
- ✅ FAISS indexing, local embeddings, extractive & generative modes

**Deliverables:**
Create `tests/benchmarks/vector_baseline.py`:
- Chunking strategy (simple fixed-size, overlap)
- Embedding (choose a lightweight local embedding if available; if not, use OpenAI embeddings behind env var; document it)
- Retrieval top-k
- Simplest answerer: either "extract best sentence" or optional LLM call (configurable). Prefer extractive first to avoid extra cost.

### Step 6: Make it Runnable
**Status:** ✅ Complete
**Depends on:** Steps 2, 3, 4, 5
**Assigned to:** Integration Agent
**Deliverables:**
- ✅ `run_all.py` (master orchestration script)
- ✅ Subprocess execution with error handling
- ✅ Combined reporting with final summary
- ✅ Support for all CLI options from individual benchmarks
- ✅ README updated with usage examples
- ✅ Environment variable support
- ✅ Next steps recommendations

## Quality Bar
- Keep code readable and modular
- Don't add LoCoMo, MemoryBench, RAGAS, etc. yet. Only implement the two benchmarks above
- At the end, print "NEXT STEPS" with how to expand to LoCoMo/MemoryBench later

## Progress Tracking

### Completed ✅
- Created branch: `feature/benchmarking-suite`
- Created directory structure: `tests/benchmarks/output/`
- Created this specification document
- **Step 0:** Repository discovery and analysis (994-line report)
- **Step 1:** Benchmark harness skeleton (README, requirements, .gitignore)
- **Step 2:** HotpotQA benchmark (980 lines + tests + examples + guide)
- **Step 3:** Freshness benchmark (23KB + tests + demo)
- **Step 4:** KP adapters (HTTP + Mock adapters, helpers)
- **Step 5:** Vector baseline (563 lines + tests + demo + docs)
- **Step 6:** Master runner script (run_all.py with combined reporting)
- Added `scripts/summarize-benchmarks.ts` (Node.js/TypeScript) to compile high-level cross-run Markdown summaries and flag regressions for debugging/optimization.

### In Progress 🔄
- None

### Pending 📋
- None - All steps complete! Ready for testing and evaluation.

## Next Steps (Future Extensions)
Once the minimal suite is proven, we can expand to:
- **LoCoMo**: Long-context multi-hop reasoning benchmarks
- **MemoryBench**: Memory consistency and retrieval benchmarks
- **RAGAS**: Retrieval-Augmented Generation Assessment
- **Full competitor integration**: Mem0, Supermemory, etc.
- **Larger scale**: Increase to 100s or 1000s of questions
- **More datasets**: MS MARCO, Natural Questions, etc.

## Environment Variables Required
```bash
# For KP connection
KP_API_URL=http://localhost:8080
KP_API_KEY=DEV_API_KEY

# For embeddings (if using OpenAI)
OPENAI_API_KEY=your_key_here

# For LLM calls (if using for answer generation)
ANTHROPIC_API_KEY=your_key_here  # or use OpenAI
```

## Running the Benchmarks
```bash
# Install dependencies
cd tests/benchmarks
pip install -r requirements-bench.txt

# Run HotpotQA benchmark
python bench_hotpotqa.py --n 20 --run_kp true --run_vector true

# Run freshness benchmark (manual mode)
python bench_freshness.py --manual

# Run all benchmarks
python run_all.py
```

## Success Criteria
The benchmarking suite is successful if:
1. It proves KP's graph-native advantage on multi-hop questions (>10% improvement in EM/F1)
2. It demonstrates faster time-to-truth for fresh data (<5 minutes vs baseline)
3. Results are reproducible and deterministic
4. Code is clean, modular, and extensible
5. Can be run by any team member with clear documentation
