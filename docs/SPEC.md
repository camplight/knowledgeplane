🧠 KnowledgePlane — Shared Team Memory for AI Agents (MCP Server)

KnowledgePlane is an open-core Model Context Protocol (MCP) server that gives AI agents and teams a shared, persistent memory layer — secure, queryable, and self-maintaining.

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

Vector embeddings – automatic generation of embeddings for facts, fact relations, and knowledge cards using OpenAI embeddings. Enables semantic search capabilities with manual cosine similarity calculation. Supports hybrid search combining full-text and vector search for optimal results.

Graph database – ArangoDB provides native graph capabilities for modeling relationships between facts.

Relations – facts can be linked together with typed relationships (references, depends_on, related_to, part_of, etc.).

AQL queries – support for ArangoDB Query Language (AQL) for advanced graph queries and traversals.

KnowledgeCard consolidation – background worker automatically creates FactRelations between unconsolidated facts using AI analysis, then consolidates related facts and their FactRelations into summary knowledge cards using OpenAI agents. The worker uses graph traversal to find related facts via FactRelations.


Webhooks – register webhooks to receive notifications on fact/card events.

REST API – comprehensive REST API for programmatic access.

User management – automatic user creation and tracking via username/email.

Team management – users can create teams, invite members, and manage team settings. All domain data (facts, cards, files, etc.) is scoped to teams.

User onboarding – automatic onboarding flow for new users on first login, including default team creation.

Team invitations – personal invitation links (shareable tokens) for inviting users to teams. Links can be copied and shared with friends.

Session-based context – MCP sessions maintain user and knowledge context across requests.

Docker-first deployment – one-command local or hosted setup.

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
Background Workers (Card Consolidation, Embeddings Generation)
   ↓
ArangoDB (graph database with full-text search)
```

🔐 MCP Tools

| Tool | Description |
|------|-------------|
| `facts.write` | Write a fact with content, metadata, and user tracking |
| `facts.bulkwrite` | Write multiple facts to the knowledge base in a single operation |
| `facts.search` | Search facts using hybrid search (combines full-text and vector search) with pagination. Trashed facts are excluded by default |
| `facts.update` | Update a fact in the knowledge base. Only provided fields will be updated |
| `facts.trash` | Mark a fact as trashed. Trashed facts are excluded from search results unless explicitly included |
| `facts.consolidate` | Consolidate a set of facts into a knowledge card using AI. Optionally includes related facts via graph traversal |
| `knowledge_cards.create` | Create a new knowledge card with title, summary, content, and associated fact IDs |
| `knowledge_cards.update` | Update a knowledge card. Only provided fields will be updated |
| `knowledge_cards.delete` | Delete a knowledge card by ID |
| `knowledge_cards.search` | Search knowledge cards using hybrid search (combines full-text and vector search) with pagination |
| `knowledge_cards.list` | List knowledge cards with pagination |
| `knowledge_cards.split` | Split a knowledge card into multiple cards using AI |
| `knowledge_cards.combine` | Combine multiple knowledge cards into a single card using AI |
| `users.register` | Register a new user or update an existing user's email if the username already exists |
| `files.upload` | Upload a file and automatically extract facts and FactRelations using AI. The file content is analyzed using OpenAI to identify key information and relationships |
| `files.list` | List files with pagination |
| `files.get` | Get a file by ID |
| `files.search` | Search files by fact ID. Returns all files that contain the specified fact ID in their fact_ids array |
| `files.update` | Update a file. Only provided fields will be updated. Metadata and fact_ids can be updated |
| `files.delete` | Delete a file by ID |
| `fact_relations.create` | Create a relation between two facts. Relations are typed edges in the knowledge graph |
| `fact_relations.update` | Update a fact relation. Only provided fields will be updated. Type and metadata can be updated |
| `fact_relations.delete` | Delete a fact relation by ID |
| `fact_relations.search` | Search fact relations with filtering. Supports filtering by from_fact, to_fact, and type. Supports pagination |
| `fact_relations.get` | Get a fact relation by ID |
| `fact_relations.get_related` | Get facts related to a given fact via outgoing relations. Returns relations and the related facts. Optionally filter by relation type |
| `fact_relations.get_incoming` | Get facts that have relations pointing to a given fact (incoming relations). Returns relations and the source facts. Optionally filter by relation type |
| `workers.trigger` | Trigger a background worker to run (card-consolidator or embeddings-generator) |

**facts.write Parameters:**
- `content` (required): The content of the fact
- `metadata` (optional): Key-value pairs of metadata
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**Note:** `team_id` is NOT accepted as a parameter. It is automatically set from the authenticated session context. Any `team_id` provided in tool arguments will be ignored and replaced with the team ID from the session context.

**facts.bulkwrite Parameters:**
- `facts` (required): Array of fact objects to write. Each fact object has the same parameters as `facts.write`:
  - `content` (required): The content of the fact
  - `metadata` (optional): Key-value pairs of metadata
  - `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
  - `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**Note:** `team_id` is NOT accepted as a parameter in any fact object. It is automatically set from the authenticated session context for all facts. Any `team_id` provided in tool arguments will be ignored and replaced with the team ID from the session context.

**facts.search Parameters:**
- `query` (required): Search query for hybrid search (combines full-text and vector search). Use '*' to search all facts
- `k` (optional): Limit for number of results (default: 5, max: 20). Results are optimized to prevent context window issues
- `offset` (optional): Offset for pagination (default: 0)
- `include_trashed` (optional): If true, includes trashed facts in search results (default: false)

**Note:** `team_id` is NOT accepted as a parameter. It is automatically set from the authenticated session context. Any `team_id` provided in tool arguments will be ignored and replaced with the team ID from the session context.

**facts.search Response Optimization:**
- Content is automatically truncated to 500 characters to prevent context window issues
- Embeddings and internal database fields (_key, _id, embedding_model) are excluded from results
- Maximum 20 results per request (k is capped at 20)
- Response includes a `content_truncated` flag for each fact if content was truncated
- Use `facts.update` or fetch individual facts if full content is needed

**facts.update Parameters:**
- `id` (required): The ID of the fact to update
- `content` (optional): The updated content of the fact
- `metadata` (optional): Updated key-value pairs of metadata
- `last_updated_by` (required): User ID of the person updating the fact

**workers.trigger Parameters:**
- `worker` (required): The name of the worker to trigger ("card-consolidator" or "embeddings-generator")

**facts.trash Parameters:**
- `id` (required): The ID of the fact to trash
- `last_updated_by` (required): User ID of the person trashing the fact

**facts.consolidate Parameters:**
- `fact_ids` (required): Array of fact IDs to consolidate
- `include_related` (optional): If true, includes related facts via graph traversal (default: false)
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**knowledge_cards.create Parameters:**
- `title` (required): Title of the knowledge card
- `summary` (required): Brief summary of the knowledge card
- `content` (required): Full content of the knowledge card
- `fact_ids` (required): Array of fact IDs that are consolidated into this card
- `team_id` (optional): Team ID. If not provided, inferred from authenticated session (uses user's first team)
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)
- `metadata` (optional): Key-value pairs of metadata

**knowledge_cards.update Parameters:**
- `id` (required): The ID of the knowledge card to update
- `title` (optional): Updated title of the knowledge card
- `summary` (optional): Updated summary of the knowledge card
- `content` (optional): Updated content of the knowledge card
- `fact_ids` (optional): Updated array of fact IDs
- `metadata` (optional): Updated key-value pairs of metadata
- `last_updated_by` (optional): User ID of the person updating the card. If not provided, inferred from authenticated session (OAuth token or API key)

**knowledge_cards.delete Parameters:**
- `id` (required): The ID of the knowledge card to delete

**knowledge_cards.search Parameters:**
- `query` (required): Search query for hybrid search. Use '*' to search all cards
- `team_id` (optional): Team ID for filtering. If not provided, inferred from authenticated session (uses user's first team)
- `k` (optional): Limit for number of results (default: 5)
- `offset` (optional): Offset for pagination (default: 0)
- `use_vector_search` (optional): If true, use vector search only; if false, use full-text only; if undefined, use hybrid

**knowledge_cards.list Parameters:**
- `team_id` (optional): Team ID for filtering. If not provided, inferred from authenticated session (uses user's first team)
- `limit` (optional): Maximum number of cards to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**knowledge_cards.split Parameters:**
- `id` (required): The ID of the knowledge card to split
- `num_cards` (optional): Number of cards to split into (default: 2)
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**knowledge_cards.combine Parameters:**
- `card_ids` (required): Array of knowledge card IDs to combine (at least 2 cards required)
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)
- `last_updated_by` (optional): User ID of the last updater. If not provided, inferred from authenticated session (OAuth token or API key)

**users.register Parameters:**
- `username` (required): Unique username for the user
- `email` (required): Email address for the user

**knowledgecontexts.list Parameters:**
- `include_trashed` (optional): If true, includes trashed facts in search results (default: false)

**files.upload Parameters:**
- `filename` (required): Original filename of the file being uploaded
- `mimeType` (required): MIME type of the file (e.g., 'text/plain', 'application/json')
- `data` (required): Base64-encoded file content
- `team_id` (optional): Team ID. If not provided, inferred from authenticated session (uses user's first team)
- `created_by` (optional): User ID of the uploader. If not provided, inferred from authenticated session (OAuth token or API key)

**files.list Parameters:**
- `team_id` (optional): Team ID for filtering. If not provided, inferred from authenticated session (uses user's first team)
- `limit` (optional): Maximum number of files to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**files.get Parameters:**
- `id` (required): The ID of the file to retrieve

**files.search Parameters:**
- `fact_id` (required): The fact ID to search for in files. Returns all files that contain this fact ID in their fact_ids array

**files.update Parameters:**
- `id` (required): The ID of the file to update
- `metadata` (optional): Updated metadata (key-value pairs)
- `fact_ids` (optional): Updated array of fact IDs extracted from this file

**files.delete Parameters:**
- `id` (required): The ID of the file to delete

**fact_relations.create Parameters:**
- `from_fact` (required): Source fact ID
- `to_fact` (required): Target fact ID
- `type` (required): Relation type (e.g., 'references', 'depends_on', 'related_to', 'part_of')
- `team_id` (optional): Team ID. If not provided, inferred from authenticated session (uses user's first team)
- `metadata` (optional): Additional relation metadata
- `created_by` (optional): User ID of the creator. If not provided, inferred from authenticated session (OAuth token or API key)

**fact_relations.update Parameters:**
- `id` (required): The ID of the relation to update
- `type` (optional): Updated relation type
- `metadata` (optional): Updated metadata (key-value pairs)

**fact_relations.delete Parameters:**
- `id` (required): The ID of the relation to delete

**fact_relations.search Parameters:**
- `team_id` (optional): Team ID for filtering. If not provided, inferred from authenticated session (uses user's first team)
- `from_fact` (optional): Filter by source fact ID
- `to_fact` (optional): Filter by target fact ID
- `type` (optional): Filter by relation type
- `limit` (optional): Maximum number of relations to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**fact_relations.get Parameters:**
- `id` (required): The ID of the relation to retrieve

**fact_relations.get_related Parameters:**
- `fact_id` (required): The fact ID to get related facts for
- `relation_type` (optional): Optional filter by relation type

**fact_relations.get_incoming Parameters:**
- `fact_id` (required): The fact ID to get incoming relations for
- `relation_type` (optional): Optional filter by relation type

🔌 API Endpoints

**MCP Server Endpoints:**
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
| `GET /editor` | Knowledge base editor page (protected, requires session) |
| `GET /chat` | AI chat interface with MCP server connection (protected, requires session) |
| `GET /upload` | File upload page with AI-powered fact extraction (protected, requires session) |
| `GET /facts` | Browse facts page (protected, requires session) |
| `GET /profile` | User profile and management page (protected, requires session) |
| `GET /onboarding` | Onboarding page for new users (protected, requires session) - create first team and complete onboarding |
| `GET /teams` | Team management page (protected, requires session) - create teams, manage members, and invitations |
| `GET /invite/:token` | Public invitation acceptance page - view invitation details (public), accept team invitations via personal links (requires authentication) |

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
| `GET /api/knowledge-cards/:id` | Get a specific knowledge card |
| `DELETE /api/knowledge-cards/:id` | Delete a knowledge card |
| `GET /api/webhooks` | List webhooks |
| `POST /api/webhooks` | Create a new webhook |
| `PUT /api/webhooks/:id` | Update a webhook |
| `DELETE /api/webhooks/:id` | Delete a webhook |

**Team Management:**

KnowledgePlane supports team-based collaboration:

- **Teams**: Users can create multiple teams, each with its own isolated knowledge base
- **Team Members**: Users can be members of multiple teams with different roles:
  - **Owner**: Full control, can delete team, manage all members
  - **Admin**: Can manage members and team settings (except deletion)
  - **Member**: Can create and manage content within the team
- **Default Team**: New users automatically get a default team created on first login
- **Team Scoping**: All domain data (facts, knowledge cards, files, relations, etc.) is scoped to teams
- **Personal Invitation Links**: Team owners/admins can generate shareable invitation links (tokens) that can be copied and sent to friends. Invitations can be deleted by owners/admins. Invitation links are publicly accessible (no authentication required to view invitation details), but require authentication to accept.
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
   - If `API_KEYS` environment variable is configured, validates against it (comma-separated list)
   - If `API_KEYS` is not configured, any API key is accepted and automatically creates/finds a user with that key stored in their profile
   - The same API key always maps to the same user for consistency
   - No OAuth flow required - direct authentication
   - Suitable for automated scripts, CI/CD pipelines, and server-to-server communication
   - User ID is automatically inferred from the API key authentication context

**MCP Session Management:**
- Sessions are identified by `mcp-session-id` header
- User context is automatically inferred from authenticated session (OAuth token or API key)
- Team context is automatically inferred from authenticated user's first team, or can be provided via query params: `?team_id=teams/123`
- User context can also be provided via query params: `?username=user&email=user@example.com` (fallback if not authenticated)
- Authentication via `Authorization: Bearer <token>` header (OAuth), `knowledgeplane-key` header (API key), or `api_key` query parameter (for internal use)
- **Team ID Auto-Inference**: All MCP tool handlers automatically infer `team_id` from the authenticated user's session context. Tools do NOT accept `team_id` as a parameter - it is automatically set from the user's team context. If a user is authenticated, their `team_id` is automatically inferred from their first team or from the `team_id` query parameter.
- **Team ID Not Accepted in Args**: `team_id` is NOT accepted in tool handler arguments. Any `team_id` provided in tool arguments will be automatically removed and replaced with the team ID from the authenticated session context. This ensures that authenticated users always operate within their authorized team context, preventing incorrect team_id values (e.g., team names instead of IDs) from being used.
- For `facts.write` and other creation operations, `created_by`, `last_updated_by`, and `team_id` are automatically set from the authenticated session if not explicitly provided
- All MCP operations are scoped to the team context (either from query param or user's first team)
- **Personal MCP URL**: Users can generate and copy their personal MCP server URL with their API key included via the profile page. This URL includes the API key as a query parameter and can be used to connect AI agents and tools.
- **Team-Aware Chat**: The chat interface is team-aware and automatically passes the current team's `team_id` to the MCP server URL. When users switch teams, the chat automatically uses the correct team context for MCP operations.
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

**Team Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `name` (string): Team name
- `slug` (string): URL-friendly team identifier (unique)
- `description` (string): Optional team description
- `created_by` (string): Reference to user ID who created the team
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**TeamMember Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `team_id` (string): Reference to team ID
- `user_id` (string): Reference to user ID
- `role` (string): Team member role - "owner", "admin", or "member"
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**Fact Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `content` (string): Fact content
- `metadata` (object): Key-value metadata
- `team_id` (string): Reference to team ID
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)
- `created_by` (string): Reference to user ID
- `last_updated_by` (string): Reference to user ID
- `trashed` (boolean): Whether the fact has been trashed (default: false)

**FactRelation Collection (Edges):**
- `_id` (ArangoDB edge ID): Primary key
- `_key` (string): Document key
- `_from` (string): Source fact document ID
- `_to` (string): Target fact document ID
- `from_fact` (string): Source fact ID (normalized)
- `to_fact` (string): Target fact ID (normalized)
- `type` (string): Relation type (e.g., "references", "depends_on", "related_to", "part_of")
- `team_id` (string): Reference to team ID
- `metadata` (object): Additional relation metadata
- `created_by` (string): Reference to user ID
- `created_at` (string): Creation timestamp (ISO 8601)

Note: FactRelations are stored as edges in the ArangoDB graph, where Facts are nodes.

**KnowledgeCard Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `title` (string): Knowledge card title
- `summary` (string): Brief summary
- `content` (string): Full consolidated content
- `fact_ids` (array): Array of fact IDs that were consolidated
- `team_id` (string): Reference to team ID
- `created_by` (string): Reference to user ID
- `last_updated_by` (string): Reference to user ID
- `metadata` (object): Key-value metadata
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)

**Webhook Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `url` (string): Webhook URL
- `events` (array): Array of event names to subscribe to (e.g., ["fact.created", "card.updated"])
- `team_id` (string): Reference to team ID
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
- `team_id` (string): Reference to team ID
- `uploaded_by` (string): Reference to user ID
- `metadata` (object): Additional metadata
- `created_at` (string): Creation timestamp (ISO 8601)
- `updated_at` (string): Last update timestamp (ISO 8601)
- `fact_ids` (array): Array of fact IDs extracted from this file

**Invitation Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `team_id` (string): Reference to team ID
- `invited_by` (string): Reference to user ID who sent the invitation
- `token` (string): Unique invitation token (personal invitation link)
- `status` (string): Invitation status - "pending", "accepted", or "expired"
- `expires_at` (string): Expiration timestamp (ISO 8601)
- `accepted_at` (string): Acceptance timestamp (ISO 8601, only set when status is "accepted")
- `accepted_by` (string): Reference to user ID who accepted the invitation (only set when status is "accepted")
- `created_at` (string): Creation timestamp (ISO 8601)

**ChatThread Collection:**
- `_id` (ArangoDB document ID): Primary key
- `_key` (string): Document key
- `user_id` (string): Reference to user ID
- `team_id` (string): Reference to team ID
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
  - Statistics overview (total facts, knowledge cards, active facts, categories)
  - Facts list with pagination and metadata display
  - Knowledge cards list with pagination, showing title, summary, fact count, and last updated date
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
  - Card deletion functionality with confirmation dialog
  - Fact details sidebar with relations management (create and view outgoing/incoming relations)
  - Search functionality for facts with server-side semantic search
  - Real-time client-side filtering that filters visible facts, cards, and files as you type, searching through content, title, summary, and filename fields
- Facts browsing page (`/facts`) with pagination, filtering, and detailed fact display
- Team management page (`/teams`) with:
  - Team listing and creation
  - Team settings (name, description)
  - Team member management (add, update roles, remove members)
  - Invitation management (create invitation links, view, copy links, track status, delete invitations)
  - Role-based access control (owner/admin/member permissions)
  - Tabbed interface for team settings, members, and invitations
  - Toast notifications for user feedback (copy link, delete invitation)
  - Expiration days input with label and help text showing default value (7 days)
- Onboarding page (`/onboarding`) for new users:
  - First-time user flow to create initial team
  - Onboarding completion tracking
- Invitation acceptance page (`/invite/:token`) for public invitation links:
  - Public access - unauthenticated users can view invitation details
  - Welcome page for unauthenticated users with team information and sign-in prompt
  - Accept team invitations via personal links (requires authentication)
  - Shows team and inviter information
  - Handles expired and invalid invitations
  - Clear call-to-action directing users to sign in to continue

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

**MCP Server (`apps/mcp-server/.env.dev`):**
- `ARANGO_URL` - ArangoDB connection URL (default: `http://localhost:8529`)
- `ARANGO_DB_NAME` - ArangoDB database name (default: `knowledgeplane`)
- `ARANGO_USER` - ArangoDB username (default: `root`)
- `ARANGO_PASSWORD` - ArangoDB password (default: empty)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `SESSION_SECRET` - Secret key for session encryption (minimum 32 characters, defaults to insecure placeholder in development)
- `API_KEYS` - Comma-separated list of valid API keys for API key authentication (optional)
- `OAUTH_REDIRECT_BASE_URL` - Base URL for OAuth callbacks (default: `http://localhost:8080`, use ngrok URL for localhost development)
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
- `NEXTAUTH_URL` - Base URL for NextAuth (e.g., `http://localhost:3000`)
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

**Localhost Development with ngrok:**
For localhost development, you'll need to set up ngrok to expose port 8080 for OAuth callbacks. See [DEVELOPMENT.md](../DEVELOPMENT.md) for detailed instructions.

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
- `apps/background-workers` - Background workers for card consolidation and embeddings
- `apps/rest-api` - REST API server (optional)
- `packages/db` - Shared database package
- `packages/file-processor` - File processing utilities
- `packages/aimodel` - AI model client abstraction

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

# Stop development servers
npm run dev:stop
```

**Production Mode:**
```bash
docker compose -f infra/docker-compose.yml up --build
```

**For cloud deployment instructions (Digital Ocean, Railway, Render, etc.), see [DEPLOYMENT.md](../DEPLOYMENT.md)**

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
      "name":"facts.write",
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
      "name":"facts.bulkwrite",
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
      "name":"facts.write",
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
      "name":"facts.write",
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
      "name":"facts.write",
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
      "name":"facts.search",
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
curl -X POST http://localhost:8080/mcp \
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
      "name":"files.upload",
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
      "name":"facts.consolidate",
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
      "name":"knowledge_cards.create",
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
      "name":"knowledge_cards.search",
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
      "name":"knowledge_cards.list",
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
      "name":"knowledge_cards.update",
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
      "name":"knowledge_cards.split",
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
      "name":"knowledge_cards.combine",
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
      "name":"knowledge_cards.delete",
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
      "name":"files.list",
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
      "name":"files.get",
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
      "name":"files.search",
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
      "name":"files.update",
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
      "name":"files.delete",
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
      "name":"fact_relations.create",
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
      "name":"fact_relations.update",
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
      "name":"fact_relations.delete",
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
      "name":"fact_relations.search",
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
      "name":"fact_relations.get",
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
      "name":"fact_relations.get_related",
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
      "name":"fact_relations.get_incoming",
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
- Runs every 10 minutes
- Generates vector embeddings for facts, fact relations, and knowledge cards
- Uses OpenAI embeddings API (text-embedding-3-small by default, dimension 1536)
- Processes items in batches for efficiency
- Updates embeddings when model changes or embeddings are missing
- Stores embeddings directly in ArangoDB documents
- Can be manually triggered via the worker logs page or tRPC API

**Manual Worker Triggering:**
Workers can be manually triggered through:
- **Web UI**: Navigate to `/worker-logs` page and click the "Trigger Card Consolidator" or "Trigger Embeddings Generator" buttons
- **tRPC API**: Call `workerLogs.trigger` mutation with `worker` parameter ("card-consolidator" or "embeddings-generator")
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
- **Thread-based conversation storage** - All messages are saved in persistent threads, scoped per user and team
- **Automatic thread management** - Each user has a thread per team that maintains conversation context
- **Team-aware** - Chat automatically uses the current team's context when connecting to the MCP server
- **Smart truncation** - When threads exceed 20 human messages, older messages are truncated
- Automatic fact retrieval from knowledge base based on user queries
- Context-aware responses using relevant facts from the current team's knowledge base
- Knowledge context filtering scoped to the current team
- Visual indication of which facts were used in responses

**How it works:**
1. User sends a message in the chat interface
2. System retrieves or creates a thread for the user and current team
3. User message is stored in the thread
4. System retrieves thread messages (with smart truncation if needed)
5. System configures OpenAI with MCP tools to access the knowledge base, passing the current team's `team_id` in the MCP server URL
6. AI model uses MCP tools (e.g., `facts.search`) to retrieve relevant facts from the current team's knowledge base as needed
7. AI generates a response using both its training and the knowledge base facts accessed via MCP tools
8. AI returns JSON response with `content` (the response text) and `usedFacts` (array of fact IDs actually used)
9. System parses the JSON response and fetches the actual fact objects by IDs
10. Assistant response content is stored in the thread
11. Response is displayed with information about which facts were actually used to construct the response
12. When the user switches teams, the chat automatically uses the new team's context for subsequent MCP operations

**Thread Management:**
- Each user automatically gets a thread per team that persists across sessions
- All messages (user, assistant, system) are stored in the thread
- When a thread has more than 20 human messages (user + assistant messages with content), older messages are truncated
- This ensures conversation context is maintained while preventing excessive token usage
- Threads are scoped to teams, so switching teams creates/uses a different thread

**Thread Data Model:**
- `ChatThread` collection stores thread metadata:
  - `user_id` - User who owns the thread
  - `team_id` - Team that the thread belongs to
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
   - Excel files (.xlsx, .xls): Converted to text format locally using xlsx library, then passed as text content
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
- Excel spreadsheets (.xlsx, .xls) - requires additional processing
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