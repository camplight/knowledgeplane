# Freshness Benchmark - Time-to-Truth Measurement

## Overview

The Freshness Benchmark measures how quickly KnowledgePlane reflects updated facts after ingestion. This is a critical metric for evaluating the "active freshness" feature that distinguishes KnowledgePlane from traditional RAG systems.

**Key Metric:** Time-to-Truth (TTT) - the time elapsed between fact ingestion/update and when the fact becomes retrievable via search.

## Success Criteria

| Rating | Time-to-Truth | Status |
|--------|---------------|--------|
| 🌟 **EXCELLENT** | < 1 minute | Best-in-class freshness |
| ✅ **GOOD** | < 3 minutes | Fast freshness propagation |
| ✓ **TARGET** | < 5 minutes | Acceptable freshness |
| ⚠️ **SLOW** | > 5 minutes | Needs investigation |

## How It Works

### Test Flow

1. **Generate Unique Test Fact**
   - Creates a UUID-based test fact with unique identifier
   - Generates question that references the fact ID
   - Creates initial and updated values with timestamps

2. **Ingest Initial Fact** (API mode only)
   - Ingests the initial fact value
   - Verifies it becomes searchable

3. **Update Fact**
   - **Manual mode:** Human updates via UI/API
   - **API mode:** Programmatic update via adapter

4. **Poll Until Updated**
   - Polls KP every 30 seconds (configurable)
   - Queries for the updated fact
   - Records timestamp of each attempt
   - Stops when updated value appears or timeout

5. **Calculate Time-to-Truth**
   - Elapsed time from update to first successful retrieval
   - Success rate across all polls after first success

## Usage

### Quick Start

```bash
# Manual mode (human interaction)
python bench_freshness.py --mode manual

# API mode (automated)
python bench_freshness.py --mode api

# Custom polling interval
python bench_freshness.py --mode api --poll_interval 60 --max_attempts 10

# Demo (no live KP required)
python demo_freshness.py
```

### Manual Mode

Manual mode is ideal when you want to test the real user experience:

```bash
python bench_freshness.py --mode manual \
  --poll_interval 30 \
  --max_attempts 20
```

**Workflow:**
1. Script prints a unique fact ID and question
2. You create the initial fact in KP (via webapp/API)
3. Press ENTER to verify initial state
4. You update the fact in KP
5. Press ENTER to start polling
6. Script polls until updated value appears

**Example:**
```
═══ MANUAL FRESHNESS TEST ═══
Fact ID: 123e4567-e89b-12d3-a456-426614174000
Question: What is the status of test fact 123e4567-e89b-12d3-a456-426614174000?
Namespace: freshness_bench

Step 1: Create Initial Fact
  Content: INITIAL_2026-02-12T10:00:00.123456

Step 2: Verify Initial State
  Press ENTER when the fact is created...

Querying KP to verify initial state...
  Current answer: INITIAL_2026-02-12T10:00:00.123456

Step 3: Update the Fact
  New content: UPDATED_2026-02-12T10:02:30.654321
  Update the fact in KnowledgePlane
  Press ENTER when updated...

Polling every 30s until new value appears...
  Attempt 1/20 (30.0s): ⏳ Not found yet
  Attempt 2/20 (60.0s): ⏳ Not found yet
  Attempt 3/20 (90.5s): ✅ FOUND!

✅ Time-to-Truth: 90.50 seconds (1.51 minutes)
Status: 🌟 EXCELLENT (< 1 minute)
```

### API Mode

API mode fully automates the test:

```bash
python bench_freshness.py --mode api \
  --workspace_id your-workspace-id \
  --user_id your-user-id \
  --api_key your-api-key
```

**Workflow:**
1. Script generates unique test fact
2. Ingests initial fact via adapter
3. Verifies initial state
4. Ingests updated fact
5. Polls until updated value appears
6. Calculates and reports time-to-truth

**Example:**
```
═══ API FRESHNESS TEST ═══
Fact ID: 987fcdeb-51a2-43f7-89ab-cdef01234567
Question: What is the status of test fact 987fcdeb-51a2-43f7-89ab-cdef01234567?
Namespace: freshness_bench

Step 1: Ingesting Initial Fact
  Content: INITIAL_2026-02-12T10:00:00.123456
  ✅ Created 1 facts

Step 2: Verifying Initial State
  ✅ Initial fact is retrievable

Step 3: Updating Fact
  New content: UPDATED_2026-02-12T10:02:30.654321
  ✅ Ingested update (1 facts)

Polling every 30s until new value appears...
  Attempt 1/20 (30.1s): ⏳ Not found yet
  Attempt 2/20 (60.3s): ✅ FOUND!

✅ Time-to-Truth: 60.30 seconds (1.01 minutes)
Status: ✅ GOOD (< 3 minutes)
```

## Configuration

### Environment Variables

```bash
# Required
export KP_API_URL=http://localhost:8080/mcp
export KP_WORKSPACE_ID=your-workspace-id
export KP_USER_ID=your-user-id
export KP_API_KEY=your-api-key
```

### Command-Line Options

```
usage: bench_freshness.py [-h] [--mode {manual,api}] [--poll_interval POLL_INTERVAL]
                          [--max_attempts MAX_ATTEMPTS] [--mcp_url MCP_URL]
                          [--workspace_id WORKSPACE_ID] [--user_id USER_ID]
                          [--api_key API_KEY] [--output_dir OUTPUT_DIR]

options:
  --mode {manual,api}        Test mode (default: manual)
  --poll_interval INT        Seconds between polls (default: 30)
  --max_attempts INT         Maximum polling attempts (default: 20)
  --mcp_url URL             KP MCP server URL
  --workspace_id ID         KP workspace ID
  --user_id ID              KP user ID
  --api_key KEY             KP API key
  --output_dir DIR          Output directory (default: output/)
```

## Output Format

### JSON Result File

Results are saved to `output/freshness_run.json`:

```json
{
  "test_id": "123e4567-e89b-12d3-a456-426614174000",
  "mode": "api",
  "question": "What is the status of test fact 123e4567...?",
  "old_value": "INITIAL_2026-02-12T10:00:00.123456",
  "new_value": "UPDATED_2026-02-12T10:02:30.654321",
  "namespace": "freshness_bench",
  "found": true,
  "time_to_truth_seconds": 90.5,
  "attempts": 3,
  "poll_interval_seconds": 30,
  "max_attempts": 20,
  "started_at": "2026-02-12T10:02:30.654321",
  "completed_at": "2026-02-12T10:04:01.154321",
  "timestamps": [
    {
      "attempt": 1,
      "elapsed_seconds": 30.1,
      "timestamp": "2026-02-12T10:03:00.754321",
      "result": "INITIAL_2026-02-12T10:00:00.123456",
      "found_expected": false
    },
    {
      "attempt": 2,
      "elapsed_seconds": 60.3,
      "timestamp": "2026-02-12T10:03:30.954321",
      "result": "INITIAL_2026-02-12T10:00:00.123456",
      "found_expected": false
    },
    {
      "attempt": 3,
      "elapsed_seconds": 90.5,
      "timestamp": "2026-02-12T10:04:01.154321",
      "result": "UPDATED_2026-02-12T10:02:30.654321",
      "found_expected": true
    }
  ]
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `test_id` | string | Unique test fact identifier (UUID) |
| `mode` | string | Test mode: "manual" or "api" |
| `question` | string | Query used to search for the fact |
| `old_value` | string | Initial fact value |
| `new_value` | string | Updated fact value to detect |
| `namespace` | string | Namespace for fact isolation |
| `found` | boolean | Whether updated value was found |
| `time_to_truth_seconds` | float | Seconds from update to detection |
| `attempts` | integer | Number of polling attempts made |
| `poll_interval_seconds` | integer | Seconds between polls |
| `max_attempts` | integer | Maximum attempts allowed |
| `started_at` | string | ISO timestamp of test start |
| `completed_at` | string | ISO timestamp of test completion |
| `timestamps` | array | Detailed log of each polling attempt |

## Architecture

### Components

```
bench_freshness.py
├── generate_test_fact()         # Create unique test fact
├── poll_until_updated()         # Core polling logic
├── manual_mode()                # Interactive human workflow
├── api_mode()                   # Automated programmatic workflow
├── print_summary()              # Format results output
└── save_results()               # Export to JSON

test_bench_freshness.py
├── TestGenerateTestFact         # Test fact generation
├── TestPollUntilUpdated         # Test polling logic
├── TestSaveResults              # Test result export
└── TestIntegrationMock          # Full workflow tests

demo_freshness.py
├── demo_instant_update()        # Show < 1 min scenario
├── demo_delayed_update()        # Show 2 min scenario
└── demo_timeout()               # Show timeout scenario
```

### Data Flow

```
┌─────────────────────┐
│ Generate Test Fact  │
│  - UUID identifier  │
│  - Unique values    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Ingest Initial Fact │
│  (Manual or API)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Verify Initial    │
│    (Query KP)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Update Fact       │
│  (Manual or API)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Poll Loop          │
│  ├─ Query KP        │
│  ├─ Check result    │
│  ├─ Record attempt  │
│  └─ Sleep interval  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Calculate TTT       │
│ Print Summary       │
│ Save Results        │
└─────────────────────┘
```

## Testing

### Unit Tests

Run comprehensive unit tests:

```bash
python -m pytest test_bench_freshness.py -v

# Or with unittest
python test_bench_freshness.py
```

**Test Coverage:**
- ✅ Unique fact generation
- ✅ Immediate fact detection
- ✅ Delayed fact detection
- ✅ Timeout handling
- ✅ Result serialization
- ✅ Full API workflow

### Demo Script

Run interactive demo without live KP:

```bash
python demo_freshness.py
```

**Demo Scenarios:**
1. **Instant Update** - Fact appears immediately (EXCELLENT)
2. **Delayed Update** - Fact appears after 2 minutes (GOOD)
3. **Timeout** - Fact never appears (demonstrates timeout handling)

## Troubleshooting

### Issue: Updated fact never appears

**Possible causes:**
- Background consolidation not running
- Consolidation interval too long (default: 5 minutes)
- Fact ingested to wrong workspace/namespace
- Vector index not updated

**Solutions:**
```bash
# Check consolidation status
curl http://localhost:8080/health

# Manually trigger consolidation (if supported)
# Check KP logs for consolidation activity

# Verify fact ingestion
python -c "
from kp_adapter import HTTPKnowledgePlaneAdapter
adapter = HTTPKnowledgePlaneAdapter()
adapter.initialize(...)
result = adapter.query('test fact', k=20)
print([r.content for r in result.results])
"
```

### Issue: Timeout after max attempts

**Causes:**
- Normal behavior if consolidation takes > poll_interval * max_attempts
- Network issues
- KP server down

**Solutions:**
```bash
# Increase timeout
python bench_freshness.py --poll_interval 60 --max_attempts 30

# Check server connectivity
curl http://localhost:8080/health

# Check logs
tail -f /path/to/kp/logs/server.log
```

### Issue: Results not saved

**Causes:**
- Output directory doesn't exist
- Permission issues

**Solutions:**
```bash
# Create output directory
mkdir -p output
chmod 755 output

# Specify custom output directory
python bench_freshness.py --output_dir /tmp/freshness_output
```

## Interpreting Results

### Excellent Performance (< 1 minute)

```
✅ Time-to-Truth: 45.2 seconds (0.75 minutes)
Status: 🌟 EXCELLENT (< 1 minute)
```

**Interpretation:** KP has near-real-time freshness. Background consolidation is running frequently and efficiently. This is best-in-class performance.

**Comparison:** Traditional RAG systems require manual re-indexing, which can take hours.

### Good Performance (1-3 minutes)

```
✅ Time-to-Truth: 127.5 seconds (2.13 minutes)
Status: ✅ GOOD (< 3 minutes)
```

**Interpretation:** KP demonstrates fast freshness propagation. Consolidation is working well. This meets most real-time application requirements.

### Target Performance (3-5 minutes)

```
✅ Time-to-Truth: 270.0 seconds (4.50 minutes)
Status: ✓ TARGET (< 5 minutes)
```

**Interpretation:** Acceptable freshness for most use cases. May align with default 5-minute consolidation interval.

**Action:** Consider tuning consolidation frequency for faster updates if needed.

### Slow Performance (> 5 minutes)

```
✅ Time-to-Truth: 420.0 seconds (7.00 minutes)
Status: ⚠️ SLOW (> 5 minutes)
```

**Interpretation:** Freshness propagation is slower than expected. May indicate:
- Consolidation interval too long
- High load on consolidation process
- Large dataset causing slow consolidation
- Configuration issue

**Action:** Investigate consolidation logs and configuration.

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Freshness Benchmark

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd tests/benchmarks
          pip install -r requirements-bench.txt

      - name: Run freshness benchmark
        env:
          KP_API_URL: ${{ secrets.KP_API_URL }}
          KP_WORKSPACE_ID: ${{ secrets.KP_WORKSPACE_ID }}
          KP_USER_ID: ${{ secrets.KP_USER_ID }}
          KP_API_KEY: ${{ secrets.KP_API_KEY }}
        run: |
          cd tests/benchmarks
          python bench_freshness.py --mode api

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: freshness-results
          path: tests/benchmarks/output/freshness_run.json

      - name: Check performance threshold
        run: |
          cd tests/benchmarks
          python -c "
          import json
          with open('output/freshness_run.json') as f:
              result = json.load(f)
          ttt = result['time_to_truth_seconds']
          assert ttt < 300, f'Time-to-truth {ttt}s exceeds 5-minute threshold'
          "
```

## Comparison with Traditional RAG

| Metric | KnowledgePlane (Target) | Traditional RAG |
|--------|-------------------------|-----------------|
| **Time-to-Truth** | < 5 minutes | Hours to days |
| **Manual Work** | None | Re-index required |
| **Consistency** | Automatic | Manual process |
| **Real-time** | Near real-time | Batch updates |

## Next Steps

### Future Enhancements

1. **Multi-fact updates** - Test batch updates
2. **Conflict resolution** - Test contradictory facts
3. **Citation freshness** - Verify updated sources
4. **Cross-workspace** - Test fact propagation across workspaces
5. **Performance under load** - Test with concurrent updates

### Related Benchmarks

- **HotpotQA** - Multi-hop reasoning accuracy
- **MemoryBench** - Long-term consistency
- **LoCoMo** - Long-context retrieval

## References

- KnowledgePlane Architecture: `/docs/architecture.md`
- Background Consolidation: `/docs/consolidation.md`
- MCP Server API: `/docs/api.md`
- Vector Search: `/docs/search.md`

## Support

For issues or questions:
- GitHub Issues: https://github.com/knowledgeplane/knowledgeplane/issues
- Documentation: `/docs/`
- Email: support@knowledgeplane.com
