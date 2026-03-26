# knowledgeplane

**Autonomous team knowledge for AI agents (MCP server).**

- Team/project **namespaces**, RBAC scaffolding, audit logs
- **Hybrid retrieval** (pgvector + BM25 via `pgroonga` optional)
- **MCP tools** for read/write/search facts
- OpenAPI + tiny JS SDK
- Docker-first deploy

**📚 Documentation:**
- **[Getting Started](./GETTING_STARTED.md)** - Quick start guide
- **[Development Guide](./DEVELOPMENT.md)** - Localhost setup with ngrok
- **[Deployment Guide](./DEPLOYMENT.md)** - Cloud deployment (Digital Ocean, etc.)
- **[Environment Setup](./ENV_SETUP.md)** - Environment variables configuration
- **[API Specification](./docs/SPEC.md)** - Complete API documentation

### Quickstart

**Development Mode (with hot reload):**

```bash
# 1) Clone & bootstrap
npm run bootstrap

# 2) Set up environment variables
./scripts/setup-env.sh  # Creates .env files from examples
# Edit .env files with your values (see DEVELOPMENT.md)

# 3) Start infrastructure + dev server (auto-reloads on code changes)
npm run dev

# 4) Configure and start ngrok for MCP/OAuth callbacks
cp ngrok.config.example ngrok.config.yml
# Edit ngrok.config.yml and set your ngrok authtoken
ngrok start --config ./ngrok.config.yml mcp-server

# The command will:
# - Start ArangoDB in Docker (port 8529)
# - Wait for database to be ready
# - Start MCP server in watch mode (port 8080)
# - Start webapp in dev mode (port 3000)
# - Start background workers
```

**For detailed development setup including ngrok and OAuth configuration, see [DEVELOPMENT.md](./DEVELOPMENT.md)**

### ngrok Config (Reserved Domain)

Use the provided ngrok config files to expose the local MCP server at:
`https://boa-driving-distinctly.ngrok-free.app`

- `ngrok.config.example` is committed as the template
- `ngrok.config.yml` is for local use and is gitignored

```bash
cp ngrok.config.example ngrok.config.yml
# Set your authtoken in ngrok.config.yml
ngrok start --config ./ngrok.config.yml mcp-server
```

**Production Mode:**

```bash
# Start full stack (ArangoDB + all services in Docker)
docker compose -f infra/docker-compose.yml up --build
```

**For quick cloud deployment (Railway recommended), see [DEPLOYMENT.md](./DEPLOYMENT.md)**

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

### License

Apache-2.0

