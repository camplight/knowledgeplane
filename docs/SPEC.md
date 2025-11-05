🧠 KnowledgePlane — Shared Team Memory for AI Agents (MCP Server)

KnowledgePlane is an open-core Model Context Protocol (MCP) server that gives AI agents and teams a shared, persistent memory layer — secure, queryable, and self-maintaining.

🎯 Problem

Agents forget everything between sessions, and teams lose context across tools.
Existing "memory" layers are personal, ad-hoc, or hard to integrate.
Teams need a collaborative, auditable memory that works across agents and environments.

💡 Solution

KnowledgePlane provides a shared knowledge base for agents, exposed as an MCP server over HTTP.
Agents can write, recall, and search "facts" within knowledge contexts — with user tracking and session management.

⚙️ Core Features

MCP-compliant server – works out-of-the-box with Claude Desktop, VS Code MCP host, Cursor, Windsurf, LangChain/LangGraph, etc.

Knowledge contexts – organize memory using flexible `knowledge_context` field for scoping facts.

Full-text search – keyword search using PostgreSQL full-text search with GIN indexes.

User management – automatic user creation and tracking via username/email.

Session-based context – MCP sessions maintain user and knowledge context across requests.

Docker-first deployment – one-command local or hosted setup.

🧩 Architecture Overview
```
Web Dashboard (React + tRPC)
   ↓
[Fastify Server + tRPC]
   ↓
Clients (Claude Desktop, VS Code, Cursor)
   ↓
[MCP Server over HTTP]
   ↓
PostgreSQL (memory store with full-text search)
```

🔐 MCP Tools

| Tool | Description |
|------|-------------|
| `facts.write` | Write a fact with content, metadata, user tracking, and optional knowledge context |
| `facts.search` | Search facts using full-text search with optional knowledge context filtering and pagination. Trashed facts are excluded by default |
| `facts.update` | Update a fact in the knowledge base. Only provided fields will be updated |
| `facts.trash` | Mark a fact as trashed. Trashed facts are excluded from search results unless explicitly included |
| `users.register` | Register a new user or update an existing user's email if the username already exists |
| `knowledgecontexts.list` | List all distinct knowledge contexts stored in the database. Trashed facts are excluded by default |

**facts.write Parameters:**
- `content` (required): The content of the fact
- `metadata` (optional): Key-value pairs of metadata
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)
- `knowledge_context` (optional): Context or namespace for organizing facts

**facts.search Parameters:**
- `query` (required): Search query for full-text search. Use '*' to search all facts
- `knowledge_context` (optional): Filter by knowledge context
- `k` (optional): Limit for number of results (default: 5)
- `offset` (optional): Offset for pagination (default: 0)
- `include_trashed` (optional): If true, includes trashed facts in search results (default: false)

**facts.update Parameters:**
- `id` (required): The ID of the fact to update
- `content` (optional): The updated content of the fact
- `metadata` (optional): Updated key-value pairs of metadata
- `last_updated_by` (required): User ID of the person updating the fact
- `knowledge_context` (optional): Updated context or namespace for organizing facts

**facts.trash Parameters:**
- `id` (required): The ID of the fact to trash
- `last_updated_by` (required): User ID of the person trashing the fact

**users.register Parameters:**
- `username` (required): Unique username for the user
- `email` (required): Email address for the user

**knowledgecontexts.list Parameters:**
- `include_trashed` (optional): If true, includes knowledge contexts from trashed facts (default: false)

🔌 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /mcp` | MCP protocol endpoint (StreamableHTTPServerTransport) |
| `GET /health` | Health check endpoint |
| `GET /docs` | Swagger UI documentation |
| `GET /` | Landing page with features overview and authentication options |
| `GET /auth/google` | React login page for Google OAuth |
| `GET /auth/google/redirect` | Redirects to Google OAuth authorization (internal) |
| `GET /auth/google/callback` | Google OAuth callback endpoint (supports `?mcp=true` for MCP sessions) |
| `GET /auth/github` | React login page for GitHub OAuth |
| `GET /auth/github/redirect` | Redirects to GitHub OAuth authorization (internal) |
| `GET /auth/github/callback` | GitHub OAuth callback endpoint (supports `?mcp=true` for MCP sessions) |
| `GET /auth/info` | Get available OAuth providers and login URLs |
| `GET /.well-known/oauth-authorization-server` | OAuth 2.0 Authorization Server Metadata (RFC8414) for MCP client discovery |
| `GET /.well-known/oauth-authorization-server/:resource` | Resource-specific OAuth 2.0 Authorization Server Metadata |
| `GET /.well-known/oauth-protected-resource` | OAuth 2.0 Protected Resource Metadata (RFC8705) |
| `GET /.well-known/oauth-protected-resource/:resource` | Resource-specific OAuth 2.0 Protected Resource Metadata |
| `GET /authorize` | OAuth 2.1 authorization endpoint (MCP-compliant) |
| `POST /token` | OAuth 2.1 token endpoint for code exchange (MCP-compliant) |
| `POST /register` | OAuth 2.0 Dynamic Client Registration endpoint (RFC7591) |
| `ALL /trpc/*` | tRPC endpoint for type-safe API calls |
| `GET /dashboard` | User dashboard (protected, requires session) |
| `GET /facts` | Browse facts page (protected, requires session) |
| `GET /users` | Browse users page (protected, requires session) |

**Session Management:**

KnowledgePlane supports three types of authentication:

1. **Web User Sessions** (for dashboard access):
   - Uses HTTP cookies for session management
   - Created when users authenticate via `/auth/google` or `/auth/github` without `?mcp=true`
   - Redirects to `/dashboard` after successful authentication
   - Access to React dashboard and tRPC endpoints

2. **MCP Sessions** (for AI agent access):
   - Uses Bearer token authentication (`Authorization: Bearer <token>`)
   - Created when OAuth callback includes `?mcp=true` query parameter
   - Returns OAuth access token as JSON response
   - Token can be used for MCP API calls

3. **API Key Authentication** (for server-to-server and automated access):
   - Uses `knowledgeplane-key` header for authentication (also supports `knowledgeplane_key`)
   - If `API_KEYS` environment variable is configured, validates against it (comma-separated list)
   - If `API_KEYS` is not configured, any API key is accepted and automatically creates/finds a user with that key stored in their profile
   - The same API key always maps to the same user for consistency
   - No OAuth flow required - direct authentication
   - Suitable for automated scripts, CI/CD pipelines, and server-to-server communication
   - User ID is automatically inferred from the API key authentication context

**MCP Session Management:**
- Sessions are identified by `mcp-session-id` header
- User context is automatically inferred from authenticated session (OAuth token or API key)
- User context can also be provided via query params: `?username=user&email=user@example.com` (fallback if not authenticated)
- Knowledge context can be provided via query param: `?knowledge_context=project-alpha`
- Authentication via `Authorization: Bearer <token>` header (OAuth) or `knowledgeplane-key` header (API key)
- For `facts.write`, `created_by` and `last_updated_by` are automatically set from the authenticated user's ID if not explicitly provided

🗄️ Data Model

**User Table:**
- `id` (UUID): Primary key
- `username` (text): Unique username
- `email` (text): User email
- `api_key` (text): Optional API key stored in user profile (for API key-based authentication)
- `created_at` (timestamptz): Creation timestamp

**Fact Table:**
- `id` (UUID): Primary key
- `content` (text): Fact content
- `metadata` (jsonb): Key-value metadata
- `created_at` (timestamptz): Creation timestamp
- `updated_at` (timestamptz): Last update timestamp
- `created_by` (UUID): Reference to user
- `last_updated_by` (UUID): Reference to user
- `knowledge_context` (text): Optional context for organizing facts
- `trashed` (boolean): Whether the fact has been trashed (default: false)

🔐 OAuth Authentication

KnowledgePlane supports OAuth2 authentication with Google (Gmail) and GitHub, and implements OAuth 2.1 compliant authorization server for MCP clients.

**Supported Providers:**
- **Google OAuth** - Login with Google account (Gmail)
- **GitHub OAuth** - Login with GitHub account

**MCP OAuth Discovery (RFC8414):**

KnowledgePlane implements OAuth 2.0 Authorization Server Metadata discovery per the MCP specification:
- `GET /.well-known/oauth-authorization-server` - Returns OAuth server metadata including endpoints and supported features
- MCP clients automatically discover authorization and token endpoints
- Supports PKCE (Proof Key for Code Exchange) as required by MCP spec
- Supports dynamic client registration via `POST /register`

**Authentication Flow:**

**Web User Authentication:**
1. User visits `/` to see the landing page with features overview and authentication options
2. User clicks "Continue with Google" or "Continue with GitHub" to visit `/auth/google` or `/auth/github`
3. User clicks the "Continue with [Provider]" button on the login page, which redirects to `/auth/google/redirect` or `/auth/github/redirect`
4. User is redirected to the OAuth provider's login page
5. After successful authentication, user is redirected to the callback endpoint
6. System creates or retrieves user account based on OAuth provider data
7. A session cookie is created and user is redirected to `/dashboard`
8. Dashboard provides instructions for using MCP URL with agents

**MCP Session Authentication (for AI agents):**
1. MCP client (e.g., ChatGPT) discovers OAuth configuration via `/.well-known/oauth-authorization-server`
2. MCP client initiates OAuth flow via `GET /authorize` with PKCE parameters (`code_challenge`, `code_challenge_method`, `redirect_uri`, `state`, etc.)
3. Server stores authorization request and redirects to Google/GitHub OAuth provider
4. User authenticates with provider
5. Provider redirects back to server callback (`/auth/google/callback` or `/auth/github/callback`)
6. Server generates authorization code and redirects back to client's `redirect_uri` with the code and state
7. MCP client exchanges authorization code for access token via `POST /token` with `code_verifier` (PKCE)
8. Server validates PKCE and returns OAuth provider's access token
9. Token can be used in `Authorization: Bearer <token>` header for MCP API calls

**Legacy MCP Authentication (still supported):**
1. Agent/script calls OAuth callback with `?mcp=true` query parameter: `/auth/google/callback?mcp=true`
2. After OAuth flow, callback returns JSON with access token instead of creating session cookie
3. Token can be used in `Authorization: Bearer <token>` header for MCP API calls

The web interface is built with React and Tailwind CSS, featuring:
- A modern, polished landing page (`/`) with enhanced visual design inspired by top SaaS products
- Clean, minimal design with animated gradient backgrounds, subtle grid patterns, and glassmorphism effects
- Smooth animations and micro-interactions for improved user experience
- Interactive code example section demonstrating API usage
- Enhanced typography and visual hierarchy
- Responsive design optimized for all screen sizes
- Responsive login pages for OAuth authentication
- User dashboard (`/dashboard`) with:
  - User profile information display
  - Facts overview with statistics (total facts, active facts, knowledge contexts)
  - Facts list with pagination, metadata display, and knowledge context tags
  - Logout functionality
  - Automatic redirect to landing page for unauthenticated users
- Facts browsing page (`/facts`) with pagination, filtering, and detailed fact display
- Users browsing page (`/users`) with user listing and API key status

**Token-Based Authentication:**
All endpoints support Bearer token authentication via the `Authorization` header:
```
Authorization: Bearer <oauth-token>
```

The system automatically:
- Validates tokens from Google (ID tokens and access tokens)
- Validates tokens from GitHub (access tokens)
- Creates/updates user accounts from OAuth provider data
- Supports generic JWT with JWKS verification for custom providers

**API Key Authentication:**
As an alternative to OAuth tokens, endpoints also support API key authentication via the `knowledgeplane-key` header (also supports `knowledgeplane_key`). This is useful for server-to-server communication or automated scripts.

```
knowledgeplane-key: <api-key>
```

API key behavior:
- If `API_KEYS` environment variable is configured (comma-separated list), keys are validated against it
- If `API_KEYS` is not configured, any API key is accepted and automatically creates/finds a user with that key stored in their profile
- The same API key always maps to the same user, ensuring consistency across requests
- User ID is automatically inferred from the API key authentication context
- API key authentication takes precedence over Bearer token authentication if both are provided

**Environment Variables:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `SESSION_SECRET` - Secret key for session encryption (minimum 32 characters, defaults to insecure placeholder in development)
- `API_KEYS` - Comma-separated list of valid API keys for API key authentication (optional)
- `OAUTH_REDIRECT_BASE_URL` - Base URL for OAuth callbacks (default: `http://localhost:8080`)
- `OAUTH_SUCCESS_REDIRECT_URL` - URL to redirect after successful auth (default: `http://localhost:5173`)
- `OAUTH_PROVIDER` - Force a specific provider: `google` or `github` (optional)
- `JWKS_URI` - JWKS endpoint for custom OAuth providers (optional)
- `JWT_SECRET` - Secret for JWT verification (development only)

**Example: Using OAuth Token**
```bash
# Get auth info (shows available providers)
curl http://localhost:8080/auth/info

# Login with Google (redirects to Google)
open http://localhost:8080/auth/google

# Use token in API calls
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer <google-or-github-token>" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Example: Using API Key**
```bash
# Use API key in API calls (no OAuth token needed)
# User ID is automatically inferred from the API key
curl -X POST http://localhost:8080/mcp \
  -H "knowledgeplane-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

🛠️ Tech Stack

- **Fastify** + **TypeScript** backend
- **React** + **Vite** frontend with **TypeScript**
- **tRPC** for type-safe API communication between frontend and backend
- **PostgreSQL** with full-text search (GIN indexes on tsvector)
- **MCP SDK** (`@modelcontextprotocol/sdk`) for protocol implementation
- **Docker Compose** infrastructure
- **OAuth2** authentication (`@fastify/oauth2`) - Google and GitHub support
- **Session management** (`@fastify/secure-session`, `@fastify/cookie`) for OAuth state management and web user sessions
- **JWT/JWKS** token validation for MCP sessions
- **Swagger/OpenAPI** documentation
- **Tailwind CSS** for styling

🚀 Quick Start

**Monorepo Structure:**
This project uses npm workspaces with two main packages:
- `server` - Backend server (Fastify + TypeScript)
- `web` - Frontend application (React + Vite + TypeScript)

**Installation:**
```bash
# Bootstrap all dependencies
npm run bootstrap
```

**Development Mode:**
```bash
# Start infrastructure, server, and web app
npm run dev

# This will:
# - Start PostgreSQL with pgvector in Docker
# - Wait for database to be ready
# - Start the server in watch mode (port 8080)
# - Start the web app in dev mode (port 5173)
```

**Other Commands:**
```bash
# Run linter on all workspaces
npm run lint

# Build all workspaces
npm run build

# Run tests on all workspaces
npm run test

# Rebuild everything (clean build + restart DB)
npm run rebuild

# Run database migrations (if database already exists)
npm run migrate

# Seed the database
npm run seed

# Stop development servers
npm run dev:stop
```

**Production Mode:**
```bash
docker compose -f infra/docker-compose.yml up --build
```

The server will start on `http://localhost:8080`

**Test MCP Connection:**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Example: Write a fact (with authentication)**
```bash
# User ID is automatically inferred from authenticated session (OAuth token or API key)
# created_by and last_updated_by are automatically populated
curl -X POST "http://localhost:8080/mcp" \
  -H "Authorization: Bearer <oauth-token>" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"facts.write",
      "arguments":{
        "content":"Project Apollo uses port 9090",
        "knowledge_context":"demo"
      }
    }
  }'
```

**Example: Write a fact (with API key)**
```bash
# API key automatically creates/finds user and infers user ID
curl -X POST "http://localhost:8080/mcp" \
  -H "knowledgeplane-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"facts.write",
      "arguments":{
        "content":"Project Apollo uses port 9090",
        "knowledge_context":"demo"
      }
    }
  }'
```

**Example: Write a fact (fallback via query params)**
```bash
# If not authenticated, username/email can be provided in query params
# created_by and last_updated_by are automatically populated from the user context
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"facts.write",
      "arguments":{
        "content":"Project Apollo uses port 9090",
        "knowledge_context":"demo"
      }
    }
  }'
```

Alternatively, you can explicitly provide user IDs:
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"facts.write",
      "arguments":{
        "content":"Project Apollo uses port 9090",
        "created_by":"<user-uuid>",
        "last_updated_by":"<user-uuid>",
        "knowledge_context":"demo"
      }
    }
  }'
```

**Example: Search facts**
```bash
curl -X POST http://localhost:8080/mcp?knowledge_context=demo \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"facts.search",
      "arguments":{
        "query":"Apollo",
        "knowledge_context":"demo",
        "k":10
      }
    }
  }'
```

**Example: Update a fact**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":4,
    "method":"tools/call",
    "params":{
      "name":"facts.update",
      "arguments":{
        "id":"<fact-uuid>",
        "content":"Updated project information: Apollo uses port 9090 and connects to Redis",
        "metadata":{
          "source":"manual-update",
          "version":"2.0"
        }
      }
    }
  }'
```

**Example: Register a user**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":5,
    "method":"tools/call",
    "params":{
      "name":"users.register",
      "arguments":{
        "username":"alice",
        "email":"alice@example.com"
      }
    }
  }'
```

**Example: Trash a fact**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":6,
    "method":"tools/call",
    "params":{
      "name":"facts.trash",
      "arguments":{
        "id":"<fact-uuid>"
      }
    }
  }'
```

**Example: Search including trashed facts**
```bash
curl -X POST http://localhost:8080/mcp?knowledge_context=demo \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":7,
    "method":"tools/call",
    "params":{
      "name":"facts.search",
      "arguments":{
        "query":"*",
        "knowledge_context":"demo",
        "include_trashed":true
      }
    }
  }'
```

🔗 Integrate (Claude Desktop)

For stdio-based MCP (using adapter directly):
```json
{
  "clients": {
    "knowledgeplane": {
      "command": "node",
      "args": ["server/dist/mcp/adapter.js"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost:5432/knowledgeplane"
      }
    }
  }
}
```

For HTTP-based MCP (via server endpoint):
Configure your MCP client to connect to `http://localhost:8080/mcp` with appropriate session headers.

🪄 Vision

KnowledgePlane runs itself: it monitors usage, updates docs, and manages its own release notes — a self-sustaining memory platform for the agentic era.

📝 Implementation Status

**Current Features:**
- ✅ MCP server implementation (HTTP transport)
- ✅ User management (auto-create from username/email, explicit registration via `users.register` tool)
- ✅ OAuth2 authentication with Google (Gmail) and GitHub
- ✅ Token-based authentication for API endpoints
- ✅ Facts write/read operations
- ✅ Fact update operations (update content, metadata, knowledge context)
- ✅ Full-text search with knowledge context filtering
- ✅ Fact trashing (mark facts as trashed, exclude from search by default)
- ✅ Session-based context management
- ✅ Health check endpoint
- ✅ Swagger documentation
- ✅ Web UI for browsing facts with pagination and filtering
- ✅ Web UI for browsing users with pagination
- ✅ tRPC routes for listing facts and users

**Planned Features:**
- 🔲 Semantic search with pgvector embeddings
- 🔲 REST API endpoints (beyond MCP)
- 🔲 Namespace/project organization
- 🔲 Audit logs
- 🔲 Retention policies
- 🔲 RBAC and advanced authentication
- 🔲 Analytics and telemetry