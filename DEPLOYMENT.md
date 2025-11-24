# Deployment Guide

Quick deployment guide for KnowledgePlane. Choose the easiest option for your needs.

## Quick Deploy Options

### 🚀 Railway (Recommended - Easiest)

Railway automatically detects and deploys your apps with zero configuration.

**Steps:**

1. **Sign up**: https://railway.app (connect GitHub)

2. **Create Project** → "Deploy from GitHub repo" → Select your repository

3. **Add Database**:
   - Click "+ New" → "Database" → "Add ArangoDB"
   - Railway will provide connection URL automatically

4. **Add Services** (one at a time):
   
   **MCP Server:**
   - Click "+ New" → "GitHub Repo" → Select your repo
   - Set **Root Directory**: `apps/mcp-server`
   - Set **Start Command**: `npm start`
   - Add environment variables (see below)

   **Webapp:**
   - Click "+ New" → "GitHub Repo" → Select your repo  
   - Set **Root Directory**: `apps/webapp`
   - Set **Start Command**: `npm start`
   - Add environment variables (see below)

   **Background Workers:**
   - Click "+ New" → "GitHub Repo" → Select your repo
   - Set **Root Directory**: `apps/background-workers`
   - Set **Start Command**: `npm start`
   - Add environment variables (see below)

5. **Set Environment Variables** (for each service):

   Railway will auto-inject database variables. Add these:

   **MCP Server:**
   ```
   NODE_ENV=production
   PORT=8080
   SESSION_SECRET=<generate-random-32-chars>
   API_KEYS=<your-api-key>
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>
   GITHUB_CLIENT_ID=<your-github-client-id>
   GITHUB_CLIENT_SECRET=<your-github-client-secret>
   OAUTH_REDIRECT_BASE_URL=https://your-mcp-server.railway.app
   OPENAI_API_KEY=<your-openai-key>
   ```

   **Webapp:**
   ```
   NODE_ENV=production
   NEXTAUTH_URL=https://your-webapp.railway.app
   MCP_SERVER_URL=https://your-mcp-server.railway.app/mcp
   MCP_SERVER_API_KEY=<same-as-api-keys-above>
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>
   GITHUB_CLIENT_ID=<your-github-client-id>
   GITHUB_CLIENT_SECRET=<your-github-client-secret>
   OPENAI_API_KEY=<your-openai-key>
   ```

   **Background Workers:**
   ```
   NODE_ENV=production
   OPENAI_API_KEY=<your-openai-key>
   AI_PROVIDER=openai
   ```

6. **Generate Secrets**:
   ```bash
   # Generate session secret
   openssl rand -base64 32
   ```

7. **Update OAuth Redirect URLs**:
   - Google: Add `https://your-mcp-server.railway.app/auth/google/callback`
   - GitHub: Add `https://your-mcp-server.railway.app/auth/github/callback`

8. **Deploy**: Railway auto-deploys on git push! 🎉

---

### 🎨 Render

Similar to Railway, but with more manual configuration.

**Steps:**

1. **Sign up**: https://render.com

2. **Create Web Service** (for MCP Server):
   - Connect GitHub repo
   - **Root Directory**: `apps/mcp-server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
   - Add environment variables (same as Railway above)

3. **Create Web Service** (for Webapp):
   - Connect same GitHub repo
   - **Root Directory**: `apps/webapp`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
   - Add environment variables

4. **Create Background Worker**:
   - Connect same GitHub repo
   - **Root Directory**: `apps/background-workers`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
   - Add environment variables

5. **Add Database**:
   - Create new "PostgreSQL" service (or use external ArangoDB)
   - Update `ARANGO_URL` in all services

6. **Deploy**: Render auto-deploys on git push

---

### 🐳 Docker Compose (VPS)

For Digital Ocean, AWS EC2, or any VPS with Docker.

**Quick Setup:**

```bash
# 1. Clone repo
git clone <your-repo> /opt/knowledgeplane
cd /opt/knowledgeplane

# 2. Create .env files
cp .env.example .env
# Edit .env with production values

# 3. Set strong passwords
export ARANGO_PASSWORD=$(openssl rand -base64 24)
export SESSION_SECRET=$(openssl rand -base64 32)

# 4. Deploy
docker compose -f infra/docker-compose.prod.yml up -d

# 5. Check status
docker compose -f infra/docker-compose.prod.yml ps
docker compose -f infra/docker-compose.prod.yml logs -f
```

**Production Environment Variables:**

Create `.env.production` files in each app directory:

**Root `.env`:**
```env
NODE_ENV=production
ARANGO_URL=http://db:8529
ARANGO_PASSWORD=<strong-password>
SESSION_SECRET=<32-char-secret>
OAUTH_REDIRECT_BASE_URL=https://yourdomain.com
```

**apps/mcp-server/.env.production:**
```env
NODE_ENV=production
PORT=8080
ARANGO_URL=http://db:8529
ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=${ARANGO_PASSWORD}
OAUTH_REDIRECT_BASE_URL=https://yourdomain.com
SESSION_SECRET=${SESSION_SECRET}
# ... add OAuth and API keys
```

**apps/webapp/.env.production:**
```env
NODE_ENV=production
NEXTAUTH_URL=https://yourdomain.com
MCP_SERVER_URL=https://yourdomain.com/mcp
# ... add other variables
```

**With Nginx Reverse Proxy:**

If using a domain, set up Nginx:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /mcp {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Get SSL certificate:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Required Environment Variables

### All Services Need:
- `ARANGO_URL` - Database connection URL
- `ARANGO_DB_NAME` - Database name (usually `knowledgeplane`)
- `ARANGO_USER` - Database user (usually `root`)
- `ARANGO_PASSWORD` - Database password

### MCP Server Needs:
- `PORT=8080`
- `SESSION_SECRET` - Random 32+ character string
- `API_KEYS` - Comma-separated API keys
- `OAUTH_REDIRECT_BASE_URL` - Your public URL
- OAuth credentials (Google/GitHub)
- `OPENAI_API_KEY` (for AI features)

### Webapp Needs:
- `NEXTAUTH_URL` - Your webapp public URL
- `MCP_SERVER_URL` - Full URL to MCP server (e.g., `https://mcp.example.com/mcp`)
- `MCP_SERVER_API_KEY` - Same as API_KEYS above
- OAuth credentials (Google/GitHub)
- `OPENAI_API_KEY` (for chat features)

### Background Workers Need:
- `OPENAI_API_KEY` - Required for embeddings and consolidation

---

## Generate Secure Secrets

```bash
# Session secret (32+ characters)
openssl rand -base64 32

# Database password
openssl rand -base64 24

# API key (or use a UUID)
openssl rand -hex 16
```

---

## OAuth Setup

After deployment, update your OAuth apps:

**Google OAuth:**
1. Go to https://console.cloud.google.com/
2. Edit your OAuth app
3. Add authorized redirect URI: `https://your-domain.com/auth/google/callback`

**GitHub OAuth:**
1. Go to https://github.com/settings/developers
2. Edit your OAuth app
3. Set callback URL: `https://your-domain.com/auth/github/callback`

---

## Health Checks

```bash
# MCP Server
curl https://your-domain.com/health

# Webapp
curl https://your-domain.com
```

---

## Troubleshooting

**Services won't start:**
- Check logs: `docker compose logs` or platform logs
- Verify environment variables are set correctly
- Check database connectivity

**OAuth not working:**
- Verify redirect URLs match exactly (including https://)
- Check OAuth app credentials
- Ensure `OAUTH_REDIRECT_BASE_URL` is set correctly

**Database connection issues:**
- Verify database is running
- Check connection URL format
- Ensure credentials match

---

## Recommended: Railway

Railway is the easiest option because:
- ✅ Zero configuration needed
- ✅ Auto-detects build settings
- ✅ Free tier available
- ✅ Automatic HTTPS
- ✅ Built-in database options
- ✅ Auto-deploys on git push

Start with Railway, then move to VPS if you need more control.
