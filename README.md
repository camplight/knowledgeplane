# knowledgeplane

**Autonomous team memory for AI agents (MCP server).**

- Team/project **namespaces**, RBAC scaffolding, audit logs
- **Hybrid retrieval** (pgvector + BM25 via `pgroonga` optional)
- **MCP tools** for read/write/search facts
- OpenAPI + tiny JS SDK
- Docker-first deploy

### Quickstart

**Development Mode (with hot reload):**

```bash
# 1) Clone & bootstrap
npm run bootstrap

# 2) Start infrastructure + dev server (auto-reloads on code changes)
npm run dev

# The command will:
# - Start PostgreSQL with pgvector in Docker
# - Wait for database to be ready
# - Start the server in watch mode (code changes auto-reload)
```

**Production Mode:**

```bash
# 1) Start full stack (Postgres + server in Docker)
docker compose -f infra/docker-compose.yml up --build

# 2) Seed a dev API key
make -C infra dev-key

# 3) Test the API
curl http://localhost:8080/health

curl -X POST http://localhost:8080/v1/facts.write \
  -H "Authorization: Bearer DEV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace":"demo","content":"Project Apollo: use port 9090","tags":["devops","ports"],"ttl":86400}'

curl -X POST http://localhost:8080/v1/facts.search \
  -H "Authorization: Bearer DEV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"namespace":"demo","query":"Which port for Apollo?","k":5}'
```

**Stop development servers:**
```bash
npm run dev:stop  # Stops Docker containers
```

### MCP integration (Claude Desktop)

**Option 1: Connect via URL (HTTP/SSE)**

Add to your `mcp.json`:

```json
{
  "clients": {
    "knowledgeplane": {
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer DEV_API_KEY"
      }
    }
  }
}
```

**Option 2: Connect via stdio adapter**

Add to your `mcp.json`:

```json
{
  "clients": {
    "knowledgeplane": {
      "command": "node",
      "args": ["server/dist/mcp/adapter.js"],
      "env": {
        "KNOWLEDGEPLANE_API_URL": "http://localhost:8080",
        "KNOWLEDGEPLANE_API_KEY": "DEV_API_KEY"
      }
    }
  }
}
```

### Packages

* **server** – Fastify + Postgres/pgvector
* **sdk/js** – fetch-based client

### License

Apache-2.0 (suggested)

