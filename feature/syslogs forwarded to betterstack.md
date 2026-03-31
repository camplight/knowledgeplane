# Syslogs forwarded to Better Stack

## Goal

Centralize production logs from **KnowledgePlane** in **Better Stack Logs** with the smallest possible change set:

- Start by forwarding **container stdout/stderr** (JSON logs) from:
  - `apps/mcp-server`
  - `apps/rest-api`
- Use **syslog forwarding** via an external collector/agent (preferred) so application code stays simple and reversible.
- Ensure logs are **safe to ship externally** (no `Authorization` headers, API keys, cookies, etc.).

This is intentionally incremental: deliver value quickly, then expand only if the business wants dashboards/alerts and deeper log enrichment.

---

## Current state (what we have today)

- **MCP server** (`apps/mcp-server`):
  - Fastify logger (Pino) configured in `apps/mcp-server/src/index.ts`.
  - A number of MCP-specific logs in `apps/mcp-server/src/routes/mcp.ts` and `apps/mcp-server/src/mcp/server.ts`.
- **REST API** (`apps/rest-api`):
  - Fastify `logger: true` (Pino) in `apps/rest-api/src/server.ts`.
- Logs are emitted to **stdout** (JSON in production; prettified in dev for MCP server).

---

## Phase 1 (MVP): syslog-forward stdout to Better Stack (no app-native network calls)

### What gets shipped

- **Pino JSON logs** from `mcp-server` and `rest-api` containers.
- Initial focus: `warn`/`error` plus high-value `info` events (MCP tool failures, OAuth failures).

### Why this approach

- Keeps the app deployable without a Better Stack dependency.
- Uses standard container logging practices.
- If Better Stack is removed later, app code does not need to change.

### Implementation steps

1. **Create Better Stack Logs source**
   - In Better Stack, create a Logs source for `knowledgeplane`.
   - Choose syslog ingestion (Better Stack supports RFC5424 with a required `source_token` in structured data).

2. **Choose a forwarding mechanism**

   **Recommended (for Docker hosts): Vector**
   - Better Stack provides a Docker+Vector setup flow that tails container logs and ships them to Better Stack.
   - This is usually the simplest way to ship container stdout/stderr without touching the app.

   **Alternative: RSyslog / syslog-ng**
   - Configure syslog on the host to forward logs to Better Stack.
   - Better Stack syslog expects structured data like:
     - `[logtail@11993 source_token="$SOURCE_TOKEN"]`
   - Encrypted TCP is typically on port `6514` (Better Stack docs).

3. **Production logging configuration**
   - Ensure production uses **JSON logs** (no `pino-pretty` transport).
   - Set `LOG_LEVEL` to a practical value (`info` or `warn`) to avoid noise.

4. **Redaction and safety**
   - Make sure logs do **not include**:
     - `Authorization` header
     - cookies / session tokens
     - API keys (`knowledgeplane-key`)
   - Prefer structured logs with small, stable fields instead of dumping request headers/bodies.

5. **Smoke test**
   - Deploy with forwarding enabled.
   - Confirm Better Stack “Live tail” shows logs from both services.
   - Trigger a controlled error path (e.g., hit an endpoint with invalid auth) and verify logs are present and redacted.

---

## Phase 2 (only if needed): app-native Better Stack transport (opt-in)

If infra forwarding is insufficient (e.g., you need selective forwarding or guaranteed delivery independent of host log shipping), add an **optional Pino transport**:

- A Pino transport process/script that forwards selected log events to Better Stack’s HTTP ingestion endpoint.
- Must be opt-in via env, and must not break the app if Better Stack is down.

This is a follow-on task only after we validate Phase 1.

---

## Phase 3: business follow-ups (no/low code)

- **Dashboards**: error rates, MCP tool failures, OAuth failures.
- **Alerts**: spikes in 5xx errors, tool handler failures, auth failures.
- **Log enrichment** (only if safe): workspace/user IDs for multi-tenant troubleshooting.

---

## Notes / constraints

- Avoid logging full request headers or bodies. OAuth flows, API keys, and session cookies can leak into logs if we’re not careful.
- If we later decide to forward worker logs (`apps/background-workers`), we should ensure they use consistent structured logging as well.

