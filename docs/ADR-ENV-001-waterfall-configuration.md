# ADR-ENV-001: Waterfall Environment Configuration Strategy

**Status:** Accepted
**Date:** 2026-02-14
**Context:** Addressing persistent environment variable configuration issues (5th occurrence)

## Problem

Multiple `.env` files across the codebase caused:
- Duplicate configuration
- Inconsistent values between services
- Missing variables in background workers
- Confusion about which `.env` file to edit
- Repeated issues with environment loading

## Decision

Implement a **waterfall/cascade environment loading strategy**:

1. **Root `.env`** - Single source of truth for shared defaults
2. **Service `.env.dev`** - Optional overrides for service-specific config
3. **Load order:** Root first, then service (later files win for duplicate keys)

### Implementation

All services use:
```json
{
  "dev": "dotenv -e ../../.env -e .env.dev -- tsx watch src/index.ts"
}
```

### File Structure

```
knowledgeplane/
├── .env                    ← SHARED DEFAULTS (ArangoDB, OpenAI, OAuth)
├── apps/
│   ├── mcp-server/
│   │   └── .env.dev       ← Optional: Override PORT, specific config
│   ├── rest-api/
│   │   └── .env.dev       ← Optional: Override PORT, specific config
│   └── background-workers/
│       └── .env.dev       ← Optional: Override worker settings
└── infra/
    └── docker-compose.yml  ← Reads root .env automatically
```

## Root .env Contents

```bash
# ArangoDB Configuration
ARANGO_URL=http://localhost:8529
ARANGO_DB=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=root

# AI API Keys
OPENAI_API_KEY=sk-proj-...

# OAuth Credentials
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Benchmark Credentials
KP_API_URL=http://localhost:8081
KP_WORKSPACE_ID=your-workspace-id
KP_USER_ID=your-user-id
KP_API_KEY=your-api-key
```

## Service Override Example

Create `apps/rest-api/.env.dev` to override port:
```bash
PORT=9999  # Override default 8081
```

Service will:
- ✅ Use PORT=9999 from service `.env.dev`
- ✅ Use ARANGO_PASSWORD from root `.env`
- ✅ Use OPENAI_API_KEY from root `.env`

## Docker Compose Integration

Docker Compose automatically reads `.env` from parent directories. No additional configuration needed.

Services inside Docker can override for container networking:
```bash
# docker-compose.yml
environment:
  - ARANGO_URL=http://db:8529  # Override for internal Docker network
```

## Test Override Pattern

Benchmark tests override only networking:
```bash
# tests/benchmarks/.env
KP_API_URL=http://host.docker.internal:8081  # Docker → host communication
# All other values inherited from root .env
```

## Benefits

1. **Single Source of Truth** - Root `.env` has all shared config
2. **Service-Specific Overrides** - Each service can customize without duplication
3. **Clear Waterfall** - Load order is obvious: root → service
4. **No Duplication** - Shared values defined once
5. **Flexible Testing** - Override networking for Docker, ports for dev

## Consequences

### Positive
- No more hunting for which `.env` file has what
- Config defined once, used everywhere
- Clear mental model: root defaults → service overrides
- Eliminates duplicate configuration bugs
- Simple to add new services

### Negative
- Developers must understand waterfall precedence
- Must document which variables are shared vs service-specific
- Service `.env.dev` files are optional but may not exist

### Mitigation
- Document strategy in ADR and ENV_STRATEGY.md
- Include .env.dev.example in each service showing available overrides
- Fail fast with clear error messages if required env vars missing

## Verification

See `WATERFALL_VERIFICATION.md` for complete verification:
- ✅ No regressions in critical fixes
- ✅ All services load from root + optional override
- ✅ REST API, ArangoDB, workers all functional
- ✅ Waterfall override capability tested

## Alternatives Considered

1. **Single root .env only** - Too inflexible for service-specific config
2. **Environment-specific files** (.env.development, .env.production) - More complex mental model
3. **Separate per-service .env** - Caused the original duplication problem
4. **Config service** - Over-engineered for current needs

## References

- Environment variable best practices
- 12-factor app methodology
- Previous incidents: 5th occurrence of .env issues prompted this ADR
