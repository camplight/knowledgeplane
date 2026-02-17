# MS MARCO Quick Reference

## Quick Commands

```bash
# Small test (mock KP, no server needed)
python bench_msmarco.py --n 20 --k 10 --mock_kp

# Full benchmark (real KP server)
python bench_msmarco.py --n 100 --k 10

# KP only (faster)
python bench_msmarco.py --n 50 --run_vector false

# Vector only
python bench_msmarco.py --n 50 --run_kp false

# Custom k value
python bench_msmarco.py --n 100 --k 20
```

## Metrics Cheat Sheet

| Metric | Range | Perfect | Formula | Interpretation |
|--------|-------|---------|---------|----------------|
| **MRR** | 0.0-1.0 | 1.0 | 1/rank_first_relevant | Position of first relevant result |
| **Recall@k** | 0.0-1.0 | 1.0 | found_relevant/total_relevant | Coverage in top k |
| **NDCG@k** | 0.0-1.0 | 1.0 | DCG/IDCG | Ranking quality with position discount |

### Metric Scenarios

```
Ranking: [R1, R2, R3, R4, R5]  (R = relevant, others non-relevant)

MRR = 1.0    (first result is relevant)
Recall@5 = 1.0 (all 5 relevant found in top 5)
NDCG@5 = 1.0   (perfect ranking)

Ranking: [X, R1, X, R2, R3]

MRR = 0.5      (first relevant at rank 2)
Recall@5 = 1.0 (all found)
NDCG@5 = 0.85  (good but not perfect)

Ranking: [X, X, X, X, R1]

MRR = 0.2      (first relevant at rank 5)
Recall@3 = 0.0 (none in top 3)
Recall@5 = 1.0 (found in top 5)
NDCG@5 = 0.43  (poor ranking)
```

## Common Patterns

### Good Retrieval + Good Ranking
```
High MRR (>0.7) + High Recall@k (>0.8) + High NDCG (>0.8)
→ Excellent system, finds and ranks well
```

### Good Retrieval + Poor Ranking
```
Low MRR (<0.3) + High Recall@k (>0.8) + Moderate NDCG (0.5-0.7)
→ Finds relevant passages but ranks them low
→ Needs better ranking signals
```

### Poor Retrieval + Good Ranking
```
High MRR (>0.7) + Low Recall@k (<0.5) + Moderate NDCG (0.5-0.7)
→ Finds first relevant early but misses others
→ Needs broader retrieval
```

### Poor Retrieval + Poor Ranking
```
Low MRR (<0.3) + Low Recall@k (<0.5) + Low NDCG (<0.5)
→ System struggling with task
→ Needs fundamental improvements
```

## MS MARCO vs HotpotQA

| Aspect | MS MARCO | HotpotQA |
|--------|----------|----------|
| **Task** | Passage ranking | Answer extraction |
| **Hops** | Single-hop | Multi-hop (2+) |
| **Primary Metric** | MRR | EM (Exact Match) |
| **Secondary** | Recall@k, NDCG@k | F1 Score |
| **Evaluation** | Ranking quality | Answer accuracy |
| **KP Advantage** | Semantic ranking | Graph traversal |

## Expected Performance

### Baseline Results (Vector-only)

```
MRR:        0.60-0.70
Recall@10:  0.75-0.85
NDCG@10:    0.70-0.80
Latency:    100-200ms
```

### Target KP Results

```
MRR:        0.65-0.75  (+5-10%)
Recall@10:  0.80-0.90  (+5-10%)
NDCG@10:    0.75-0.85  (+5-10%)
Latency:    150-300ms  (comparable)
```

### Success Criteria

KP demonstrates superior performance if:
- MRR improvement > 0.05 (5%)
- Recall@10 improvement > 0.05 (5%)
- NDCG@10 improvement > 0.05 (5%)
- Latency < 2x baseline

## Troubleshooting

### Dataset Download Fails
```bash
# Pre-download manually
python -c "from datasets import load_dataset; \
           load_dataset('ms_marco', 'v2.1', split='validation')"

# Check cache
ls ~/.cache/huggingface/datasets/ms_marco/
```

### Out of Memory
```bash
# Reduce dataset size
python bench_msmarco.py --n 20

# Reduce k
python bench_msmarco.py --n 50 --k 5

# Use mock KP (less memory)
python bench_msmarco.py --n 50 --mock_kp
```

### Slow Performance
```bash
# Skip vector baseline
python bench_msmarco.py --n 100 --run_vector false

# Reduce k
python bench_msmarco.py --n 100 --k 5

# Use smaller embedding model (edit vector_baseline.py)
# Change to: paraphrase-MiniLM-L3-v2
```

### KP Connection Issues
```bash
# Test connectivity
curl -X POST $KP_API_URL/tools/list \
  -H "Authorization: Bearer $KP_API_KEY" \
  -H "Content-Type: application/json"

# Use mock mode
python bench_msmarco.py --n 20 --mock_kp
```

## File Locations

```
tests/benchmarks/
├── bench_msmarco.py              # Main benchmark script
├── docs/
│   ├── MSMARCO_USAGE.md          # Full documentation
│   └── MSMARCO_QUICKREF.md       # This file
├── demos/
│   └── demo_msmarco.py           # Interactive demo
├── tests/
│   └── test_msmarco_metrics.py   # Metric unit tests
└── output/
    ├── msmarco_results.csv       # Per-query results
    └── msmarco_summary.json      # Aggregate metrics
```

## Running Tests

```bash
# Run metric unit tests
python tests/test_msmarco_metrics.py

# Run interactive demo
python demos/demo_msmarco.py

# Run small benchmark
python bench_msmarco.py --n 10 --mock_kp
```

## Environment Variables

```bash
# KP Configuration
export KP_API_URL=http://localhost:8080/mcp
export KP_API_KEY=your-api-key
export KP_WORKSPACE_ID=benchmark-workspace
export KP_USER_ID=benchmark-user

# Optional: OpenAI (for embeddings)
export OPENAI_API_KEY=sk-...

# Optional: Anthropic (for generative mode)
export ANTHROPIC_API_KEY=sk-ant-...
```

## Interpreting Results

### CSV Output
```csv
query_id,query,n_passages,n_relevant,kp_mrr,kp_recall_at_k,kp_ndcg_at_k,...
0,what is capital,10,2,1.0000,1.0000,1.0000,...
```

### JSON Summary
```json
{
  "kp": {
    "avg_mrr": 0.7234,
    "avg_recall_at_k": 0.8456,
    "avg_ndcg_at_k": 0.8012,
    ...
  },
  "improvement": {
    "mrr_delta": 0.0722,
    "mrr_percent_change": 11.1,
    ...
  }
}
```

## Advanced Usage

### Statistical Significance
```bash
# Run multiple seeds
for seed in 42 43 44 45 46; do
    python bench_msmarco.py --n 100 --seed $seed \
        --output_dir output_seed_$seed
done

# Compute mean ± std
python -c "
import json
from pathlib import Path
import numpy as np

results = [json.load(open(p)) for p in
           Path('output_seed_*').glob('msmarco_summary.json')]
kp_mrrs = [r['kp']['avg_mrr'] for r in results]
print(f'MRR: {np.mean(kp_mrrs):.4f} ± {np.std(kp_mrrs):.4f}')
"
```

### K-Value Analysis
```bash
# Test different k values
for k in 5 10 20 50; do
    python bench_msmarco.py --n 50 --k $k \
        --output_dir output_k_$k
done
```

### Batch Processing
```bash
# Process queries in batches (modify script)
# Add --batch_size argument
python bench_msmarco.py --n 1000 --batch_size 100
```

## References

- **Paper**: https://arxiv.org/abs/1611.09268
- **Dataset**: https://microsoft.github.io/msmarco/
- **Docs**: docs/MSMARCO_USAGE.md
- **Tests**: tests/test_msmarco_metrics.py
- **Demo**: demos/demo_msmarco.py
