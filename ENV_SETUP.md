# Environment Variables Setup

This document explains how to set up environment variables for KnowledgePlane.

## Quick Setup

Run the setup script to create environment files from examples:

```bash
./scripts/setup-env.sh
```

This will create:
- `.env` (root)
- `apps/mcp-server/.env.dev`
- `apps/webapp/.env.local`
- `apps/background-workers/.env.dev`
- `apps/rest-api/.env.dev`

## Manual Setup

If the script doesn't work or you prefer manual setup, copy the example files:

```bash
# Root
cp .env.example .env

# MCP Server
cp apps/mcp-server/.env.example apps/mcp-server/.env.dev

# Webapp
cp apps/webapp/.env.example apps/webapp/.env.local

# Background Workers
cp apps/background-workers/.env.example apps/background-workers/.env.dev

# REST API
cp apps/rest-api/.env.example apps/rest-api/.env.dev
```

## Environment File Locations

Each app uses different environment file names based on conventions:

- **MCP Server**: `.env.dev` (development) or `.env.production` (production)
- **Webapp**: `.env.local` (development) or `.env.production` (production) - Next.js convention
- **Background Workers**: `.env.dev` (development) or `.env.production` (production)
- **REST API**: `.env.dev` (development) or `.env.production` (production)

## Required Variables

See the example files (`.env.example`) in each directory for complete lists of required and optional variables.

### Minimum Required for Development

**Root `.env`:**
- `ARANGO_URL`, `ARANGO_DB_NAME`, `ARANGO_USER`, `ARANGO_PASSWORD`
- `SESSION_SECRET` (at least 32 characters)
- `API_KEYS` (for development, can be `DEV_API_KEY`)

**MCP Server (`apps/mcp-server/.env.dev`):**
- Database variables (same as root)
- `PORT=8080`
- `OAUTH_REDIRECT_BASE_URL` (use ngrok URL for localhost: `https://your-ngrok-url.ngrok.io`)

**Webapp (`apps/webapp/.env.local`):**
- Database variables (same as root)
- `NEXTAUTH_URL=http://localhost:3000`
- `MCP_SERVER_URL` (use ngrok URL for localhost: `https://your-ngrok-url.ngrok.io/mcp`)

**Background Workers (`apps/background-workers/.env.dev`):**
- Database variables (same as root)
- `OPENAI_API_KEY` (for embeddings and card consolidation)

## ngrok Configuration

For localhost development, you need ngrok to expose port 8080 for OAuth callbacks.

1. Install ngrok: `brew install ngrok` (macOS) or download from https://ngrok.com
2. Get authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
3. Authenticate: `ngrok config add-authtoken YOUR_AUTHTOKEN`
4. Start tunnel: `./scripts/start-ngrok.sh 8080` or `ngrok http 8080`
5. Update `OAUTH_REDIRECT_BASE_URL` and `MCP_SERVER_URL` with your ngrok URL

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed ngrok setup instructions.

## Production Variables

For production, use `.env.production` files and ensure:
- `NODE_ENV=production`
- Strong, random `SESSION_SECRET` (32+ characters)
- Strong database password
- Production OAuth credentials
- HTTPS URLs for all redirects

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment instructions.

