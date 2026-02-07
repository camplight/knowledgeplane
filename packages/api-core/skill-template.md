# KnowledgePlane Skill (Agent Instructions)

This document is rendered by the KnowledgePlane instance you are connected to.
Use the rendered endpoints below for your requests.

## Instance Routing

### Subpaths Mode (single domain)
- MCP server: `{{ORIGIN_BASE}}/mcp`
- REST API: `{{ORIGIN_BASE}}/api`
- Webapp: `{{ORIGIN_BASE}}`

## Authentication (Both MCP and REST)

Use one of:
- `Authorization: Bearer <token>` (OAuth)
- `knowledgeplane-key: <api_key>`
- `api_key=<api_key>` (query param if headers are not possible)

Workspace context is inferred from the authenticated session.

## MCP Tools (Underscore Names)

- Facts: `facts_write`, `facts_bulkwrite`, `facts_search`, `facts_update`,
  `facts_trash`, `facts_consolidate`
- Knowledge cards: `knowledge_cards_create`, `knowledge_cards_update`,
  `knowledge_cards_delete`, `knowledge_cards_search`, `knowledge_cards_list`,
  `knowledge_cards_split`, `knowledge_cards_combine`
- Files: `files_upload`, `files_list`, `files_get`, `files_search`,
  `files_update`, `files_delete`
- Relations: `fact_relations_create`, `fact_relations_update`,
  `fact_relations_delete`, `fact_relations_search`, `fact_relations_get`,
  `fact_relations_get_related`, `fact_relations_get_incoming`
- Users: `users_register`
- Workers: `workers_trigger`

## REST API Endpoints

Base: `{{ORIGIN_BASE}}/api`

- `GET /health`
- `GET /skill.md`
- `GET /api/facts`
- `GET /api/facts/:id`
- `POST /api/facts`
- `PUT /api/facts/:id`
- `DELETE /api/facts/:id`
- `POST /api/facts/search`
- `GET /api/relations`
- `POST /api/relations`
- `GET /api/facts/:id/relations`
- `POST /api/query`
- `GET /api/knowledge-cards`
- `GET /api/knowledge-cards/:id`
- `POST /api/knowledge-cards`
- `PUT /api/knowledge-cards/:id`
- `POST /api/knowledge-cards/search`
- `POST /api/knowledge-cards/split`
- `POST /api/knowledge-cards/combine`
- `DELETE /api/knowledge-cards/:id`
- `GET /api/webhooks`
- `POST /api/webhooks`
- `PUT /api/webhooks/:id`
- `DELETE /api/webhooks/:id`

## Usage Guidance

- Search before writing to avoid duplicates.
- Prefer batch writes for ingestion.
- Include metadata fields like `source`, `url`, and `timestamp` when available.
