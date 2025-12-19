# MCP Server

Fastify-based MCP (Model Context Protocol) server for KnowledgePlane. Provides a RESTful API and MCP protocol interface for managing knowledge facts, cards, categories, and more.

## Overview

This server provides:
- **MCP Protocol Support**: Model Context Protocol handlers for AI agents
- **REST API**: RESTful endpoints for facts, relations, cards, categories, and webhooks
- **OAuth 2.0 Authentication**: Support for Google, GitHub, and custom OAuth providers
- **API Key Authentication**: Support for API key-based authentication
- **Swagger Documentation**: Interactive API documentation at `/docs`

## Environment Variables

### Required

- `ARANGO_URL` - ArangoDB connection URL (default: `http://localhost:8529`)
- `ARANGO_DB_NAME` - Database name (default: `knowledgeplane`)
- `ARANGO_USER` - Database username (default: `root`)
- `ARANGO_PASSWORD` - Database password (default: empty string)

### Optional - Server Configuration

- `PORT` - Server port (default: `8080`)
- `HOST` - Server host (default: `0.0.0.0`)
- `NODE_ENV` - Environment mode (`development` or `production`)
- `LOG_LEVEL` - Logging level (default: `info`)

### Optional - Authentication

- `API_KEYS` - Comma-separated list of valid API keys (for backward compatibility)
- `SESSION_SECRET` - Secret key for session encryption (must be at least 32 characters, default: insecure dev key)

### Optional - OAuth Providers

#### Google OAuth
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

#### GitHub OAuth
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret

#### Custom OAuth (JWKS)
- `JWKS_URI` - JWKS endpoint URL for token verification
- `OAUTH_ISSUER` - OAuth issuer URL
- `OAUTH_AUDIENCE` - OAuth audience
- `OAUTH_PROVIDER` - Force specific provider (`google`, `github`, or custom)
- `JWT_SECRET` - JWT secret for token verification (development only)

### Optional - OAuth Configuration

- `OAUTH_REDIRECT_BASE_URL` - Base URL for OAuth redirects (default: `http://localhost:8080`)
- `OAUTH_SUCCESS_REDIRECT_URL` - URL to redirect after successful OAuth login (default: `http://localhost:5173`)

### Optional - AI/Embeddings

- `EMBEDDINGS_PROVIDER` - Embeddings provider (e.g., `openai`)
- `OPENAI_API_KEY` - OpenAI API key for embeddings and AI operations
- `OPENAI_MODEL` - OpenAI model to use (default: `gpt-4o`)

## Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment variables**:
Create a `.env.dev` file in the app directory:
```env
# Database
ARANGO_URL=http://localhost:8529
ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=root

# Server
PORT=8080
NODE_ENV=development
LOG_LEVEL=info

# Authentication
API_KEYS=dev-api-key-1,dev-api-key-2
SESSION_SECRET=your-secret-key-at-least-32-characters-long

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# OAuth Configuration
OAUTH_REDIRECT_BASE_URL=http://localhost:8080
OAUTH_SUCCESS_REDIRECT_URL=http://localhost:3000

# AI/Embeddings (optional)
EMBEDDINGS_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o
```

3. **Ensure database is running**:
The server requires an ArangoDB instance to be running and accessible.

4. **Run database migrations** (if needed):
See the root `infra/migrations/` directory for migration scripts.

## Running

### Development

```bash
npm run dev
```

This runs the server in watch mode with hot reload. The server will be available at `http://localhost:8080`.

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

## API Documentation

Once the server is running, interactive API documentation is available at:
- Swagger UI: `http://localhost:8080/docs`

## Authentication

### API Key Authentication

Include the API key in the `knowledgeplane-key` header:
```bash
curl -H "knowledgeplane-key: your-api-key" http://localhost:8080/mcp/facts/search
```

### OAuth Bearer Token

Include the OAuth token in the `Authorization` header:
```bash
curl -H "Authorization: Bearer your-oauth-token" http://localhost:8080/mcp/facts/search
```

Supported OAuth providers:
- Google (ID tokens and access tokens)
- GitHub (access tokens)
- Custom providers via JWKS

## OAuth Endpoints

### Google OAuth
- Login: `GET /auth/google`
- Callback: `GET /auth/google/callback`
- MCP Session: `GET /auth/google?mcp=true`

### GitHub OAuth
- Login: `GET /auth/github`
- Callback: `GET /auth/github/callback`
- MCP Session: `GET /auth/github?mcp=true`

## MCP Protocol

The server implements the Model Context Protocol with the following tools:
- `facts.write` - Write facts to the knowledge base
- `facts.search` - Search facts
- `facts.update` - Update existing facts
- `facts.trash` - Trash facts
- `facts.bulkwrite` - Bulk write facts
- `knowledgecontexts.list` - List knowledge contexts
- `files.upload` - Upload files

## Health Check

Check server health:
```bash
curl http://localhost:8080/health
```

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Dependencies

- `fastify` - Web framework
- `@knowledgeplane/db` - Database models and connection
- `@knowledgeplane/file-processor` - File processing utilities
- `@modelcontextprotocol/sdk` - MCP SDK
- `@fastify/oauth2` - OAuth 2.0 support
- `@fastify/swagger` - API documentation
