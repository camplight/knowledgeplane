# Benchmark Playbook

## Quick Start

```bash
cd tests/benchmarks

# Run HotpotQA benchmark (SF F1 metric)
./bench hotpot

# Run with more questions
./bench hotpot -n 100

# Run all benchmarks
./bench all
```

## Commands

| Command | Description | Duration |
|---------|-------------|----------|
| `./bench hotpot` | HotpotQA multi-hop (n=20) | 5-10 min |
| `./bench hotpot --full` | HotpotQA full (n=500) | 2-4 hours |
| `./bench freshness` | Write-to-searchable latency | 5-10 min |
| `./bench msmarco` | MS MARCO passage retrieval | 15-30 min |
| `./bench all` | All benchmarks | 3-5 hours |
| `./bench runs` | List archived runs | instant |
| `./bench clean` | Remove old benchmark data | instant |
| `./bench preflight` | Check environment | instant |

## Options

```bash
./bench hotpot -n 50           # Custom number of questions
./bench hotpot --quick         # Minimal (n=10)
./bench hotpot --full          # Full (n=500)
./bench hotpot --skip-preflight # Skip environment checks
./bench hotpot --no-archive    # Don't save to runs/
```

## Results

Results are automatically archived to `runs/<timestamp>_<benchmark>/`.

View past runs:
```bash
./bench runs
```

## Troubleshooting

### REST API not responding
```bash
cd apps/rest-api && PORT=8081 npx tsx src/server.ts &
```

### Search returns wrong/old facts
```bash
./bench clean
```

### Full preflight check
```bash
./scripts/preflight.sh --fix
```
