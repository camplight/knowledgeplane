# KnowledgePlane (Short Spec)

KnowledgePlane is an open-core MCP server that provides shared, persistent memory for AI agents and teams. It exposes a secure, queryable knowledge base over HTTP so agents can write, search, and consolidate facts with workspace and user context.

## Problem
- Agents forget context between sessions.
- Team knowledge is scattered and hard to integrate across tools.
- Existing memory layers are personal or not auditable.

## Solution
- A shared, workspace-scoped knowledge graph with full-text and vector search.
- MCP-compatible tools for agents; REST and web UI for humans.
- Background workers that keep memory organized and searchable.

## Core Features
- MCP server over HTTP (compatible with Claude Desktop, Cursor, VS Code, etc.).
- Facts, knowledge cards, and typed fact relations (graph model).
- Hybrid search (full-text + vector embeddings).
- ArangoDB graph DB with AQL support.
- File upload with AI-powered fact and relation extraction.
- Data sources that run on schedules to gather knowledge and store facts.
- Skills (markdown data source definitions) with optional code blocks, executed in a sandboxed VM.
- Background workers: card consolidation and embeddings generation.
- Workspace and user management with invitations and onboarding.
- Webhooks for fact/card events.
- Docker-first deployment.

## Architecture (High Level)
Web UI (Next.js) and tRPC API -> MCP server -> Background workers -> ArangoDB

## MCP Tools (Key)
- Facts: `facts.write`, `facts.bulkwrite`, `facts.search`, `facts.update`, `facts.trash`, `facts.consolidate`
- Knowledge cards: `knowledge_cards.create`, `knowledge_cards.update`, `knowledge_cards.delete`, `knowledge_cards.search`, `knowledge_cards.list`, `knowledge_cards.split`, `knowledge_cards.combine`
- Files: `files.upload`, `files.list`, `files.get`, `files.search`, `files.update`, `files.delete`
- Relations: `fact_relations.create`, `fact_relations.update`, `fact_relations.delete`, `fact_relations.search`, `fact_relations.get`, `fact_relations.get_related`, `fact_relations.get_incoming`
- Users: `users.register`
- Workers: `workers.trigger`

Notes:
- `workspace_id` is inferred from the authenticated session and is not accepted in tool arguments.
- `created_by` and `last_updated_by` are inferred when omitted.

## Authentication
Three modes:
- OAuth (Google/GitHub) for web UI and MCP sessions.
- MCP OAuth flow (PKCE) for compliant MCP clients.
- API key auth via `knowledgeplane-key` header (or `api_key` query param for internal use).

## REST API (Highlights)
- `/api/facts`, `/api/relations`, `/api/knowledge-cards`, `/api/webhooks`
- Health: `/health`

## Data Model (Core)
- Fact: content, metadata, workspace/user, timestamps, trashed flag.
- FactRelation: typed edges between facts.
- KnowledgeCard: consolidated summaries of facts.
- File: uploaded file metadata with extracted fact IDs.
- Workspace + members + invitations.

## Quick Start (Dev)
1. `npm run bootstrap`
2. `./scripts/setup-env.sh` then fill .env files
3. `npm run dev`
4. (OAuth) `./scripts/start-ngrok.sh 8080`

## Use Cases
- Team memory and documentation.
- Persistent agent memory across sessions.
- Document intelligence and fact extraction.

## Skills Support (Short)
- Skills live under `skills/` as markdown instructions + optional code.
- They are uploaded via `/data-sources` and run by the Data Source Runner on a schedule.
- Execution context includes `secrets`, `facts` API, `fetch`, `console`, and `logProgress()`.
- Current examples: web page fetch, site uptime ping, and Google Drive folder sync.

For full details, see `docs/SPEC.md`.
