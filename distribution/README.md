# KnowledgePlane Distribution Package

Welcome! This package contains everything you need to deploy KnowledgePlane for your organization.

## What's Included

- `docker-compose.yml` - Complete system configuration
- `env.example` - Configuration template with all required settings
- `README.md` - This documentation

## Quick Start

### Step 1: Verify the signed bundle

The publisher signs `SHA256SUMS`. `kp-load.sh` checks that signature and refuses the bundle if any file differs. It also refuses image tag `latest`.

```bash
export KP_RELEASE_PUBKEY=./release-public.pem
./kp-load.sh --verify-only
```

### Step 2: Generate secrets on this server

```bash
./setup.sh
# Then set PUBLIC_HOST, IMAGE_VERSION, and one sign-in provider in .env
```

`setup.sh` writes the session secret, token signing key, and database passwords into `.env`. They stay on this machine.

### Step 3: Create the database user and load

```bash
./bootstrap-db.sh
./kp-load.sh
```

Caddy serves HTTPS for `PUBLIC_HOST`. The web app is `/`. The MCP server is `/mcp`. The database is not published.

### Step 4: Verify

```bash
docker compose ps
curl -fsS "https://$PUBLIC_HOST/health"
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

`setup.sh` fills the secrets below. Set the public host and a sign-in provider yourself.

1. **Database passwords**
   ```bash
   ARANGO_ROOT_PASSWORD=...
   ARANGO_PASSWORD=...
   ARANGO_USER=kp
   ```

2. **Session and token keys**
   ```bash
   SESSION_SECRET=...
   TOKEN_SIGNING_KEY=...
   ```
   `setup.sh` generates both. Connector access tokens are signed with `TOKEN_SIGNING_KEY`. The distribution compose file sets `ALLOW_SHARED_API_KEYS=false`, so a shared `API_KEYS` value cannot call MCP.

3. **Public URL**
   ```bash
   PUBLIC_HOST=knowledge.example.com
   APP_URL=https://knowledge.example.com
   MCP_SERVER_URL=https://knowledge.example.com/mcp
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

6. **AI Provider** (OpenAI or Anthropic)
   ```bash
   AI_PROVIDER=openai
   OPENAI_API_KEY=your-openai-api-key
   ```

### Optional Settings

- `ARANGO_DB_NAME` - Database name (default: `knowledgeplane`)
- `ARANGO_USER` - Database user (default: `root`)
- `MCP_SERVER_PORT` - MCP server port (default: `8080`)
- `WEBAPP_PORT` - Webapp port (default: `3000`)
- `AI_PROVIDER` - AI provider (`openai` or `anthropic`, default: `openai`)
- `OPENAI_MODEL` - AI model (default: `gpt-4o`)
- `OPENAI_EMBEDDING_MODEL` - Embedding model (default: `text-embedding-3-small`)
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

Updates are a new signed bundle. Verify it, then load it beside the running stack:

```bash
./kp-load.sh --verify-only
./backup.sh
# Set IMAGE_VERSION in .env to the version in VERSION
./kp-load.sh
curl -fsS "https://$PUBLIC_HOST/health"
```

Nothing pulls `:latest` on its own. Database data stays in the `dbdata` volume.

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

Nightly backups are an operator cron job, not something the app does by itself. Encrypt to at least two custodian certificates:

```bash
export CUSTODIAN_CERTS="./custodian-a.crt ./custodian-b.crt"
./backup.sh
```

Restore steps are in [RESTORE.md](RESTORE.md).

To copy facts out as Markdown plus the database records:

```bash
npx tsx scripts/kp-export.ts --out ./export --workspace <workspace-id>
```

Folder import, with a dry run first:

```bash
npx tsx scripts/kp-import.ts --dir ./notes --split heading --blocklist "codename"
npx tsx scripts/kp-import.ts --dir ./notes --workspace <id> --user <id> --apply
```

`--canonical` marks the imported facts canonical. That flag is for an admin running the command on the server. Search prefers those facts, and only an admin can change them.

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
