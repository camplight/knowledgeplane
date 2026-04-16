# Background Worker

Background worker service for KnowledgePlane that handles automated tasks like card consolidation and category organization.

## Overview

This service runs background workers that:
- **Card Consolidator**: Automatically consolidates related facts into knowledge cards using AI
- **Category Organizer**: Organizes cards into hierarchical categories using AI

## Environment Variables

Workers run in a **separate Node process** from the Next.js webapp. They load, in order:

1. Repository root `.env`
2. `apps/background-workers/.env.dev`

Put API keys here (or in root `.env`) even if you already set them in `apps/webapp/.env.local`. Otherwise workspace features that use Google/OpenAI/Anthropic in **card consolidation**, **embeddings**, or **data-source scripts** will fail with “API key required”.

### Required

- `ARANGO_URL` - ArangoDB connection URL (default: `http://localhost:8529`)
- `ARANGO_DB_NAME` - Database name (default: `knowledgeplane`)
- `ARANGO_USER` - Database username (default: `root`)
- `ARANGO_PASSWORD` - Database password (default: empty string)

### AI keys (set the ones your workspaces use)

- `OPENAI_API_KEY` - When any workspace uses OpenAI
- `ANTHROPIC_API_KEY` - When any workspace uses Anthropic
- `GOOGLE_API_KEY` - When any workspace uses Google/Gemini (aliases: `GEMINI_API_KEY`, `Google_API_KEY`)

### Optional

- `OPENAI_EMBEDDING_MODEL` / `GOOGLE_EMBEDDING_MODEL` - Embedding models when using those providers
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
OPENAI_API_KEY=your-openai-api-key
GOOGLE_API_KEY=your-google-api-key
```

3. **Ensure database is running**:
The worker requires an ArangoDB instance to be running and accessible.

## Running

### Development

```bash
npm run dev
```

This runs the worker in watch mode with hot reload.

### Production

1. **Build the application**:
```bash
npm run build
```

2. **Start the worker**:
```bash
npm start
```

### Docker

The worker can be run using Docker Compose. See the root `infra/docker-compose.yml` for configuration.

## Workers

### Card Consolidator

- **Interval**: Runs every 5 minutes
- **Purpose**: Finds unconsolidated facts and groups them into knowledge cards
- **Process**:
  1. Finds facts not yet in any card
  2. Groups facts by knowledge context
  3. Uses graph traversal to find related facts
  4. Uses AI to consolidate related facts into a card
  5. Creates or updates cards with consolidated content

### Category Organizer

- **Interval**: Runs every 30 minutes
- **Purpose**: Organizes uncategorized cards into hierarchical categories
- **Process**:
  1. Finds cards without categories
  2. Groups cards by knowledge context
  3. Uses AI to suggest a category structure
  4. Creates categories and assigns cards to them

## Graceful Shutdown

The worker handles `SIGTERM` and `SIGINT` signals for graceful shutdown, stopping all workers before exiting.

## Logging

The worker logs to stdout with information about:
- Worker startup and shutdown
- Processing status
- Errors and warnings

## Dependencies

- `@knowledgeplane/db` - Database models and connection
- `@knowledgeplane/aimodel` - AI model client for OpenAI integration

