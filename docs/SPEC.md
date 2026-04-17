🧠 KnowledgePlane — Shared Workspace Memory for AI Agents (MCP Server)

KnowledgePlane is an open-core Model Context Protocol (MCP) server that gives AI agents and teams a shared, persistent memory layer — secure, queryable, and self-maintaining.

Short version for sharing: `docs/SPEC_SHORT.md`.

🎯 Problem

Agents forget everything between sessions, and teams lose context across tools.
Existing "memory" layers are personal, ad-hoc, or hard to integrate.
Teams need a collaborative, auditable memory that works across agents and environments.

💡 Solution

KnowledgePlane provides a shared knowledge base for agents, exposed as an MCP server over HTTP.
Agents can write, recall, and search "facts" — with user tracking and session management.

⚙️ Core Features

MCP-compliant server – works out-of-the-box with Claude Desktop, VS Code MCP host, Cursor, Windsurf, LangChain/LangGraph, etc.

Facts and categories – organize memory using facts and hierarchical categories.

Full-text search – keyword search using ArangoDB full-text indexes.

Vector embeddings – automatic generation of embeddings for facts, fact relations, and knowledge cards using OpenAI embeddings. Enables semantic search capabilities with manual cosine similarity calculation. Hybrid fact retrieval now uses a query-adaptive rank-fusion pipeline (BM25 + vector + lexical coverage) to improve no-reranker relevance while keeping the same simple `facts_search` API.

Graph database – ArangoDB provides native graph capabilities for modeling relationships between facts.

Relations – facts can be linked together with typed relationships (references, depends_on, related_to, part_of, etc.). New writes support optional `context` metadata and perform first-wave relation stitching at write time so the graph starts connected immediately. First-wave relation metadata now carries confidence/provenance signals for downstream replay/pruning.

AQL queries – support for ArangoDB Query Language (AQL) for advanced graph queries and traversals.

KnowledgeCard consolidation – background worker automatically creates FactRelations between unconsolidated facts using AI analysis, then consolidates related facts and their FactRelations into summary knowledge cards using OpenAI agents. The worker uses graph traversal to find related facts via FactRelations.

DataSource automation – automated data sources that gather knowledge from external sources (APIs, websites, databases, etc.) and store facts into the Knowledge Plane. Data sources are defined via markdown files or zip archives containing instructions and code, scheduled to run at intervals or cron expressions, and executed by a background worker that uses AI models with code interpretation capabilities and MCP tools to store gathered knowledge. The data source runner provides a `code_execute` function tool (not an MCP tool) that allows executing JavaScript/TypeScript code in a sandboxed VM environment with access to secrets, facts API, and a `logProgress` function for custom progress logging. This tool is only available during data source execution and is passed directly to the AI model.

Webhooks – register webhooks to receive notifications on fact/card events.

REST API – comprehensive REST API for programmatic access.

User management – automatic user creation and tracking via username/email.

Workspace management – users can create workspaces, invite members, and manage workspace settings. All domain data (facts, cards, files, etc.) is scoped to workspaces.

User onboarding – automatic onboarding flow for new users on first login, including default workspace creation.

Workspace invitations – personal invitation links (shareable tokens) for inviting users to workspaces. Links can be copied and shared with friends. Invitation links can be accepted multiple times, allowing many users to register and join the workspace through the same link. All acceptances are tracked and stored.

Session-based context – MCP sessions maintain user and knowledge context across requests.

Docker-first deployment – one-command local or hosted setup.

Docker image distribution – distribute KnowledgePlane as Docker images that clients can deploy with their own configuration via environment variables. Clients receive a docker-compose.yml and configure via .env file.

🧩 Architecture Overview
```
Web Dashboard (React + Next.js + tRPC)
   ↓
Editor (Knowledge Base Browser)
   ↓
[Fastify Server + tRPC]
   ↓
Clients (Claude Desktop, VS Code, Cursor)
   ↓
[MCP Server over HTTP]  [REST API]
   ↓
Background Workers (Card Consolidation, Embeddings Generation, Data Source Runner)
   ↓
ArangoDB (graph database with full-text search)
```

🔐 MCP Tools

Tool names use underscores (`facts_write`). Dotted names shown elsewhere are legacy
and should be treated as underscore equivalents.

| Tool | Description |
|------|-------------|
| `facts_write` | Write a fact with content, metadata, and user tracking |
| `facts_bulkwrite` | Write multiple facts to the knowledge base in a single operation |
| `facts_search` | Search facts using hybrid search (combines full-text and vector search) with pagination. Trashed facts are excluded by default |
| `facts_update` | Update a fact in the knowledge base. Only provided fields will be updated |
| `facts_trash` | Mark a fact as trashed. Trashed facts are excluded from search results unless explicitly included |
| `facts_consolidate` | Consolidate a set of facts into a knowledge card using AI. Optionally includes related facts via graph traversal |
| `knowledge_cards_create` | Create a new knowledge card with title, summary, content, and associated fact IDs |
| `knowledge_cards_update` | Update a knowledge card. Only provided fields will be updated |
| `knowledge_cards_delete` | Delete a knowledge card by ID |
| `knowledge_cards_search` | Search knowledge cards using hybrid search (combines full-text and vector search) with pagination |
| `knowledge_cards_list` | List knowledge cards with pagination |
| `knowledge_cards_split` | Split a knowledge card into multiple cards using AI |
| `knowledge_cards_combine` | Combine multiple knowledge cards into a single card using AI |
| `users_register` | Register a new user or update an existing user's email if the username already exists |
| `files_upload` | Upload a file and automatically extract facts and FactRelations using AI. The file content is analyzed using OpenAI to identify key information and relationships |
| `files_list` | List files with pagination |
| `files_get` | Get a file by ID |
| `files_search` | Search files by fact ID. Returns all files that contain the specified fact ID in their fact_ids array |
| `files_update` | Update a file. Only provided fields will be updated. Metadata and fact_ids can be updated |
| `files_delete` | Delete a file by ID |
| `fact_relations_create` | Create a relation between two facts. Relations are typed edges in the knowledge graph |
| `fact_relations_update` | Update a fact relation. Only provided fields will be updated. Type and metadata can be updated |
| `fact_relations_delete` | Delete a fact relation by ID |
| `fact_relations_search` | Search fact relations with filtering. Supports filtering by from_fact, to_fact, and type. Supports pagination |
| `fact_relations_get` | Get a fact relation by ID |
| `fact_relations_get_related` | Get facts related to a given fact via outgoing relations. Returns relations and the related facts. Optionally filter by relation type |
| `fact_relations_get_incoming` | Get facts that have relations pointing to a given fact (incoming relations). Returns relations and the source facts. Optionally filter by relation type |
| `workers_trigger` | Trigger a background worker to run (card-consolidator or embeddings-generator) |

**facts_write Parameters:**
- `content` (required): The content of the fact
- `metadata` (optional): Key-value pairs of metadata
- `context` (optional): Additional write-time context used for first-wave graph linkage (for example `related_fact_ids`, `relation_hint`, tags, source context)
**Ingest Signals (internal):**
- Facts include `metadata.ingest_signals` with `ingest_priority` and `confidence` derived from write-time content/context.
- Retrieval logs an internal trace (`worker_logs`, `type: retrieval_trace`) with query/graph usage/result confidence for observability and future online calibration.

**Retrieval/Graph Runtime Controls (env):**
- `GRAPH_EXPANSION_ENABLED` (default: enabled): global on/off switch for adaptive graph expansion
- `GRAPH_QUERY_PLANNER_AI` (default: disabled): enables optional LLM query planning for graph traversal hints
- `GRAPH_EXPANSION_BUDGET_MS` (default: `120`): max graph-expansion time budget per query
- `GRAPH_EXPANSION_MAX_CANDIDATES` (default: `40`): cap of graph candidates considered per query
- `FIRST_WAVE_RELATION_MIN_SCORE` (default: `0.72`): minimum similarity score for automatic first-wave relation creation
- `FIRST_WAVE_MAX_NEIGHBORS` (default: `4`): max first-wave auto-linked neighbors per newly written fact
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**Note:** `workspace_id` is NOT accepted as a parameter. It is automatically set from the authenticated session context. Any `workspace_id` provided in tool arguments will be ignored and replaced with the workspace ID from the session context.

**facts_bulkwrite Parameters:**
- `facts` (required): Array of fact objects to write. Each fact object has the same parameters as `facts_write`:
  - `content` (required): The content of the fact
  - `metadata` (optional): Key-value pairs of metadata
  - `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
  - `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**Note:** `workspace_id` is NOT accepted as a parameter in any fact object. It is automatically set from the authenticated session context for all facts. Any `workspace_id` provided in tool arguments will be ignored and replaced with the workspace ID from the session context.

**facts_search Parameters:**
- `query` (required): Search query for hybrid search (combines full-text and vector search). Use '*' to search all facts
- `k` (optional): Limit for number of results (default: 5, max: 20). Results are optimized to prevent context window issues
- `offset` (optional): Offset for pagination (default: 0)
- `include_trashed` (optional): If true, includes trashed facts in search results (default: false)

**Note:** `workspace_id` is NOT accepted as a parameter. It is automatically set from the authenticated session context. Any `workspace_id` provided in tool arguments will be ignored and replaced with the workspace ID from the session context.

**facts_search Response Optimization:**
- Content is automatically truncated to 500 characters to prevent context window issues
- Embeddings and internal database fields (_key, _id, embedding_model) are excluded from results
- Maximum 20 results per request (k is capped at 20)
- Response includes a `content_truncated` flag for each fact if content was truncated
- Use `facts_update` or fetch individual facts if full content is needed

**facts_update Parameters:**
- `id` (required): The ID of the fact to update
- `content` (optional): The updated content of the fact
- `metadata` (optional): Updated key-value pairs of metadata
- `last_updated_by` (required): User ID of the person updating the fact

**workers_trigger Parameters:**
- `worker` (required): The name of the worker to trigger ("card-consolidator" or "embeddings-generator")

**facts_trash Parameters:**
- `id` (required): The ID of the fact to trash
- `last_updated_by` (required): User ID of the person trashing the fact

**facts_consolidate Parameters:**
- `fact_ids` (required): Array of fact IDs to consolidate
- `include_related` (optional): If true, includes related facts via graph traversal (default: false)
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**knowledge_cards_create Parameters:**
- `title` (required): Title of the knowledge card
- `summary` (required): Brief summary of the knowledge card
- `content` (required): Full content of the knowledge card
- `fact_ids` (required): Array of fact IDs that are consolidated into this card
- `workspace_id` (optional): Workspace ID. If not provided, inferred from authenticated session (uses user's first workspace)
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)
- `metadata` (optional): Key-value pairs of metadata

**knowledge_cards_update Parameters:**
- `id` (required): The ID of the knowledge card to update
- `title` (optional): Updated title of the knowledge card
- `summary` (optional): Updated summary of the knowledge card
- `content` (optional): Updated content of the knowledge card
- `fact_ids` (optional): Updated array of fact IDs
- `metadata` (optional): Updated key-value pairs of metadata
- `last_updated_by` (optional): User ID of the person updating the card. If not provided, inferred from authenticated session (OAuth token or API key)

**knowledge_cards_delete Parameters:**
- `id` (required): The ID of the knowledge card to delete

**knowledge_cards_search Parameters:**
- `query` (required): Search query for hybrid search. Use '*' to search all cards
- `workspace_id` (optional): Workspace ID for filtering. If not provided, inferred from authenticated session (uses user's first workspace)
- `k` (optional): Limit for number of results (default: 5)
- `offset` (optional): Offset for pagination (default: 0)
- `use_vector_search` (optional): If true, use vector search only; if false, use full-text only; if undefined, use hybrid

**knowledge_cards_list Parameters:**
- `workspace_id` (optional): Workspace ID for filtering. If not provided, inferred from authenticated session (uses user's first workspace)
- `limit` (optional): Maximum number of cards to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**knowledge_cards_split Parameters:**
- `id` (required): The ID of the knowledge card to split
- `num_cards` (optional): Number of cards to split into (default: 2)
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**knowledge_cards_combine Parameters:**
- `card_ids` (required): Array of knowledge card IDs to combine (at least 2 cards required)
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**users_register Parameters:**
- `username` (required): Unique username for the user
- `email` (required): Email address for the user

**knowledgecontexts_list Parameters:**
- `include_trashed` (optional): If true, includes trashed facts in search results (default: false)

**files_upload Parameters:**
- `filename` (required): Original filename of the file being uploaded
- `mimeType` (required): MIME type of the file (e.g., 'text/plain', 'application/json')
- `data` (required): Base64-encoded file content
- `workspace_id` (optional): Workspace ID. If not provided, inferred from authenticated session (uses user's first workspace)
- `created_by` (optional): User ID of the uploader. If not provided, inferred from authenticated session (OAuth token or API key)

**files_list Parameters:**
- `workspace_id` (optional): Workspace ID for filtering. If not provided, inferred from authenticated session (uses user's first workspace)
- `limit` (optional): Maximum number of files to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**files_get Parameters:**
- `id` (required): The ID of the file to retrieve

**files_search Parameters:**
- `fact_id` (required): The fact ID to search for in files. Returns all files that contain this fact ID in their fact_ids array

**files_update Parameters:**
- `id` (required): The ID of the file to update
- `metadata` (optional): Updated metadata (key-value pairs)
- `fact_ids` (optional): Updated array of fact IDs extracted from this file

**files_delete Parameters:**
- `id` (required): The ID of the file to delete

**fact_relations_create Parameters:**
- `from_fact` (required): Source fact ID
- `to_fact` (required): Target fact ID
- `type` (required): Relation type (e.g., 'references', 'depends_on', 'related_to', 'part_of')
- `workspace_id` (optional): Workspace ID. If not provided, inferred from authenticated session (uses user's first workspace)
- `metadata` (optional): Additional relation metadata
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)

**fact_relations_update Parameters:**
- `id` (required): The ID of the relation to update
- `type` (optional): Updated relation type
- `metadata` (optional): Updated metadata (key-value pairs)

**fact_relations_delete Parameters:**
- `id` (required): The ID of the relation to delete

**fact_relations_search Parameters:**
- `workspace_id` (optional): Workspace ID for filtering. If not provided, inferred from authenticated session (uses user's first workspace)
- `from_fact` (optional): Filter by source fact ID
- `to_fact` (optional): Filter by target fact ID
- `type` (optional): Filter by relation type
- `limit` (optional): Maximum number of relations to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**fact_relations_get Parameters:**
- `id` (required): The ID of the relation to retrieve

**fact_relations_get_related Parameters:**
- `fact_id` (required): The fact ID to get related facts for
- `relation_type` (optional): Optional filter by relation type

**fact_relations_get_incoming Parameters:**
- `fact_id` (required): The fact ID to get incoming relations for
- `relation_type` (optional): Optional filter by relation type

🔌 API Endpoints

**MCP Server Endpoints:**
| Endpoint | Description |
|----------|-------------|
| `POST /mcp` | MCP protocol endpoint (StreamableHTTPServerTransport) |
| `GET /health` | Health check endpoint |
| `GET /docs` | Swagger UI documentation |
| `GET /skill.md` | Rendered agent instructions (served by webapp only) |
| `GET /` | Landing page with features overview and authentication options |
| `GET /use-cases` | Use cases page showcasing three main use cases for KnowledgePlane |
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
| `GET /editor` | Knowledge base editor page (protected, requires session) |
| `GET /chat` | AI chat interface with MCP server connection (protected, requires session) |
| `GET /upload` | File upload page with AI-powered fact extraction (protected, requires session) |
| `GET /facts` | Browse facts page (protected, requires session) |
| `GET /profile` | User profile and management page (protected, requires session) |
| `GET /onboarding` | Onboarding page for new users (protected, requires session) - create first workspace and complete onboarding |
| `GET /workspaces` | Workspace management page (protected, requires session) - create workspaces, manage members, and invitations |
| `GET /data-sources` | Data sources management page (protected, requires session) - create, manage, and trigger automated data sources |
| `GET /invite/:token` | Public invitation acceptance page - view invitation details (public), accept workspace invitations via personal links (requires authentication) |

**REST API Endpoints (Port 8081):**
| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check endpoint |
| `GET /api/facts` | List facts with pagination and filtering |
| `GET /api/facts/:id` | Get a specific fact |
| `POST /api/facts` | Create a new fact |
| `PUT /api/facts/:id` | Update a fact |
| `DELETE /api/facts/:id` | Trash a fact |
| `POST /api/facts/search` | Search facts |
| `GET /api/relations` | List relations with filtering |
| `POST /api/relations` | Create a new relation |
| `GET /api/facts/:id/relations` | Get relations for a fact |
| `POST /api/query` | Execute AQL query |
| `GET /api/knowledge-cards` | List knowledge cards |
| `GET /api/knowledge-cards/:id` | Get a knowledge card |
| `POST /api/knowledge-cards` | Create a knowledge card |
| `PUT /api/knowledge-cards/:id` | Update a knowledge card |
| `POST /api/knowledge-cards/search` | Search knowledge cards |
| `POST /api/knowledge-cards/split` | Split a knowledge card |
| `POST /api/knowledge-cards/combine` | Combine knowledge cards |
| `DELETE /api/knowledge-cards/:id` | Delete a knowledge card |

**Deployment Note (DigitalOcean App Platform):**
If you route the REST API via a path prefix (e.g., `/rest`), App Platform strips
the prefix by default. Use a dedicated subdomain for the REST API or configure
routing so the `/rest` prefix is preserved.

**Skill Rendering Note:**
`/skill.md` is served by the webapp only and renders subpaths endpoints.
The webapp Docker image includes `packages/api-core/skill-template.md` so the
rendered output always uses the shared template, with the REST API mounted at
`/rest` and endpoints under `/api`.
| `GET /api/knowledge-cards` | List knowledge cards |
| `GET /api/knowledge-cards/:id` | Get a specific knowledge card |
| `DELETE /api/knowledge-cards/:id` | Delete a knowledge card |
| `GET /api/webhooks` | List webhooks |
| `POST /api/webhooks` | Create a new webhook |
| `PUT /api/webhooks/:id` | Update a webhook |
| `DELETE /api/webhooks/:id` | Delete a webhook |

**Workspace Management:**

KnowledgePlane supports workspace-based collaboration:

- **Workspaces**: Users can create multiple workspaces, each with its own isolated knowledge base
- **Workspace Members**: Users can be members of multiple workspaces with different roles:
  - **Owner**: Full control, can delete workspace, manage all members
  - **Admin**: Can manage members and workspace settings (except deletion)
  - **Member**: Can create and manage content within the workspace
- **Default Workspace**: New users automatically get a default workspace created on first login
- **Workspace Scoping**: All domain data (facts, knowledge cards, files, relations, etc.) is scoped to workspaces
- **Personal Invitation Links**: Workspace owners/admins can generate shareable invitation links (tokens) that can be copied and sent to friends. Invitations can be deleted by owners/admins. Invitation links are publicly accessible (no authentication required to view invitation details), but require authentication to accept. Invitation links can be accepted multiple times, allowing many users to register and join the workspace through the same link. All acceptances are tracked in the `acceptances` array.
- **Onboarding**: New users are redirected to onboarding flow on first login

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
   - Also supports API key via query parameter (`?api_key=...`) for internal use when headers cannot be set (e.g., OpenAI MCP connector)
   - Supports three key scopes:
     - **Workspace REST API keys** (per-workspace keys generated in the web profile)
     - **User API keys** (personal keys used for MCP access)
     - **Legacy keys** from `API_KEYS` environment variable (comma-separated list)
   - Workspace REST API keys automatically set the workspace context for REST API calls
   - No OAuth flow required - direct authentication
   - Suitable for automated scripts, CI/CD pipelines, and server-to-server communication
   - User ID is inferred from the API key context (workspace key creator or user key owner)

**MCP Session Management:**
- Sessions are identified by `mcp-session-id` header
- User context is automatically inferred from authenticated session (OAuth token or API key)
- Workspace context is automatically inferred from authenticated user's first workspace, or can be provided via query params: `?workspace_id=workspaces/123`
- User context can also be provided via query params: `?username=user&email=user@example.com` (fallback if not authenticated)
- Authentication via `Authorization: Bearer <token>` header (OAuth), `knowledgeplane-key` header (API key), or `api_key` query parameter (for internal use)
- Each StreamableHTTP transport gets its own MCP server instance to prevent cross-session transport conflicts
- **Workspace ID Auto-Inference**: All MCP tool handlers automatically infer `workspace_id` from the authenticated user's session context. Tools do NOT accept `workspace_id` as a parameter - it is automatically set from the user's workspace context. If a user is authenticated, their `workspace_id` is automatically inferred from their first workspace or from the `workspace_id` query parameter.
- **Workspace ID Not Accepted in Args**: `workspace_id` is NOT accepted in tool handler arguments. Any `workspace_id` provided in tool arguments will be automatically removed and replaced with the workspace ID from the authenticated session context. This ensures that authenticated users always operate within their authorized workspace context, preventing incorrect workspace_id values (e.g., workspace names instead of IDs) from being used.
- For `facts_write` and other creation operations, `created_by`, `last_updated_by`, and `workspace_id` are automatically set from the authenticated session if not explicitly provided
- All MCP operations are scoped to the workspace context (either from query param or user's first workspace)
- **Personal MCP URL**: Users can generate and copy their personal MCP server URL with their API key included via the profile page. This URL includes the API key as a query parameter and can be used to connect AI agents and tools.
- **REST API URL**: Users can generate and copy a workspace-scoped REST API URL with the workspace REST API key included for quick REST calls.
- **Workspace-Aware Chat**: The chat interface is workspace-aware and automatically passes the current workspace's `workspace_id` to the MCP server URL. When users switch workspaces, the chat automatically uses the correct workspace context for MCP operations.
- **Server Restart Handling**: When the server restarts, in-memory session state is lost. Clients reconnecting with an existing `mcp-session-id` will have a new transport created. The MCP protocol requires clients to send an `initialize` request before any other requests. If a client sends a non-initialize request after a server restart, it will receive a 400 error and should reinitialize the session.

🗄️ Data Model

**User Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `username` (string): Unique username
- `email` (string): User email
- `api_key` (string): Optional API key stored in user profile (for API key-based authentication)
- `onboarding_completed` (boolean): Whether the user has completed onboarding (default: false)
- `created_at` (string): Creation timestamp (ISO 8601)

**Workspace Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `name` (string): Workspace name
- `slug` (string): URL-friendly workspace identifier (unique)
- `description` (string): Optional workspace description
- `created_by` (string): Reference to user ID who created the workspace
- `rest_api_key` (string, optional): Workspace REST API key
- `rest_api_key_created_by` (string, optional): User ID who generated the REST API key
- `rest_api_key_created_at` (string, optional): REST API key creation timestamp (ISO 8601)
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**WorkspaceMember Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `workspace_id` (string): Reference to workspace ID
- `user_id` (string): Reference to user ID
- `role` (string): Workspace member role - "owner", "admin", or "member"
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**Fact Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `content` (string): Fact content
- `metadata` (object): Key-value metadata
- `workspace_id` (string): Reference to workspace ID
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)
- `created_by` (string): Reference to user ID
- `last_updated_by` (string): Reference to user ID
- `deleted_by` (string, optional): Reference to user ID who deleted the fact
- `deleted_at` (string, optional): Deletion timestamp (ISO 8601)
- `trashed` (boolean): Whether the fact has been trashed (default: false)

**FactRelation Collection (Edges):**
- `_id` (ArangoDB edge ID): Primary key
- `_key` (string): Document key
- `_from` (string): Source fact document ID
- `_to` (string): Target fact document ID
- `from_fact` (string): Source fact ID (normalized)
- `to_fact` (string): Target fact ID (normalized)
- `type` (string): Relation type (e.g., "references", "depends_on", "related_to", "part_of")
- `workspace_id` (string): Reference to workspace ID
- `metadata` (object): Additional relation metadata
- `created_by` (string): Reference to user ID
- `created_at` (string): Creation timestamp (ISO 8601)
- `last_updated_by` (string): Reference to user ID
- `updated_at` (string): Last update timestamp (ISO 8601)
- `deleted_by` (string, optional): Reference to user ID who deleted the relation
- `deleted_at` (string, optional): Deletion timestamp (ISO 8601)

Note: FactRelations are stored as edges in the ArangoDB graph, where Facts are nodes.

**KnowledgeCard Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `title` (string): Knowledge card title
- `summary` (string): Brief summary
- `content` (string): Full consolidated content
- `fact_ids` (array): Array of fact IDs that were consolidated
- `workspace_id` (string): Reference to workspace ID
- `created_by` (string): Reference to user ID
- `last_updated_by` (string): Reference to user ID
- `created_by_worker` (string, optional): Worker name if created by a worker
- `last_updated_by_worker` (string, optional): Worker name if updated by a worker
- `deleted_by` (string, optional): Reference to user ID who deleted the card
- `deleted_by_worker` (string, optional): Worker name if deleted by a worker
- `deleted_at` (string, optional): Deletion timestamp (ISO 8601)
- `metadata` (object): Key-value metadata
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**Webhook Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `url` (string): Webhook URL
- `events` (array): Array of event names to subscribe to (e.g., ["fact.created", "card.updated"])
- `workspace_id` (string): Reference to workspace ID
- `secret` (string): Optional secret for webhook signature
- `active` (boolean): Whether the webhook is active
- `created_by` (string): Reference to user ID
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**File Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `filename` (string): Stored filename
- `original_filename` (string): Original filename from upload
- `mime_type` (string): MIME type of the file
- `size` (number): File size in bytes
- `storage_path` (string): Path where file is stored on disk
- `workspace_id` (string): Reference to workspace ID
- `uploaded_by` (string): Reference to user ID
- `created_by` (string): Reference to user ID
- `last_updated_by` (string): Reference to user ID
- `deleted_by` (string, optional): Reference to user ID who deleted the file
- `deleted_at` (string, optional): Deletion timestamp (ISO 8601)
- `metadata` (object): Additional metadata
  - For data source definition files: `content` (text for .md/.txt files) or `zip_content` (base64 for .zip files)
  - For zip files: `is_zip` (boolean), `files` (array of extracted files with filename and content)
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)
- `fact_ids` (array): Array of fact IDs extracted from this file

**DataSource Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `name` (string): Data source name
- `workspace_id` (string): Reference to workspace ID
- `description` (string, optional): Data source description
- `schedule` (string): Schedule expression (e.g., "every 6 hours", "0 */6 * * *" for cron)
- `definition_file_id` (string): Reference to File record containing the definition (.md, .txt, or .zip)
- `enabled` (boolean): Whether the data source is enabled and should run automatically
- `created_by` (string): Reference to user ID who created the data source
- `last_run_at` (string, optional): Timestamp of last execution (ISO 8601)
- `next_run_at` (string, optional): Timestamp of next scheduled execution (ISO 8601)
- `metadata` (object): Additional metadata for the data source
- `secrets` (object): Key-value pairs for storing secrets (e.g., API keys, tokens, passwords) securely per data source
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**Invitation Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `workspace_id` (string): Reference to workspace ID
- `invited_by` (string): Reference to user ID who sent the invitation
- `token` (string): Unique invitation token (personal invitation link)
- `status` (string): Invitation status - "pending", "accepted", or "expired". Invitations remain "pending" even after acceptances, allowing multiple users to accept the same link.
- `expires_at` (string): Expiration timestamp (ISO 8601)
- `acceptances` (array): Array of acceptance records, each containing:
  - `user_id` (string): Reference to user ID who accepted the invitation
  - `accepted_at` (string): ISO 8601 timestamp when the invitation was accepted by this user
- `created_at` (string): Creation timestamp (ISO 8601)

**ChatThread Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `user_id` (string): Reference to user ID
- `workspace_id` (string): Reference to workspace ID
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**ChatMessage Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `thread_id` (string): Reference to chat thread ID
- `role` (string): Message role - "system", "user", or "assistant"
- `content` (string): Message content
- `tool_calls` (array, optional): Array of tool call objects when assistant requests tool execution
- `tool_call_id` (string, optional): Tool call ID for tool response messages
- `tool_response` (string, optional): Tool response content for tool response messages
- `sequence` (number): Sequence number for ordering messages within the thread
- `created_at` (string): Creation timestamp (ISO 8601)

**WorkerTrigger Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `worker_name` (string): Name of the worker to trigger ("card-consolidator" or "embeddings-generator")
- `triggered_at` (string): Timestamp when the trigger was requested (ISO 8601)
- `status` (string): Trigger status - "pending", "processing", or "completed"
- `created_at` (string): Creation timestamp (ISO 8601)

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
7. A session cookie is created and user is redirected:
   - If a redirect parameter was provided (e.g., from an invite link), user is redirected to that path
   - Otherwise, if onboarding is not completed, user is redirected to `/onboarding`
   - Otherwise, user is redirected to `/dashboard`
8. Dashboard provides instructions for using MCP URL with agents

**Redirect Parameter Handling:**
- The home page (`/`) accepts an optional `redirect` query parameter (e.g., `/?redirect=/invite/token123`)
- The home page awaits `searchParams` to satisfy Next.js async dynamic API requirements
- When present, this parameter is passed to OAuth routes (`/api/auth/google?redirect=...` or `/api/auth/github?redirect=...`)
- OAuth routes store the redirect parameter in a secure cookie during the OAuth flow
- After successful authentication, the callback handler retrieves the redirect parameter and redirects the user accordingly
- This ensures users are returned to their intended destination (e.g., invite acceptance page) after first-time sign-up

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

**Docker Deployment Notes:**
When deploying in Docker containers behind reverse proxies (e.g., DigitalOcean App Platform), the webapp handles base URL detection:
- `APP_URL` is used if set (automatically provided by DigitalOcean App Platform as `${APP_URL}`)
- OAuth redirects fall back to `X-Forwarded-Host` and `X-Forwarded-Proto` headers when `APP_URL` is not set
- The `GET /skill.md` endpoint uses `APP_URL` (defaulting to `http://localhost:3000`) and does not derive from request headers
- This prevents OAuth redirects from using `0.0.0.0` or internal Docker hostnames
- **Recommended**: Use `APP_URL` when available (e.g., DigitalOcean App Platform), or ensure proper reverse proxy headers are set

The web interface is built with React and Tailwind CSS, featuring:
- A modern, polished landing page (`/`) with enhanced visual design inspired by top SaaS products
- Clean, minimal design with animated gradient backgrounds, subtle grid patterns, and glassmorphism effects
- Smooth animations and micro-interactions for improved user experience
- Interactive code example section demonstrating API usage
- Enhanced typography and visual hierarchy
- Responsive design optimized for all screen sizes
- Responsive login pages for OAuth authentication
- Use cases page (`/use-cases`) showcasing three main use cases:
  - Workspace Knowledge Base: Centralize workspace knowledge for AI assistants
  - AI Agent Memory: Persistent memory across conversations
  - Document Intelligence: Automatic knowledge extraction from documents
  - Each use case includes benefits, descriptions, and branded visual design
- User dashboard (`/dashboard`) with:
  - User profile information display
  - Statistics overview (total facts, knowledge cards, active facts, categories)
  - Facts list with pagination and metadata display
  - Knowledge cards list with pagination, showing title, summary, fact count, and last updated date
  - Facts and cards click through to the editor with the related item selected
  - Logout functionality
  - Automatic redirect to landing page for unauthenticated users
- User profile page (`/profile`) with:
  - Profile information display (username, email, account creation date)
  - Profile editing (update username and email)
  - API key management (view, generate, regenerate, and remove API keys)
  - Secure API key display with show/hide functionality
  - Copy-to-clipboard functionality for API keys
  - Personal MCP server URL display with API key included
  - Copy-to-clipboard functionality for MCP server URL
- Knowledge base editor page (`/editor`) with:
  - Tabbed interface for switching between Facts, Cards, Files, and Knowledge Graph views
  - Facts view with list display, fact creation, and fact relation management
  - Cards view with knowledge cards list display and detailed card information sidebar
  - Files view with uploaded files list display and detailed file information sidebar
  - Card details sidebar showing title, summary, full content, fact count, timestamps, and metadata
  - File details sidebar showing filename, MIME type, size, storage path, fact count, extracted facts list (clickable to navigate to facts), timestamps, and metadata
  - Extracted facts lists omit missing facts and strip embedding fields
  - Fact details sidebar showing content, timestamps, and metadata
  - Fact and card lists surface metadata counts when available
  - Card deletion functionality with confirmation dialog
  - Fact details sidebar with relations management (create and view outgoing/incoming relations)
  - Fact deletion functionality with confirmation dialog (marks facts as trashed)
  - Search functionality for facts with server-side semantic search
  - Real-time client-side filtering that filters visible facts, cards, and files as you type, searching through content, title, summary, and filename fields
- Facts browsing page (`/facts`) with pagination, filtering, and detailed fact display
- Workspace management page (`/workspaces`) with:
  - Workspace listing and creation
  - Workspace settings (name, description)
  - Workspace member management (add, update roles, remove members)
  - Invitation management (create invitation links, view, copy links, track status, delete invitations)
  - Role-based access control (owner/admin/member permissions)
  - Tabbed interface for workspace settings, members, and invitations
  - Toast notifications for user feedback (copy link, delete invitation)
  - Expiration days input with label and help text showing default value (7 days)
- Data sources management page (`/data-sources`) with:
  - Data source listing with status indicators (enabled/disabled)
  - Create data source form with file upload (.md, .txt, or .zip)
  - Schedule configuration (interval-based or cron expressions)
  - Schedule updates recalculate the next run timestamp immediately
  - Enable/disable toggle for each data source
  - Secrets management during creation:
    - Add secret key-value pairs when creating a new data source
    - Secure password-style input fields for secret values
    - View and remove secrets before submitting the form
  - Manual trigger button ("Run Now") for immediate execution
  - View and edit data source details (name, description, schedule, enabled status)
  - View definition file information
  - Last run and next run timestamps display
  - Secrets management per data source (after creation):
    - View all secrets (with show/hide toggle for values)
    - Add new secret key-value pairs
    - Update existing secrets
    - Delete secrets
    - Secure password-style input fields for secret values
  - Pagination support for large lists
  - Toast notifications for user feedback
- Onboarding page (`/onboarding`) for new users:
  - First-time user flow to create initial workspace
  - Onboarding completion tracking
- Invitation acceptance page (`/invite/:token`) for public invitation links:
  - Public access - unauthenticated users can view invitation details
  - Welcome page for unauthenticated users with workspace information and sign-in prompt
  - Accept workspace invitations via personal links (requires authentication)
  - Shows workspace and inviter information
  - Handles expired and invalid invitations
  - Clear call-to-action directing users to sign in to continue
  - Redirect parameter preservation: When users click "Sign In to Continue" from an invite page, the redirect parameter (`/invite/:token`) is preserved through the OAuth flow. After successful authentication (including first-time sign-up), users are automatically redirected back to the invite page to complete the invitation acceptance

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

For complete environment variable documentation and setup instructions, see:
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Local development setup with ngrok
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Production deployment configuration
- `.env.example` files in each app directory
- `.env.benchmark` at the repository root - local benchmark runner variables (`KP_API_URL`, `ARANGO_URL`, `KP_WORKSPACE_ID`, `KP_USER_ID`, `KP_API_KEY`, `OPENAI_API_KEY`)
- `tests/benchmarks/scripts/setup-benchmark-env.sh` - auto-creates a benchmark workspace from the first local DB user, prompts for `OPENAI_API_KEY`, and writes both `.env.benchmark` and `.env`
- **Running benchmarks from repo root**: `npm run bench:quick` (suite with `--quick` sample sizes) and `npm run bench:all` (default sample sizes). These run `scripts/bench-with-stack.sh`, which starts Docker project `kp-bench` (ArangoDB + reranker profile when missing), then the REST API and background workers with `.env` + `.env.benchmark`, then `tests/benchmarks/bench all [--quick]`. On exit, the script stops the Node processes and tears down `kp-bench` if it started any of its containers.
- **Reranker (bench stack)**: By default the script starts the reranker container and waits up to ~30 minutes for `/health`. If it never becomes healthy, the script prints the last container logs and **continues without reranker** (workers already fall back to embedding-only when the reranker HTTP call fails). Set **`BENCH_STRICT_RERANKER=1`** to **exit with failure** instead of continuing. Set **`BENCH_SKIP_RERANKER=1`** (or `npm run bench:quick:norerank`) to **never** start or wait for the reranker.
- **Freshness FAISS baseline (./bench)**: `./bench freshness` / `./bench all` used to pass `--corpus_size 1000` always, which embeds 1000 background documents on CPU and can take tens of minutes (appearing hung). The bench CLI now **picks a smaller default corpus when `-n` is small** (e.g. `--quick` uses `n=10` → corpus `48`). Override with **`BENCH_FRESHNESS_CORPUS_SIZE`**, or set **`BENCH_SKIP_FAISS_BASELINE=1`** to run KP-only freshness (no FAISS comparison).
- Benchmark Docker runner (`tests/benchmarks/docker-compose.yml`) loads **both** repository root `.env` and `.env.benchmark` so Python benchmarks receive `KP_API_KEY` and workspace IDs (without this, the REST API returns 401 and freshness polling can appear to “hang”). The benchmark service mounts **`tests/benchmarks/.cache` → `/root/.cache`** and sets `HF_HOME` / `HF_HUB_CACHE` / `HF_DATASETS_CACHE` under that tree so **Hugging Face datasets, Hub models, and sentence-transformers weights** (e.g. FAISS baseline MiniLM) persist across `docker compose run` invocations. Previously only a narrower Hugging Face path was mounted, so **PyTorch/sentence-transformers often re-downloaded** into ephemeral `/root/.cache/torch` every run. **`./bench` still runs `docker compose build` each time**; when the image is already built that step is usually quick (layer cache) and does not re-download pip wheels unless the Dockerfile or context changed.
- Typecheck compatibility: `packages/aimodel/src/providers/openai.ts` now guards OpenAI tool-call unions (`tc.type === "function"`) and supports both `files.delete` and `files.del` SDK variants; `packages/db/src/db.ts` uses stream-like guards instead of direct `ReadableStream` references to avoid workspace TS lib mismatches in CI.

**MCP Server (`apps/mcp-server/.env.dev`):**
- `ARANGO_URL` - ArangoDB connection URL (default: `http://localhost:8529`)
- `ARANGO_DB_NAME` - ArangoDB database name (default: `knowledgeplane`)
- `ARANGO_USER` - ArangoDB username (default: `root`)
- `ARANGO_PASSWORD` - ArangoDB password (default: empty)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `SESSION_SECRET` - Secret key for session encryption. Can be provided as:
  - Hex string (64 hex characters = 32 bytes, e.g., `openssl rand -hex 32`)
  - Base64 string (44+ base64 characters, e.g., `openssl rand -base64 32`)
  - Plain string (will be hashed with SHA-256 to produce 32 bytes)
  - If not provided, a random 32-byte key is generated (sessions won't persist across restarts)
- `API_KEYS` - Comma-separated list of valid API keys for API key authentication (optional)
- `APP_URL` - Top-level URL for the application. Used for OAuth callbacks, API endpoints, etc. Automatically provided by DigitalOcean App Platform as `${APP_URL}`. Defaults to `http://localhost:8080` in development if not set.
- `OAUTH_SUCCESS_REDIRECT_URL` - URL to redirect after successful auth (default: `http://localhost:3000`)
- `OAUTH_PROVIDER` - Force a specific provider: `google` or `github` (optional)
- `JWKS_URI` - JWKS endpoint for custom OAuth providers (optional)
- `JWT_SECRET` - Secret for JWT verification (development only)
- `PORT` - Server port (default: `8080`)
- `AI_PROVIDER` - AI provider to use: `openai` or `anthropic` (default: `openai`)
- `OPENAI_API_KEY` - OpenAI API key (required if using OpenAI provider)
- `OPENAI_MODEL` - OpenAI model to use (default: `gpt-4o`)
- `ANTHROPIC_API_KEY` - Anthropic API key (required if using Anthropic provider)
- `ANTHROPIC_MODEL` - Anthropic model to use (default: `claude-3-5-sonnet-20241022`)
- `UPLOADS_DIR` - Directory for storing uploaded files (default: `./uploads`)

**Background Worker (`apps/background-workers/.env.dev`):**
- `ARANGO_URL` - ArangoDB connection URL
- `ARANGO_DB_NAME` - ArangoDB database name
- `ARANGO_USER` - ArangoDB username
- `ARANGO_PASSWORD` - ArangoDB password
- `AI_PROVIDER` - AI provider to use: `openai` or `anthropic` (default: `openai`)
- `OPENAI_API_KEY` - OpenAI API key (required if using OpenAI provider)
- `OPENAI_MODEL` - OpenAI model to use (default: `gpt-4o`)
- `OPENAI_EMBEDDING_MODEL` - OpenAI embedding model (default: `text-embedding-3-small`)
- `ANTHROPIC_API_KEY` - Anthropic API key (required if using Anthropic provider)
- `ANTHROPIC_MODEL` - Anthropic model to use (default: `claude-3-5-sonnet-20241022`)

**Webapp (`apps/webapp/.env.local`):**
- `ARANGO_URL` - ArangoDB connection URL
- `ARANGO_DB_NAME` - ArangoDB database name
- `ARANGO_USER` - ArangoDB username
- `ARANGO_PASSWORD` - ArangoDB password
- `APP_URL` - Top-level URL for the application. Used for OAuth redirects, API endpoints, etc. Automatically provided by DigitalOcean App Platform as `${APP_URL}`. If not set, extracts from `X-Forwarded-Host` and `X-Forwarded-Proto` headers in reverse proxy environments, or defaults to `http://localhost:3000` in development.
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `MCP_SERVER_URL` - Full URL to MCP server (e.g., `http://localhost:8080/mcp` or `https://your-ngrok-url.ngrok.io/mcp`)
- `MCP_SERVER_HOST` - MCP server hostname (default: `localhost`, use ngrok domain for localhost development)
- `MCP_SERVER_PORT` - MCP server port (default: `8080`)
- `MCP_SERVER_PROTOCOL` - MCP server protocol (default: `http`, use `https` with ngrok)
- `MCP_SERVER_API_KEY` - API key for internal MCP server authentication (automatically added to URL as query parameter)
- `AI_PROVIDER` - AI provider to use: `openai` or `anthropic` (default: `openai`)
- `OPENAI_API_KEY` - OpenAI API key (required if using OpenAI provider)
- `OPENAI_MODEL` - OpenAI model to use (default: `gpt-4o`)
- `ANTHROPIC_API_KEY` - Anthropic API key (required if using Anthropic provider)

**REST API (`apps/rest-api/.env.dev`):**
- `ARANGO_URL` - ArangoDB connection URL
- `ARANGO_DB_NAME` - ArangoDB database name
- `ARANGO_USER` - ArangoDB username
- `ARANGO_PASSWORD` - ArangoDB password
- `PORT` - Server port (default: `8081`)
- Docker runs compiled output from `dist/apps/rest-api/src/index.js`

**Localhost Development with ngrok:**
For localhost development, you'll need to set up ngrok to expose port 8080 for OAuth callbacks. See [DEVELOPMENT.md](../DEVELOPMENT.md) for detailed instructions.

**Repository ngrok Config:**
- Template config: `ngrok.config.example`
- Local config (gitignored): `ngrok.config.yml`
- Reserved domain for MCP server: `your-subdomain.ngrok-free.app`

```bash
cp ngrok.config.example ngrok.config.yml
# set your ngrok authtoken in ngrok.config.yml
ngrok start --config ./ngrok.config.yml mcp-server
```

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
- **React** + **Next.js** frontend with **TypeScript**
- **tRPC** for type-safe API communication between frontend and backend
- **ArangoDB** graph database with full-text search and AQL query support
  - Vector index feature enabled via `--experimental-vector-index` flag in docker-compose configuration
- **MCP SDK** (`@modelcontextprotocol/sdk`) for protocol implementation
- **Docker Compose** infrastructure
- **OAuth2** authentication (`@fastify/oauth2`) - Google and GitHub support
- **Session management** (`@fastify/secure-session`, `@fastify/cookie`) for OAuth state management and web user sessions
- **JWT/JWKS** token validation for MCP sessions
- **OpenAI API** for card consolidation and category organization
- **Swagger/OpenAPI** documentation
- **Tailwind CSS** for styling

**Package Architecture:**
- `@knowledgeplane/db` - Shared database package with ArangoDB models and connection logic
  - Main export (`@knowledgeplane/db`) - For general Node.js servers (mcp-server, rest-api, background-workers)
  - Next.js export (`@knowledgeplane/db/next`) - For Next.js apps with `server-only` protection
  - Must use Node.js fetch (not browser fetch) for ArangoDB compatibility
  - Configured in Next.js via `serverExternalPackages` (Next.js 15+) to prevent client bundling
  - ArangoDB requires `Content-Length` header and does not support `Transfer-Encoding: chunked`
  - The db package patches `globalThis.fetch` to use `undici.fetch` in server environments to ensure
    Content-Length headers are sent instead of chunked encoding, which is required for ArangoDB compatibility
  - This fix is necessary because Next.js route handlers may use a fetch implementation that uses
    chunked encoding, which ArangoDB rejects with a 501 Not Implemented error

🚀 Quick Start

**Monorepo Structure:**
This project uses npm workspaces with multiple packages:
- `apps/mcp-server` - Backend MCP server (Fastify + TypeScript)
- `apps/webapp` - Frontend web application (Next.js + React + TypeScript)
- `apps/background-workers` - Background workers for card consolidation, embeddings generation, and data source execution
- `apps/rest-api` - REST API server (optional, `src/server.ts` exports testable server)
- `packages/db` - Shared database package
- `packages/file-processor` - File processing utilities
- `packages/aimodel` - AI model client abstraction
- `packages/api-core` - Shared REST/MCP logic (search + card ops)

**Installation:**
```bash
# Bootstrap all dependencies
npm run bootstrap

# Set up environment variables
./scripts/setup-env.sh  # Creates .env files from examples
# Edit .env files with your actual values
```

**Development Mode:**
```bash
# Start infrastructure, server, and web app
npm run dev

# Reset ArangoDB collections/graphs, then start the full dev stack (fails fast if reset errors)
npm run dev:clean

# This will:
# - Start ArangoDB in Docker (port 8529)
# - Wait for database to be ready
# - Start MCP server in watch mode (port 8080)
# - Start webapp in dev mode (port 3000)
# - Start background workers

# In a separate terminal, start ngrok for OAuth callbacks:
./scripts/start-ngrok.sh 8080
```

**For detailed development setup including ngrok configuration and OAuth setup, see [DEVELOPMENT.md](../DEVELOPMENT.md)**

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

# Reset database collections/graphs
# - If ArangoDB is not running on localhost, this command starts local db automatically
# - If this command started db, it also stops it automatically after reset
# - If ArangoDB is already running, it reuses it and leaves it running
npm run db:reset

# Stop development servers
npm run dev:stop
```

**Production Mode:**
```bash
docker compose -f infra/docker-compose.yml up --build
```

**For cloud deployment instructions (DigitalOcean App Platform, Railway, Render, Docker Compose, etc.), see [DEPLOYMENT.md](../DEPLOYMENT.md)**

The MCP server will start on `http://localhost:8080` and webapp on `http://localhost:3000`

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
      "name":"facts_write",
      "arguments":{
        "content":"Project Apollo uses port 9090"
      }
    }
  }'
```

**Example: Bulk write facts (with authentication)**
```bash
# User ID is automatically inferred from authenticated session (OAuth token or API key)
# created_by and last_updated_by are automatically populated for all facts
curl -X POST "http://localhost:8080/mcp" \
  -H "Authorization: Bearer <oauth-token>" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"facts_bulkwrite",
      "arguments":{
        "facts":[
          {
            "content":"Project Apollo uses port 9090",
            "metadata":{"source":"deployment"}
          },
          {
            "content":"Project Beta uses Redis for caching",
            "metadata":{"source":"architecture"}
          },
          {
            "content":"Project Gamma uses PostgreSQL for persistence"
          }
        ]
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
      "name":"facts_write",
      "arguments":{
        "content":"Project Apollo uses port 9090"
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
      "name":"facts_write",
      "arguments":{
        "content":"Project Apollo uses port 9090"
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
      "name":"facts_write",
      "arguments":{
        "content":"Project Apollo uses port 9090",
        "created_by":"<user-uuid>",
        "last_updated_by":"<user-uuid>"
      }
    }
  }'
```

**Example: Search facts**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"facts_search",
      "arguments":{
        "query":"Apollo",
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
      "name":"facts_update",
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
      "name":"users_register",
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
      "name":"facts_trash",
      "arguments":{
        "id":"<fact-uuid>"
      }
    }
  }'
```

**Example: Search including trashed facts**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":7,
    "method":"tools/call",
    "params":{
      "name":"facts_search",
      "arguments":{
        "query":"*",
        "include_trashed":true
      }
    }
  }'
```

**Example: Upload a file and extract facts**
```bash
# First, read file and encode as base64
FILE_DATA=$(base64 -i document.txt)

curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":8,
    "method":"tools/call",
    "params":{
      "name":"files_upload",
      "arguments":{
        "filename":"document.txt",
        "mimeType":"text/plain",
        "data":"'$FILE_DATA'"
      }
    }
  }'
```

The response will include:
- File information (id, filename, size, mime_type)
- Number of facts created
- Number of relations created
- List of extracted facts with their IDs and content

**Example: Consolidate facts into a knowledge card**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":9,
    "method":"tools/call",
    "params":{
      "name":"facts_consolidate",
      "arguments":{
        "fact_ids":["facts/123", "facts/456", "facts/789"],
        "include_related":true
      }
    }
  }'
```

**Example: Create a knowledge card**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":10,
    "method":"tools/call",
    "params":{
      "name":"knowledge_cards_create",
      "arguments":{
        "title":"Project Architecture Overview",
        "summary":"Overview of the project architecture and key components",
        "content":"Detailed content about the project architecture...",
        "fact_ids":["facts/123", "facts/456"]
      }
    }
  }'
```

**Example: Search knowledge cards**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":11,
    "method":"tools/call",
    "params":{
      "name":"knowledge_cards_search",
      "arguments":{
        "query":"architecture",
        "k":10
      }
    }
  }'
```

**Example: List knowledge cards**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":12,
    "method":"tools/call",
    "params":{
      "name":"knowledge_cards_list",
      "arguments":{
        "limit":20,
        "offset":0
      }
    }
  }'
```

**Example: Update a knowledge card**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":13,
    "method":"tools/call",
    "params":{
      "name":"knowledge_cards_update",
      "arguments":{
        "id":"knowledge_cards/123",
        "title":"Updated Project Architecture Overview",
        "summary":"Updated summary"
      }
    }
  }'
```

**Example: Split a knowledge card**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":14,
    "method":"tools/call",
    "params":{
      "name":"knowledge_cards_split",
      "arguments":{
        "id":"knowledge_cards/123",
        "num_cards":3
      }
    }
  }'
```

**Example: Combine knowledge cards**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":15,
    "method":"tools/call",
    "params":{
      "name":"knowledge_cards_combine",
      "arguments":{
        "card_ids":["knowledge_cards/123", "knowledge_cards/456", "knowledge_cards/789"]
      }
    }
  }'
```

**Example: Delete a knowledge card**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":16,
    "method":"tools/call",
    "params":{
      "name":"knowledge_cards_delete",
      "arguments":{
        "id":"knowledge_cards/123"
      }
    }
  }'
```

**Example: List files**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":17,
    "method":"tools/call",
    "params":{
      "name":"files_list",
      "arguments":{
        "limit":20,
        "offset":0
      }
    }
  }'
```

**Example: Get a file**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":18,
    "method":"tools/call",
    "params":{
      "name":"files_get",
      "arguments":{
        "id":"files/123"
      }
    }
  }'
```

**Example: Search files by fact ID**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":19,
    "method":"tools/call",
    "params":{
      "name":"files_search",
      "arguments":{
        "fact_id":"facts/456"
      }
    }
  }'
```

**Example: Update a file**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":20,
    "method":"tools/call",
    "params":{
      "name":"files_update",
      "arguments":{
        "id":"files/123",
        "metadata":{"source":"manual-update"},
        "fact_ids":["facts/456", "facts/789"]
      }
    }
  }'
```

**Example: Delete a file**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":21,
    "method":"tools/call",
    "params":{
      "name":"files_delete",
      "arguments":{
        "id":"files/123"
      }
    }
  }'
```

**Example: Create a fact relation**
```bash
curl -X POST "http://localhost:8080/mcp?username=alice&email=alice@example.com" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":22,
    "method":"tools/call",
    "params":{
      "name":"fact_relations_create",
      "arguments":{
        "from_fact":"facts/123",
        "to_fact":"facts/456",
        "type":"references",
        "metadata":{"strength":"strong"}
      }
    }
  }'
```

**Example: Update a fact relation**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":23,
    "method":"tools/call",
    "params":{
      "name":"fact_relations_update",
      "arguments":{
        "id":"fact_relations/789",
        "type":"depends_on",
        "metadata":{"strength":"weak"}
      }
    }
  }'
```

**Example: Delete a fact relation**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":24,
    "method":"tools/call",
    "params":{
      "name":"fact_relations_delete",
      "arguments":{
        "id":"fact_relations/789"
      }
    }
  }'
```

**Example: Search fact relations**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":25,
    "method":"tools/call",
    "params":{
      "name":"fact_relations_search",
      "arguments":{
        "from_fact":"facts/123",
        "type":"references",
        "limit":10
      }
    }
  }'
```

**Example: Get a fact relation**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":26,
    "method":"tools/call",
    "params":{
      "name":"fact_relations_get",
      "arguments":{
        "id":"fact_relations/789"
      }
    }
  }'
```

**Example: Get related facts**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":27,
    "method":"tools/call",
    "params":{
      "name":"fact_relations_get_related",
      "arguments":{
        "fact_id":"facts/123",
        "relation_type":"references"
      }
    }
  }'
```

**Example: Get incoming relations**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: test-session-123" \
  -d '{
    "jsonrpc":"2.0",
    "id":28,
    "method":"tools/call",
    "params":{
      "name":"fact_relations_get_incoming",
      "arguments":{
        "fact_id":"facts/456",
        "relation_type":"depends_on"
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

🔗 Relations and Graph Queries

KnowledgePlane supports typed relationships between facts, enabling graph-based knowledge modeling.

**Relation Types:**
- `references` - One fact references another
- `depends_on` - One fact depends on another
- `related_to` - General relationship between facts
- `part_of` - One fact is part of another
- Custom types can be defined as needed

**Creating Relations:**
```bash
curl -X POST http://localhost:8081/api/relations \
  -H "Content-Type: application/json" \
  -d '{
    "from_fact": "facts/123",
    "to_fact": "facts/456",
    "type": "references",
    "metadata": {"strength": "strong"},
    "created_by": "users/789"
  }'
```

**Querying Relations:**
```bash
# Get all relations for a fact
curl http://localhost:8081/api/facts/facts/123/relations

# Get relations by type
curl "http://localhost:8081/api/relations?type=references"
```

**AQL Queries:**

KnowledgePlane supports ArangoDB Query Language (AQL) for advanced graph queries:

```bash
curl -X POST http://localhost:8081/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "FOR fact IN facts FILTER fact.trashed == false RETURN fact",
    "bindVars": {}
  }'
```

**Graph Traversal Example:**
```aql
FOR fact, relation, related IN 1..2 OUTBOUND 'facts/123' relations
  RETURN {fact: fact, relation: relation, related: related}
```

🤖 Background Workers

KnowledgePlane includes background workers that automatically maintain and organize the knowledge base:

**Card Consolidator:**
- Runs every 5 minutes
- Identifies unconsolidated facts
- Creates FactRelations between related facts using AI analysis (processes facts in batches of 20)
- Uses graph traversal to find related facts via the created FactRelations
- Leverages OpenAI GPT-4 to create consolidated summary cards
- Creates cards with title, summary, and comprehensive content
- Can be manually triggered via the worker logs page or tRPC API

**Embeddings Generator:**
- Runs every 10 minutes (periodic sweep as backup)
- Generates vector embeddings for facts, fact relations, and knowledge cards
- Uses OpenAI embeddings API (text-embedding-3-small by default, dimension 1536)
- Processes items in batches for efficiency
- Updates embeddings when model changes or embeddings are missing
- Stores embeddings directly in ArangoDB documents
- Embeddings and internal ArangoDB IDs (`_id`, `_key`) are internal-only fields and are stripped from MCP and REST/tRPC API responses (including AQL query results)
- All fact creation/update endpoints (webapp tRPC, MCP server, REST API) queue a `worker_triggers` entry for immediate embedding generation by the background worker (checked every 5 seconds)
- Can be manually triggered via the worker logs page or tRPC API

**Data Source Runner:**
- Checks for enabled data sources ready to run every minute
- Executes data source definitions (markdown files or zip archives containing instructions and code)
- Uses AI models (OpenAI GPT-4o by default) with code interpretation capabilities
- Configures MCP tools to allow the AI model to store facts into the Knowledge Plane
- Supports flexible scheduling:
  - Interval-based: "every X minutes/hours/days" (e.g., "every 6 hours")
  - Cron expressions: standard cron format (e.g., "0 */6 * * *")
- Extracts definition content from:
  - `.md` or `.txt` files: stored as text instructions
  - `.zip` files: extracts markdown files (instructions) and code files
- Updates `last_run_at` and calculates `next_run_at` based on schedule (with 10-second timeout to prevent hanging)
- When schedule is updated via the update endpoint, `next_run_at` is automatically recalculated based on the new schedule
- Logs execution lifecycle to `WorkerLog` collection with `data_source_id` linking logs to specific data sources
- Can be manually triggered via the data sources UI or tRPC API (works even when data source is disabled)
- **Code Execution Environment**:
  - Code is executed in a sandboxed VM context with limited APIs
  - `require()` and `import` statements are NOT available - all necessary APIs (fetch, Buffer, URL, JSON, Math, Date, etc.) are already available in the global scope
  - The VM context includes: secrets, facts API, console, fetch, setTimeout/setInterval, JSON, Math, Date, Promise, Buffer, URL, URLSearchParams, and other standard JavaScript APIs
  - Attempts to use `require()` will throw a helpful error message explaining that it's not available
- Each data source execution:
  1. Creates a log entry with status "running" when execution starts
  2. Updates the log entry with progress information throughout execution:
     - Stage: "initialization" - Execution started
     - Stage: "loading_definition_file" - Loading definition file
     - Stage: "extracting_content" - Extracting content from definition file
     - Stage: "preparing_ai_execution" - Preparing AI execution context
     - Stage: "ai_execution_started" - Starting AI execution
     - Stage: "processing_tool_calls" - Processing tool calls (with iteration number)
     - Stage: "executing_code" - Executing code in VM (with iteration number)
     - Stage: "code_execution_completed" - Code execution completed (with console output info)
     - Stage: "code_execution_error" - Code execution error (with error details)
     - Stage: "extracting_results" - Extracting execution results
     - Stage: "updating_schedule" - Updating data source schedule
     - Stage: "completed" - Execution completed successfully
     - Stage: "error" - Execution failed
  3. Loads definition file content
  4. Builds system prompt with instructions and available code files
  5. Calls AI model with MCP tools configured
  6. AI model executes code, gathers data, and stores facts via MCP tools
  7. Updates data source metadata with execution results
  8. Updates the log entry to "success" or "error" status when execution completes
- **Execution Logs**: 
  - All data source executions are logged with status "running" when they start, then "success" or "error" when they complete
  - Logs are stored in the `WorkerLog` collection with `data_source_id` field
  - Logs are updated in real-time with progress information via the `WorkerLog.update()` method
  - Logs have both `created_at` (when log was first created) and `updated_at` (when log was last updated) timestamps
  - The UI displays `updated_at` for completed logs (success/error) and `created_at` for running logs to show accurate completion times
  - Progress information is stored in the `details` field with a `stage` property indicating the current execution stage
  - Logs can be viewed per data source in the UI with pagination
  - Logs include execution time, facts created, and error details (if any)
  - "Running" status logs appear in blue, "success" in green, and "error" in red
  - Accessible via tRPC endpoint `dataSources.getLogs` with pagination support
  - Logs auto-refresh every 3 seconds when a data source is running
  - **Progress Logging from Scripts**: Scripts executed via `code_execute` can log custom progress messages using the `logProgress(message, metadata?)` function available in the execution context. Progress messages are stored in `details.progress` as an array of entries, each containing a timestamp, message, and optional metadata. These progress messages are displayed in the UI alongside other log information, providing real-time visibility into script execution progress.
- **File Handling in Data Sources**: Data source scripts that download files from external sources (e.g., Google Drive) must properly handle binary files. Binary files like `.docx` (Word documents) should be converted to text format using appropriate APIs (e.g., Google Drive export API) before storing as facts. Scripts should check content-type headers and detect binary data to avoid encoding issues. Only text-based files or files that can be exported/converted to text format are supported for fact extraction.
- **Running Status Indicators**:
  - Data sources show a visual "Running" indicator in the list when they are currently executing
  - The indicator includes a spinning icon and the current execution stage message
  - Running status is checked via the `dataSources.checkRunningStatus` tRPC endpoint
  - The UI auto-refreshes running status every 3 seconds when any data source is running
  - The "Run Now" button is disabled while a data source is running
- **Manual Triggering ("Run Now")**:
  - The "Run Now" button sets `next_run_at` to the current time
  - The runner picks up manually triggered data sources even if they are disabled
  - Works for both enabled and disabled data sources
  - Execution starts within 5 seconds (next runner check interval)
- **Stopping Running Executions ("Stop")**:
  - A "Stop" button appears in the UI when a data source is currently running
  - The button replaces the "Run Now" button while execution is in progress
  - Clicking "Stop" cancels the running execution by updating the running log to "error" status with `cancelled: true` in details
  - The worker checks for cancellation at key points during execution (before AI calls, before code execution, between iterations)
  - When cancellation is detected, the worker immediately stops execution and updates the log appropriately
  - The log is updated with a cancellation message and metadata indicating it was cancelled by the user
  - Accessible via tRPC endpoint `dataSources.stop` mutation with `id` parameter (data source ID)
  - Only workspace owners and admins can stop data source executions
  - The UI automatically refreshes after stopping to reflect the updated status
  - Cancellation checks occur periodically during execution, so stopping may take a few seconds depending on the current execution stage

**Skills (Data Source Definitions):**
- Skills are markdown files stored under `skills/` and serve as **data source definitions** for the Data Source Runner.
- A skill combines natural-language instructions with optional code blocks. The runner loads the file, builds an AI prompt, and executes the embedded code in a sandboxed VM.
- Skills are uploaded via `/data-sources` (or included in a zip) and become runnable, scheduled data sources.
- Skills can access the execution context: `secrets`, `facts` API (`facts.create`/`facts.bulkCreate`), `fetch`, `console`, and `logProgress(message, metadata?)` for UI-visible progress.
- Skills should be text-first: gather data, convert to text, then store as facts with useful metadata.
- Current repo skills:
  - `skills/fetch-web-page.md`: Fetches `camplight.net` content and stores a new fact each run.
  - `skills/skill1.md`: Pings `https://camplight.net` and records online/offline status as a fact.
  - `skills/gdrive/skill.md`: Syncs a specific Google Drive folder into facts with per-file metadata, recursive traversal, and error handling.
    - Requires a Google OAuth access token in `secrets` (`googleAccessToken` or `GOOGLE_ACCESS_TOKEN`) with `drive.readonly` scope.
    - Converts Google Docs/Sheets/Slides to text/CSV via export; skips unsupported binary Office files unless converted to Google Workspace format.
    - Uses `facts.bulkCreate()` for efficiency and `logProgress()` for detailed execution logs.

**Manual Worker Triggering:**
Workers can be manually triggered through:
- **Web UI**: 
  - Navigate to `/worker-logs` page and click the "Trigger Card Consolidator" or "Trigger Embeddings Generator" buttons
  - The worker logs page displays logs filtered by the current workspace - only logs for the active workspace are shown
  - Navigate to `/data-sources` page and click "Run Now" button for a specific data source
- **tRPC API**: 
  - Call `workerLogs.trigger` mutation with `worker` parameter ("card-consolidator" or "embeddings-generator")
  - Call `dataSources.trigger` mutation with `id` parameter (data source ID)
  - Call `dataSources.stop` mutation with `id` parameter (data source ID) to cancel a running execution
- **Trigger Mechanism**: 
  - Creates a trigger record in the `worker_triggers` collection with status "pending"
  - Workers check for pending triggers every 30 seconds
  - When a trigger is found, the worker immediately processes it (if not already running)
  - Trigger status is updated to "processing" → "completed" (or "failed" on error)
  - Workers skip triggers if already running, but will process them on the next check after completion
- **Logging**: Manual triggers create a log entry with status "running" to track the trigger request
- **Response Time**: Triggers are typically processed within 30 seconds (next trigger check interval)

**Vector Search:**
- Uses ArangoDB's vector indexes with cosine similarity metric
- **Requires ArangoDB to be started with `--experimental-vector-index` flag** (configured in docker-compose files)
- Vector index `nLists` parameter is automatically configured based on the number of vectors with embeddings:
  - Must be <= number of vectors (ArangoDB requirement)
  - Automatically set to `min(vectorCount, 100)` when vectors exist
  - Defaults to 16 when no vectors exist yet (will work when vectors are added)
  - Prevents "Number of training points should be at least as large as number of clusters" errors
- Manual cosine similarity calculation for vector search (compatible with all ArangoDB versions)
- Hybrid search combines full-text (BM25) and vector (cosine similarity) results
- Automatic query embedding generation when AI provider is available
- Falls back to full-text search if embeddings are unavailable

Both workers are designed to be:
- Non-blocking and asynchronous
- Resilient to failures
- Configurable via environment variables

🔔 Webhooks

KnowledgePlane supports webhooks for event notifications:

**Supported Events:**
- `fact.created` - Triggered when a fact is created
- `fact.updated` - Triggered when a fact is updated
- `fact.trashed` - Triggered when a fact is trashed
- `card.created` - Triggered when a card is created
- `card.updated` - Triggered when a card is updated
- `card.deleted` - Triggered when a card is deleted

**Creating a Webhook:**
```bash
curl -X POST http://localhost:8081/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhook",
    "events": ["fact.created", "card.updated"],
    "secret": "your-webhook-secret",
    "active": true,
    "created_by": "users/123"
  }'
```

**Webhook Payload:**
```json
{
  "event": "fact.created",
  "data": {
    "id": "facts/123",
    "content": "...",
    ...
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Webhook Signature:**
If a secret is provided, webhooks include an `X-KnowledgePlane-Signature` header with an HMAC-SHA256 signature:
```
X-KnowledgePlane-Signature: sha256=<signature>
```

💬 AI Chat Interface

KnowledgePlane includes an AI chat interface that combines OpenAI's language model with access to your knowledge base:

**Features:**
- Real-time chat interface with conversation history
- **Thread-based conversation storage** - All messages are saved in persistent threads, scoped per user and workspace
- **Automatic thread management** - Each user has a thread per workspace that maintains conversation context
- **Workspace-aware** - Chat automatically uses the current workspace's context when connecting to the MCP server
- **Smart truncation** - When threads exceed 20 human messages, older messages are truncated
- Automatic fact retrieval from knowledge base based on user queries
- Context-aware responses using relevant facts from the current workspace's knowledge base
- Knowledge context filtering scoped to the current workspace
- Visual indication of which facts were used in responses

**How it works:**
1. User sends a message in the chat interface
2. System retrieves or creates a thread for the user and current workspace
3. User message is stored in the thread
4. System retrieves thread messages (with smart truncation if needed)
5. System configures OpenAI with MCP tools to access the knowledge base, passing the current workspace's `workspace_id` in the MCP server URL
6. AI model uses MCP tools (e.g., `facts_search`) to retrieve relevant facts from the current workspace's knowledge base as needed
7. AI generates a response using both its training and the knowledge base facts accessed via MCP tools
8. AI returns JSON response with `content` (the response text) and `usedFacts` (array of fact IDs actually used)
9. System parses the JSON response and fetches the actual fact objects by IDs
10. Assistant response content is stored in the thread
11. Response is displayed with information about which facts were actually used to construct the response
12. When the user switches workspaces, the chat automatically uses the new workspace's context for subsequent MCP operations

**Thread Management:**
- Each user automatically gets a thread per workspace that persists across sessions
- All messages (user, assistant, system) are stored in the thread
- When a thread has more than 20 human messages (user + assistant messages with content), older messages are truncated
- This ensures conversation context is maintained while preventing excessive token usage
- Threads are scoped to workspaces, so switching workspaces creates/uses a different thread

**Thread Data Model:**
- `ChatThread` collection stores thread metadata:
  - `user_id` - User who owns the thread
  - `workspace_id` - Workspace that the thread belongs to
  - `created_at` - Thread creation timestamp
  - `updated_at` - Last update timestamp
- `ChatMessage` collection stores individual messages with:
  - Thread ID reference
  - Role (system, user, assistant)
  - Content
  - Sequence number for ordering
- Messages are automatically ordered by sequence and retrieved with truncation logic

**Access:**
Navigate to `/chat` in the web application (requires authentication).

**Example Usage:**
- Ask questions about stored facts: "What do we know about project Apollo?"
- Request summaries: "Summarize all facts about deployment processes"
- Get insights: "What are the relationships between our different projects?"

The chat interface automatically:
- Maintains conversation context across messages
- Shows which facts were actually used in each response (via MCP tools)
- Handles errors gracefully
- Uses MCP tools to give the AI model direct access to the knowledge base
- Tracks which facts were actually used by the AI model (not just searched)
- Returns only the facts that were actually used to construct the response

**MCP Integration:**
- The chat interface uses OpenAI's MCP (Model Context Protocol) tools feature
- MCP server URL is configured via `MCP_SERVER_URL` or constructed from `MCP_SERVER_HOST`, `MCP_SERVER_PORT`, and `MCP_SERVER_PROTOCOL`
- API key authentication is handled via `MCP_SERVER_API_KEY` (added as query parameter)
- The AI model receives instructions to return JSON with `content` and `usedFacts` fields
- Only facts that the AI model actually uses (via MCP tool calls) are tracked and returned

📁 File Upload and AI Extraction

KnowledgePlane supports file uploads with automatic fact and relation extraction using OpenAI:

**Features:**
- Upload various file types (text, markdown, JSON, PDF, Word docs, etc.)
- Automatic text extraction from files
- AI-powered fact extraction using OpenAI GPT-4
- Automatic relation identification between extracted facts
- Preservation of original file with links to extracted facts
- Knowledge context assignment for organized storage

**How it works:**
1. User uploads a file through the web interface
2. File is processed and passed to the AI model:
   - PDF files: Converted to base64 and passed via OpenAI's file input format (supports PDF natively)
   - Excel files (.xlsx): Converted to text format locally using exceljs, then passed as text content
   - Other files (Word, text, etc.): Converted to text and passed as text content
   - No local file storage - files are only stored as metadata in the database
   - Based on OpenAI's file input format: https://gist.github.com/outbounder/14c0c5df7f902b49a8219c05f3053a22
3. OpenAI analyzes the content and extracts:
   - Discrete facts with metadata
   - Relationships between facts (references, depends_on, related_to, etc.)
4. Facts and relations are created in the knowledge base
5. File metadata is linked to all extracted facts
6. Facts include metadata pointing back to the source file

**Supported File Types:**
- Text files (.txt, .md)
- JSON files (.json)
- PDF documents (.pdf) - requires additional processing
- Word documents (.doc, .docx) - requires additional processing
- Excel spreadsheets (.xlsx) - requires additional processing
- Other text-based formats

**File Model:**
- Stores file metadata (filename, size, mime type) - no local file storage
- Tracks which facts were extracted from the file
- Links facts back to source file via metadata
- Supports knowledge context organization
- Files are passed directly to OpenAI and not stored locally

**Access:**
Navigate to `/upload` in the web application (requires authentication).

**Example Workflow:**
1. Upload a project documentation file
2. AI extracts key facts about the project
3. Identifies relationships (e.g., "Feature A depends on Feature B")
4. All facts are linked to the original file
5. Facts can be queried, and you can trace them back to the source document

📝 Implementation Status

**Current Features:**
- ✅ MCP server implementation (HTTP transport)
- ✅ User management (auto-create from username/email, explicit registration via `users_register` tool)
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
- ✅ Web UI for browsing users with pagination and invitation status
- ✅ User profile and management page with profile editing and API key management
- ✅ User invitation system with email-based invitations, expiration tracking, and status management
- ✅ Users and invitations management page for viewing all users and managing invitations
- ✅ tRPC routes for listing facts and users
- ✅ tRPC routes for user profile management (update profile, generate/remove API keys)
- ✅ tRPC routes for listing knowledge cards
- ✅ Dashboard display of knowledge cards with pagination
- ✅ AI Chat interface with OpenAI integration and MCP server connection
- ✅ File upload with AI-powered fact and relation extraction
- ✅ ArangoDB graph database with relations support
- ✅ AQL query support
- ✅ Card consolidation via background worker
- ✅ Embeddings generation via background worker
- ✅ Vector embeddings stored in facts, fact relations, and knowledge cards
- ✅ ArangoDB vector indexes for efficient similarity search
- ✅ Full hybrid search (combining full-text and vector search with cosine similarity)
- ✅ Vector search using manual cosine similarity calculation
- ✅ Automatic query embedding generation for semantic search
- ✅ Webhook support
- ✅ REST API endpoints
- ✅ Knowledge base editor page with facts, cards, and graph views
- ✅ Card viewing and details in editor
- ✅ Worker logs page with manual worker triggering functionality
- ✅ tRPC route for triggering workers (`workerLogs.trigger`)
- ✅ Data sources management page with create, edit, delete, and trigger functionality
- ✅ Data source runner worker that executes scheduled data sources with AI and MCP tools
- ✅ Support for markdown and zip file definitions for data sources
- ✅ Docker image distribution system for client deployments
- ✅ Distribution package with docker-compose.yml and environment-based configuration
- ✅ Scripts for building and packaging Docker images for distribution

**Planned Features:**
- 🔲 Advanced graph visualization in editor
- 🔲 Audit logs
- 🔲 Retention policies
- 🔲 RBAC and advanced authentication
- 🔲 Analytics and telemetry
- 🔲 Card merging and deduplication
- 🔲 Fact versioning

📚 Documentation

Each application in the KnowledgePlane monorepo has its own README with detailed setup instructions, environment variables, and usage information:

- `apps/background-workers/README.md` - Background worker service documentation
- `apps/mcp-server/README.md` - MCP server documentation
- `apps/rest-api/README.md` - REST API documentation
- `apps/webapp/README.md` - Web application documentation
- `distribution/README.md` - Docker image distribution guide for clients
- `DEPLOYMENT.md` - General deployment guide for DigitalOcean App Platform, Railway, Render, Docker Compose, and Docker image distribution
- `infra/digitalocean/README.md` - Detailed DigitalOcean deployment guide with ArangoDB setup on Droplet