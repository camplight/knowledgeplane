# Development Guide

This guide will help you set up KnowledgePlane for local development, including exposing your local server to the internet via ngrok for testing OAuth callbacks and MCP integrations.

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- ngrok account (free tier is sufficient)
- OAuth app credentials (Google and/or GitHub)

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd knowledgeplane
   npm run bootstrap
   ```

2. **Set up environment variables:**
   ```bash
   # Copy example environment files
   cp .env.example .env
   cp apps/mcp-server/.env.example apps/mcp-server/.env.dev
   cp apps/webapp/.env.example apps/webapp/.env.local
   cp apps/background-workers/.env.example apps/background-workers/.env.dev
   cp apps/rest-api/.env.example apps/rest-api/.env.dev
   
   # Edit .env files with your actual values
   ```

3. **Start everything:**
   ```bash
   npm run dev
   ```

   This will:
   - Start ArangoDB in Docker (port 8529)
   - Start MCP server (port 8080)
   - Start webapp (port 3000)
   - Start background workers
   - Wait for database to be ready before starting services

4. **Set up ngrok (in a separate terminal):**
   ```bash
   # Install ngrok if you haven't already
   # macOS: brew install ngrok
   # Or download from https://ngrok.com/download
   
   # Authenticate (one-time setup)
   ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
   
   # Start ngrok tunnel pointing to port 8080 (MCP server)
   ngrok http 8080
   ```

   ngrok will display a public URL like `https://abc123.ngrok.io` that forwards to your localhost:8080.

5. **Update OAuth redirect URLs:**
   - **Google OAuth**: Update your Google Cloud Console OAuth app with redirect URI: `https://YOUR_NGROK_URL/auth/google/callback`
   - **GitHub OAuth**: Update your GitHub OAuth app with callback URL: `https://YOUR_NGROK_URL/auth/github/callback`
   - Update `OAUTH_REDIRECT_BASE_URL` in your `.env` files to use the ngrok URL

6. **Update environment variables with ngrok URL:**
   ```bash
   # In .env (root)
   OAUTH_REDIRECT_BASE_URL=https://YOUR_NGROK_URL
   
   # In apps/mcp-server/.env.dev
   OAUTH_REDIRECT_BASE_URL=https://YOUR_NGROK_URL
   
   # In apps/webapp/.env.local
   MCP_SERVER_URL=https://YOUR_NGROK_URL/mcp
   # OR
   MCP_SERVER_HOST=YOUR_NGROK_DOMAIN.ngrok.io
   MCP_SERVER_PROTOCOL=https
   ```

## Environment Variables

### Root `.env`

Key variables needed at the root level:

```env
# Database (shared across all apps)
ARANGO_URL=http://localhost:8529
ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=root

# OAuth (for MCP server and webapp)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# AI Provider
OPENAI_API_KEY=your-openai-api-key
AI_PROVIDER=openai

# Session Security
SESSION_SECRET=your-random-secret-at-least-32-characters-long

# API Keys
API_KEYS=DEV_API_KEY

# OAuth Redirects (use ngrok URL for localhost development)
OAUTH_REDIRECT_BASE_URL=https://YOUR_NGROK_URL
OAUTH_SUCCESS_REDIRECT_URL=http://localhost:3000
```

### MCP Server (`apps/mcp-server/.env.dev`)

```env
ARANGO_URL=http://localhost:8529
ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=root
PORT=8080
OAUTH_REDIRECT_BASE_URL=https://YOUR_NGROK_URL
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
SESSION_SECRET=your-random-secret-at-least-32-characters-long
API_KEYS=DEV_API_KEY
OPENAI_API_KEY=your-openai-api-key
```

### Webapp (`apps/webapp/.env.local`)

```env
ARANGO_URL=http://localhost:8529
ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=root
OAUTH_REDIRECT_BASE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
MCP_SERVER_URL=https://YOUR_NGROK_URL/mcp
MCP_SERVER_API_KEY=DEV_API_KEY
OPENAI_API_KEY=your-openai-api-key
```

### Background Workers (`apps/background-workers/.env.dev`)

```env
ARANGO_URL=http://localhost:8529
ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=root
OPENAI_API_KEY=your-openai-api-key
AI_PROVIDER=openai
```

## Setting Up OAuth Apps

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Add authorized redirect URIs:
   - `http://localhost:8080/auth/google/callback` (for localhost)
   - `https://YOUR_NGROK_URL/auth/google/callback` (for ngrok)
6. Copy Client ID and Client Secret to your `.env` files

### GitHub OAuth

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Set:
   - Application name: KnowledgePlane (or your choice)
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `https://YOUR_NGROK_URL/auth/github/callback`
4. Copy Client ID and Client Secret to your `.env` files

## ngrok Setup

### Why ngrok?

ngrok is needed for:
- OAuth callbacks (Google/GitHub need public URLs)
- Testing MCP integrations with external tools
- Sharing your local development environment

### Installation

```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### Authentication

1. Sign up at https://ngrok.com (free account works)
2. Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
3. Authenticate:
   ```bash
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```

### Running ngrok

```bash
# Basic usage (random URL each time)
ngrok http 8080

# With custom domain (requires paid plan)
ngrok http 8080 --domain=your-domain.ngrok.io
```

### Persistent ngrok Configuration

For a more stable development setup, you can configure ngrok to use a reserved domain (requires paid plan) or use environment variables:

```bash
# In your shell profile (.zshrc, .bashrc, etc.)
export NGROK_AUTHTOKEN=your-authtoken
export NGROK_DOMAIN=your-domain.ngrok.io  # Optional, for paid plans
```

Then create a simple script to start ngrok:

```bash
#!/bin/bash
# scripts/start-ngrok.sh
ngrok http 8080 --domain=${NGROK_DOMAIN:-} --log=stdout
```

## Development Workflow

1. **Start infrastructure:**
   ```bash
   npm run dev:infra  # Starts ArangoDB in Docker
   ```

2. **Start services (in separate terminals or use npm run dev):**
   ```bash
   # Terminal 1: MCP Server
   npm run dev:mcp-server
   
   # Terminal 2: Webapp
   npm run dev:webapp
   
   # Terminal 3: Background Workers
   npm run dev:background-workers
   
   # Terminal 4: ngrok
   ngrok http 8080
   ```

   Or use the combined command:
   ```bash
   npm run dev  # Starts everything concurrently
   ```

3. **Access services:**
   - Webapp: http://localhost:3000
   - MCP Server: http://localhost:8080
   - MCP Server (via ngrok): https://YOUR_NGROK_URL
   - ArangoDB: http://localhost:8529
   - Swagger Docs: http://localhost:8080/docs

4. **Stop services:**
   ```bash
   npm run dev:stop  # Stops Docker containers
   # Press Ctrl+C in other terminals to stop services
   ```

## Troubleshooting

### Database Connection Issues

- Ensure Docker is running
- Check that ArangoDB is healthy: `docker ps`
- Verify connection: `curl http://localhost:8529/_api/version`

### OAuth Callback Issues

- Ensure ngrok is running and pointing to port 8080
- Verify OAuth redirect URLs match your ngrok URL exactly
- Check that `OAUTH_REDIRECT_BASE_URL` is set correctly in all `.env` files

### Port Conflicts

- MCP Server: 8080
- Webapp: 3000
- ArangoDB: 8529
- REST API: 8081

If ports are in use, either:
- Stop conflicting services
- Change ports in `.env` files and docker-compose.yml

### Environment Variables Not Loading

- Ensure `.env.dev` files are in the correct app directories
- For webapp, use `.env.local` (Next.js convention)
- Restart services after changing environment variables

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment instructions
- See [README.md](./README.md) for general project information
- See [docs/SPEC.md](./docs/SPEC.md) for detailed API and architecture documentation

