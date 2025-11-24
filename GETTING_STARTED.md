# Getting Started with KnowledgePlane

Welcome to KnowledgePlane! This guide will help you get started with local development and cloud deployment.

## Quick Links

- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Complete localhost development setup with ngrok
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Quick cloud deployment (Railway recommended - easiest!)
- **[ENV_SETUP.md](./ENV_SETUP.md)** - Environment variables configuration
- **[docs/SPEC.md](./docs/SPEC.md)** - Complete API and architecture documentation

## Quick Start (5 minutes)

### 1. Clone and Install

```bash
git clone <repository-url>
cd knowledgeplane
npm run bootstrap
```

### 2. Set Up Environment Variables

```bash
# Run the setup script
./scripts/setup-env.sh

# Or manually create .env files (see ENV_SETUP.md)
```

### 3. Configure OAuth (Optional but Recommended)

1. Set up Google OAuth app: https://console.cloud.google.com/
2. Set up GitHub OAuth app: https://github.com/settings/developers
3. Add credentials to your `.env` files

### 4. Start Development Servers

```bash
# Start all services
npm run dev

# In a separate terminal, start ngrok for OAuth callbacks
./scripts/start-ngrok.sh 8080
```

### 5. Access Services

- **Webapp**: http://localhost:3000
- **MCP Server**: http://localhost:8080
- **MCP Server (via ngrok)**: https://your-ngrok-url.ngrok.io
- **Swagger Docs**: http://localhost:8080/docs
- **ArangoDB**: http://localhost:8529

## What Gets Started

When you run `npm run dev`, the following services start:

1. **ArangoDB** (Docker) - Graph database on port 8529
2. **MCP Server** - Fastify server on port 8080
3. **Webapp** - Next.js application on port 3000
4. **Background Workers** - Card consolidation and embeddings generation

## ngrok Setup (Required for OAuth)

ngrok is needed to expose your localhost server to the internet for OAuth callbacks.

1. **Install ngrok:**
   ```bash
   brew install ngrok  # macOS
   # Or download from https://ngrok.com/download
   ```

2. **Get authtoken:**
   - Sign up at https://ngrok.com (free account works)
   - Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken

3. **Authenticate:**
   ```bash
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```

4. **Start tunnel:**
   ```bash
   ./scripts/start-ngrok.sh 8080
   # Or manually: ngrok http 8080
   ```

5. **Update environment variables:**
   - Set `OAUTH_REDIRECT_BASE_URL` to your ngrok URL
   - Set `MCP_SERVER_URL` to `https://your-ngrok-url.ngrok.io/mcp`
   - Update OAuth app redirect URIs to use ngrok URL

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed ngrok setup.

## Environment Variables

Each app needs its own environment file:

- **Root**: `.env`
- **MCP Server**: `apps/mcp-server/.env.dev`
- **Webapp**: `apps/webapp/.env.local`
- **Background Workers**: `apps/background-workers/.env.dev`
- **REST API**: `apps/rest-api/.env.dev`

See [ENV_SETUP.md](./ENV_SETUP.md) for complete environment variable documentation.

## Common Issues

### Port Already in Use

If ports 3000, 8080, or 8529 are in use:
- Stop conflicting services
- Or change ports in `.env` files and `docker-compose.dev.yml`

### OAuth Callbacks Not Working

- Ensure ngrok is running and pointing to port 8080
- Verify OAuth redirect URLs match your ngrok URL exactly
- Check that `OAUTH_REDIRECT_BASE_URL` is set correctly

### Database Connection Issues

- Ensure Docker is running
- Check ArangoDB is healthy: `docker ps`
- Verify connection: `curl http://localhost:8529/_api/version`

## Next Steps

- **Local Development**: Read [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed setup
- **Production Deployment**: Read [DEPLOYMENT.md](./DEPLOYMENT.md) for cloud deployment
- **API Documentation**: See [docs/SPEC.md](./docs/SPEC.md) for complete API reference

## Need Help?

- Check the troubleshooting sections in [DEVELOPMENT.md](./DEVELOPMENT.md) and [DEPLOYMENT.md](./DEPLOYMENT.md)
- Review environment variable setup in [ENV_SETUP.md](./ENV_SETUP.md)
- See API documentation in [docs/SPEC.md](./docs/SPEC.md)

