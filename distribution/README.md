# KnowledgePlane Distribution Package

Welcome! This package contains everything you need to deploy KnowledgePlane for your organization.

## What's Included

- `docker-compose.yml` - Complete system configuration
- `env.example` - Configuration template with all required settings
- `README.md` - This documentation

## Quick Start

### Step 1: Extract the Package

```bash
tar -xzf knowledgeplane-distribution-latest.tar.gz
cd knowledgeplane-distribution-latest
```

### Step 2: Configure Environment

```bash
cp env.example .env
# Edit .env with your settings (see Configuration section below)
```

### Step 3: Deploy

```bash
docker compose up -d
```

### Step 4: Verify

```bash
# Check service status
docker compose ps

# View logs
docker compose logs -f
```

## Configuration

All configuration is done via environment variables in the `.env` file. Copy `env.example` to `.env` and fill in your values.

### Required Settings

1. **Database Password**
   ```bash
   ARANGO_PASSWORD=your-secure-password-here
   ```
   Generate with: `openssl rand -base64 24`

2. **Session Secret**
   ```bash
   SESSION_SECRET=your-session-secret-here
   ```
   Generate with: `openssl rand -base64 32`

3. **API Keys**
   ```bash
   API_KEYS=your-api-key-here
   MCP_SERVER_API_KEY=your-api-key-here
   ```
   Generate with: `openssl rand -hex 16`

4. **Your Domain URLs**
   ```bash
   OAUTH_REDIRECT_BASE_URL=https://knowledge.yourcompany.com
   MCP_SERVER_URL=https://mcp.yourcompany.com
   ```

5. **OAuth Credentials** (at least one provider required)
   ```bash
   # Google OAuth
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   
   # OR GitHub OAuth
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   ```

6. **AI provider API keys** (for the providers your workspaces use)
   ```bash
   OPENAI_API_KEY=your-openai-api-key
   ANTHROPIC_API_KEY=your-anthropic-api-key
   GOOGLE_API_KEY=your-google-api-key
   ```

### Optional Settings

- `ARANGO_DB_NAME` - Database name (default: `knowledgeplane`)
- `ARANGO_USER` - Database user (default: `root`)
- `MCP_SERVER_PORT` - MCP server port (default: `8080`)
- `WEBAPP_PORT` - Webapp port (default: `3000`)
- `OPENAI_EMBEDDING_MODEL` - Embedding model (default: `text-embedding-3-small`)
- `GOOGLE_EMBEDDING_MODEL` - Google embedding model (default: `text-embedding-004`)
- `UPLOADS_DIR` - File upload directory (default: `./uploads`)
- `DOCKER_REGISTRY` - Docker Hub registry (default: `knowledgeplane`)
- `IMAGE_VERSION` - Image version tag (default: `latest`)

## OAuth Setup

After configuring `.env`, set up OAuth applications:

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Application type: Web application
6. Authorized redirect URIs: `https://yourdomain.com/auth/google/callback`
7. Copy Client ID and Client Secret to `.env`

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Application name: KnowledgePlane (or your choice)
4. Homepage URL: `https://yourdomain.com`
5. Authorization callback URL: `https://yourdomain.com/auth/github/callback`
6. Copy Client ID and Client Secret to `.env`

## Accessing Your Deployment

Once deployed, access:
- **Web Dashboard**: `https://yourdomain.com` (or `http://localhost:3000` for local testing)
- **MCP Server**: `https://yourdomain.com/mcp` (or `http://localhost:8080/mcp` for local testing)
- **Health Check**: `https://yourdomain.com/health`

## Infrastructure Requirements

### Minimum Requirements

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **Disk Space**: At least 10GB free (for database and images)
- **Memory**: At least 4GB RAM (8GB recommended)
- **CPU**: 2+ cores recommended

### Network Requirements

- Ports that need to be accessible:
  - `3000` - Webapp (or configure `WEBAPP_PORT`)
  - `8080` - MCP Server (or configure `MCP_SERVER_PORT`)
  - `8529` - ArangoDB (internal only, not exposed by default)

### Production Considerations

For production deployments, consider:

1. **Reverse Proxy**: Use nginx, Traefik, or similar for HTTPS termination
2. **SSL Certificates**: Set up Let's Encrypt or your own certificates
3. **Firewall**: Only expose necessary ports (3000, 8080) and use reverse proxy
4. **Backup**: Set up regular database backups (see Backup section)
5. **Monitoring**: Set up health checks and monitoring
6. **Resource Limits**: Configure Docker resource limits in docker-compose.yml

## Updating

To update to a new version:

```bash
# Stop services
docker compose down

# Pull latest images
docker compose pull

# Start updated services
docker compose up -d
```

**Note:** Database data is preserved in volumes, so your data will remain intact after updates.

To update to a specific version, set `IMAGE_VERSION` in your `.env`:
```bash
IMAGE_VERSION=v1.0.0
```

## Health Checks

Verify your deployment:

```bash
# MCP Server health
curl http://localhost:8080/health

# Webapp (if accessible)
curl http://localhost:3000

# Check all services
docker compose ps
```

## Backup & Restore

### Backup Database

```bash
# Backup ArangoDB data volume
docker run --rm -v knowledgeplane_dbdata:/data -v $(pwd):/backup \
  alpine tar czf /backup/db-backup-$(date +%Y%m%d).tar.gz /data
```

### Restore Database

```bash
# Stop services
docker compose down

# Restore volume
docker run --rm -v knowledgeplane_dbdata:/data -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/db-backup-YYYYMMDD.tar.gz --strip-components=1"

# Start services
docker compose up -d
```

## Troubleshooting

### Services won't start

```bash
# Check logs
docker compose logs

# Verify environment variables
docker compose config

# Check if ports are in use
netstat -tulpn | grep -E ':(3000|8080|8529)'
```

### OAuth not working

- Verify redirect URLs match exactly (including `https://`)
- Check OAuth credentials in `.env`
- Ensure `OAUTH_REDIRECT_BASE_URL` is set correctly
- Review OAuth callback logs: `docker compose logs mcp-server | grep oauth`

### Database connection issues

```bash
# Check database status
docker compose ps db

# View database logs
docker compose logs db

# Verify password matches
docker compose exec db arangosh --server.password your-password
```

### Can't access services

- Verify ports are exposed: `docker compose ps`
- Check firewall rules
- Verify domain DNS points to your server
- For HTTPS, ensure SSL certificates are configured (use reverse proxy)

### Images not pulling

- Check internet connectivity
- Verify Docker Hub access: `docker pull knowledgeplane/mcp-server:latest`
- Check `DOCKER_REGISTRY` and `IMAGE_VERSION` in `.env`
- Ensure you're logged into Docker Hub if using private images

### AI features not working

- Verify API key is set correctly in `.env`
- Check AI provider logs: `docker compose logs background-workers`
- Ensure API key has sufficient credits/quota
- Verify model name is correct for your provider

## Security Best Practices

1. **Use strong passwords** - Generate secure passwords for all secrets
2. **Enable HTTPS** - Use a reverse proxy (nginx, Traefik) with SSL certificates
3. **Restrict database access** - Don't expose database port (8529) publicly
4. **Rotate secrets regularly** - Update API keys and passwords periodically
5. **Keep images updated** - Regularly pull Docker images for security patches
6. **Backup regularly** - Set up automated backups of the database volume
7. **Use environment variables** - Never commit `.env` file to version control
8. **Network isolation** - Use Docker networks to isolate services

## Next Steps

After deployment:

1. Access the web dashboard and complete onboarding
2. Create your first team
3. Invite team members
4. Start using KnowledgePlane!

## Support

For issues or questions:
- Check logs: `docker compose logs -f`
- Review configuration in `.env`
- Consult main documentation: [DEPLOYMENT.md](../DEPLOYMENT.md)
- Contact your KnowledgePlane support team

## Version Information

Check your running version:
```bash
docker compose exec mcp-server node -e "console.log(require('./package.json').version)"
```

To see which image versions are running:
```bash
docker compose images
```
