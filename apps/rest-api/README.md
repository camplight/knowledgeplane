# REST API

Simple REST API server for KnowledgePlane providing direct HTTP endpoints for managing facts, relations, cards, categories, and webhooks.

## Overview

This server provides RESTful HTTP endpoints for:
- **Facts**: CRUD operations and search
- **Relations**: Create and query relationships between facts
- **Cards**: List and retrieve knowledge cards
- **Categories**: Manage hierarchical categories
- **Webhooks**: Configure and manage webhooks
- **AQL Queries**: Execute raw ArangoDB AQL queries

## Environment Variables

### Required

- `ARANGO_URL` - ArangoDB connection URL (default: `http://localhost:8529`)
- `ARANGO_DB_NAME` - Database name (default: `knowledgeplane`)
- `ARANGO_USER` - Database username (default: `root`)
- `ARANGO_PASSWORD` - Database password (default: empty string)

### Optional

- `PORT` - Server port (default: `8081`)
- `HOST` - Server host (default: `0.0.0.0`)
- `NODE_ENV` - Environment mode (`development` or `production`)

## Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment variables**:
Create a `.env.dev` file in the app directory:
```env
ARANGO_URL=http://localhost:8529
ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=root
PORT=8081
HOST=0.0.0.0
NODE_ENV=development
```

3. **Ensure database is running**:
The server requires an ArangoDB instance to be running and accessible.

## Running

### Development

```bash
npm run dev
```

This runs the server in watch mode with hot reload. The server will be available at `http://localhost:8081`.

### Production

1. **Build the application**:
```bash
npm run build
```

2. **Start the server**:
```bash
npm start
```

### Docker

The server can be run using Docker Compose. See the root `infra/docker-compose.yml` for configuration.

## API Endpoints

### Health Check

```bash
GET /health
```

Returns server health status.

### Facts

- `GET /api/facts` - List facts (query params: `limit`, `offset`, `knowledge_context`, `include_trashed`)
- `GET /api/facts/:id` - Get a specific fact
- `POST /api/facts` - Create a new fact
- `PUT /api/facts/:id` - Update a fact
- `DELETE /api/facts/:id` - Trash a fact (query param: `last_updated_by`)
- `POST /api/facts/search` - Search facts (body: `query`, `knowledge_context`, `k`, `offset`, `include_trashed`)

### Relations

- `GET /api/relations` - List relations (query params: `from_fact`, `to_fact`, `type`, `limit`, `offset`)
- `POST /api/relations` - Create a new relation
- `GET /api/facts/:id/relations` - Get relations for a fact (query param: `type`)

### Cards

- `GET /api/cards` - List cards (query params: `limit`, `offset`, `knowledge_context`, `category_id`)
- `GET /api/cards/:id` - Get a specific card

### Categories

- `GET /api/categories` - List categories (query params: `knowledge_context`, `parent_id`)
- `GET /api/categories/tree` - Get category tree (query param: `knowledge_context`)
- `GET /api/categories/:id` - Get a specific category
- `POST /api/categories` - Create a new category

### Webhooks

- `GET /api/webhooks` - List webhooks (query param: `active_only`)
- `POST /api/webhooks` - Create a new webhook
- `PUT /api/webhooks/:id` - Update a webhook
- `DELETE /api/webhooks/:id` - Delete a webhook

### AQL Queries

- `POST /api/query` - Execute AQL query (body: `query`, `bindVars`)

## Example Usage

### Create a Fact

```bash
curl -X POST http://localhost:8081/api/facts \
  -H "Content-Type: application/json" \
  -d '{
    "content": "The sky is blue",
    "knowledge_context": "general",
    "created_by": "user123",
    "last_updated_by": "user123"
  }'
```

### Search Facts

```bash
curl -X POST http://localhost:8081/api/facts/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "sky",
    "k": 10
  }'
```

### Create a Relation

```bash
curl -X POST http://localhost:8081/api/relations \
  -H "Content-Type: application/json" \
  -d '{
    "from_fact": "facts/123",
    "to_fact": "facts/456",
    "type": "related_to",
    "created_by": "user123"
  }'
```

### Execute AQL Query

```bash
curl -X POST http://localhost:8081/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "FOR fact IN facts LIMIT 10 RETURN fact"
  }'
```

## CORS

CORS is enabled for all origins. In production, you may want to restrict this.

## Dependencies

- `fastify` - Web framework
- `@fastify/cors` - CORS support
- `@knowledgeplane/db` - Database models and connection

