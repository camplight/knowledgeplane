# DigitalOcean Deployment Guide

This guide covers deploying KnowledgePlane on DigitalOcean, including setting up ArangoDB on a Droplet and deploying apps on DigitalOcean App Platform.

## Architecture Overview

```
┌─────────────────────────────────────┐
│   DigitalOcean App Platform         │
│  ┌──────────┐  ┌──────────┐        │
│  │ webapp   │  │ mcp-server│        │
│  └────┬─────┘  └────┬──────┘        │
│       │             │                │
│  ┌────▼─────────────▼──────┐        │
│  │  background-workers      │        │
│  └──────────────────────────┘        │
└──────────────┬───────────────────────┘
               │
               │ (VPC or Public IP)
               │
┌──────────────▼───────────────────────┐
│   DigitalOcean Droplet               │
│  ┌─────────────────────────────┐    │
│  │      ArangoDB                │    │
│  │  (Port 8529)                 │    │
│  └─────────────────────────────┘    │
└──────────────────────────────────────┘
```

## Prerequisites

- DigitalOcean account
- DigitalOcean API token (for App Platform deployment)
- Domain name (optional, for custom domains)

## Step 1: Deploy ArangoDB on DigitalOcean Droplet

### Option A: Quick Setup Script

1. **Create a Droplet:**
   - Go to DigitalOcean Dashboard → Create → Droplets
   - Choose Ubuntu 22.04 LTS
   - Select size (minimum: 2GB RAM, 1 vCPU recommended)
   - Choose a datacenter region (same as your App Platform apps)
   - Add your SSH key
   - Create droplet

2. **SSH into the Droplet:**
   ```bash
   ssh root@your-droplet-ip
   ```

3. **Run the setup script:**
   ```bash
   # Download the setup script
   curl -O https://raw.githubusercontent.com/your-org/knowledgeplane/main/infra/digitalocean/arangodb-setup.sh
   chmod +x arangodb-setup.sh
   
   # Run with custom password (optional)
   ARANGO_PASSWORD=your-secure-password ./arangodb-setup.sh
   
   # Or let it generate a random password
   ./arangodb-setup.sh
   ```

4. **Save the connection credentials** displayed at the end of the script.

### Option B: Manual Setup

1. **Create a Droplet** (same as Option A)

2. **SSH into the Droplet:**
   ```bash
   ssh root@your-droplet-ip
   ```

3. **Install Docker:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   ```

4. **Install Docker Compose:**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

5. **Create data directory:**
   ```bash
   sudo mkdir -p /var/lib/arangodb3
   sudo chown -R 999:999 /var/lib/arangodb3
   ```

6. **Create docker-compose.yml:**
   ```bash
   cat > docker-compose.yml <<EOF
   version: '3.9'
   
   services:
     arangodb:
       image: arangodb/arangodb:latest
       container_name: arangodb
       command: --experimental-vector-index
       environment:
         ARANGO_ROOT_PASSWORD: your-secure-password-here
       ports:
         - "8529:8529"
       volumes:
         - /var/lib/arangodb3:/var/lib/arangodb3
       restart: unless-stopped
       healthcheck:
         test: ["CMD-SHELL", "curl -f http://localhost:8529/_api/version || exit 1"]
         interval: 5s
         timeout: 5s
         retries: 10
   EOF
   ```

7. **Start ArangoDB:**
   ```bash
   sudo docker-compose up -d
   ```

8. **Verify it's running:**
   ```bash
   curl http://localhost:8529/_api/version
   ```

### Configure Firewall

#### For Public IP Access (Less Secure)

```bash
# Allow ArangoDB port
sudo ufw allow 8529/tcp
sudo ufw enable

# Or restrict to DigitalOcean App Platform IPs (if known)
sudo ufw allow from 10.0.0.0/8 to any port 8529
```

#### For VPC Access (Recommended)

1. **Create a VPC** in DigitalOcean Dashboard
2. **Add Droplet to VPC** (Settings → Networking → VPC)
3. **Add App Platform apps to same VPC** (App Platform → Settings → VPC)
4. **Use VPC IP** instead of public IP in connection string

## Step 2: Deploy Apps on DigitalOcean App Platform

### Option A: Using App Spec (app-platform.yaml)

1. **Update `app-platform.yaml`:**
   - Replace `your-org/knowledgeplane` with your GitHub repo
   - Update region if needed
   - Set all SECRET environment variables in App Platform dashboard

#### Path-Based Routing Setup (No Custom Domain Required)

DigitalOcean assigns **one default domain** to your app (e.g., `https://knowledgeplane-xxxxx.ondigitalocean.app`). Both services share this domain but use different paths:
- **webapp**: `https://knowledgeplane-xxxxx.ondigitalocean.app/` (root path)
- **mcp-server**: `https://knowledgeplane-xxxxx.ondigitalocean.app/mcp`

**How it works:**
- App Platform routes `/mcp` to the mcp-server service
- App Platform strips the `/mcp` prefix by default, so mcp-server receives `/` internally
- The mcp-server is configured to handle both `/mcp` and `/` paths to support different routing scenarios

**After deployment:**
1. **Find your domain** in the App Platform dashboard:
   - Go to your app → The domain is shown at the top (e.g., `knowledgeplane-abc123.ondigitalocean.app`)

2. **Configure environment variables** using this domain:
   - `OAUTH_REDIRECT_BASE_URL` for mcp-server: `https://knowledgeplane-xxxxx.ondigitalocean.app`
   - `OAUTH_REDIRECT_BASE_URL` for webapp: `https://knowledgeplane-xxxxx.ondigitalocean.app`
   - `MCP_SERVER_URL` for webapp: `https://knowledgeplane-xxxxx.ondigitalocean.app`

**Note:** The MCP endpoint is accessible at `https://knowledgeplane-xxxxx.ondigitalocean.app/mcp`. The webapp will automatically append `/mcp` when making requests if you set `MCP_SERVER_URL` to the domain root.

#### Optional: Custom Domain Setup (Later)

If you want to use custom domains/subdomains later:
1. Add your domain in App Platform dashboard (Settings → Domains)
2. Configure DNS records as instructed by DigitalOcean
3. Uncomment and update the `domains` and `ingress` sections in `app-platform.yaml`
4. Update environment variables to use your custom domains

2. **Deploy via doctl:**
   ```bash
   doctl apps create --spec infra/digitalocean/app-platform.yaml
   ```

3. **Or deploy via Dashboard:**
   - Go to App Platform → Create App
   - Connect GitHub repository
   - Upload `app-platform.yaml` as app spec
   - Configure environment variables (see below)

### Option B: Manual Configuration via Dashboard

1. **Create App Platform App:**
   - Go to DigitalOcean Dashboard → App Platform → Create App
   - Connect your GitHub repository

2. **Add MCP Server Service:**
   - Click "Edit Components" → "Add Component" → "Service"
   - **Name:** `mcp-server`
   - **Source:** GitHub repo, branch `main`
   - **Root Directory:** `apps/mcp-server`
   - **Build Command:** `npm install && npm run build`
   - **Run Command:** `npm start`
   - **HTTP Port:** `8080`
   - **Routes:** `/` (MCP server runs on a separate domain)
   - **Health Check:** `/health`

3. **Add Webapp Service:**
   - Click "Add Component" → "Service"
   - **Name:** `webapp`
   - **Source:** GitHub repo, branch `main`
   - **Root Directory:** `apps/webapp`
   - **Build Command:** `npm install && npm run build`
   - **Run Command:** `npm start`
   - **HTTP Port:** `3000`
   - **Routes:** `/`

4. **Add Background Workers:**
   - Click "Add Component" → "Worker"
   - **Name:** `background-workers`
   - **Source:** GitHub repo, branch `main`
   - **Root Directory:** `apps/background-workers`
   - **Build Command:** `npm install && npm run build`
   - **Run Command:** `npm start`

### Configure Environment Variables

The `app-platform.yaml` file uses app-level environment variables for common configuration shared across all services. Configure these in the App Platform dashboard:

#### App-Level (Common to All Services)
These are configured once at the app level and shared by all services:

```
NODE_ENV=production
ARANGO_URL=http://your-droplet-ip:8529
# Or for VPC: http://10.x.x.x:8529

ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=your-secure-password

# OAuth (shared between webapp and mcp-server)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# AI Provider (shared across all services)
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

#### MCP Server Specific
These are configured only for the mcp-server service:

```
PORT=8080
SESSION_SECRET=generate-with-openssl-rand-base64-32
API_KEYS=your-api-key-here
OAUTH_REDIRECT_BASE_URL=https://your-mcp-server-domain.com
```

**Note:** With path-based routing, both services share the same domain. The MCP endpoint is accessible at `https://knowledgeplane-xxxxx.ondigitalocean.app/mcp`. Set `OAUTH_REDIRECT_BASE_URL` to the app's default domain (domain root, without `/mcp`).

#### Webapp Specific
These are configured only for the webapp service:

```
OAUTH_REDIRECT_BASE_URL=https://your-webapp-domain.com
MCP_SERVER_URL=https://your-mcp-server-domain.com
MCP_SERVER_API_KEY=your-api-key-here
```

**Note:** `MCP_SERVER_URL` should be the app's default domain (e.g., `https://knowledgeplane-xxxxx.ondigitalocean.app`). Use the domain root (without `/mcp`). The webapp will automatically append `/mcp` when making requests to the MCP endpoint.

#### Background Workers Specific
No service-specific environment variables needed (all inherited from app-level).

### Using DigitalOcean Secrets (Recommended)

Instead of storing passwords in environment variables, use DigitalOcean App Platform Secrets. Your `app-platform.yaml` already references secrets with `type: SECRET`, so you just need to create them in the App Platform dashboard.

#### Method 1: Via DigitalOcean Dashboard (Recommended)

1. **Navigate to your App:**
   - Go to [DigitalOcean Dashboard](https://cloud.digitalocean.com/apps)
   - Click on your KnowledgePlane app (or create it first using the app spec)

2. **Access Settings:**
   - Click on **Settings** tab in the left sidebar
   - Scroll down to **App-Level Environment Variables** section

3. **Create App-Level Secrets:**
   Click **"Create Secret"** for each app-level secret variable. These are shared across all services:

   **App-Level Secrets (Common to All Services):**

   **Database Secrets:**
   - `ARANGO_URL` - Your ArangoDB connection URL (e.g., `http://10.x.x.x:8529` for VPC or `http://your-droplet-ip:8529`)
   - `ARANGO_PASSWORD` - Your ArangoDB root password

   **OAuth Secrets (Shared between MCP Server & Webapp):**
   - `GOOGLE_CLIENT_ID` - From Google Cloud Console
   - `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
   - `GITHUB_CLIENT_ID` - From GitHub Developer Settings
   - `GITHUB_CLIENT_SECRET` - From GitHub Developer Settings

   **AI Provider Secrets (Shared across All Services):**
   - `OPENAI_API_KEY` - Your OpenAI API key

4. **Create Service-Level Secrets:**
   Navigate to each service component and add service-specific secrets:

   **MCP Server Service Secrets:**
   - `SESSION_SECRET` - Generate with: `openssl rand -base64 32`
   - `API_KEYS` - Generate with: `openssl rand -hex 16` (or comma-separated multiple keys)
   - `OAUTH_REDIRECT_BASE_URL` - App's default domain (e.g., `https://knowledgeplane-xxxxx.ondigitalocean.app`). Find this in the App Platform dashboard after deployment.

   **Webapp Service Secrets:**
   - `OAUTH_REDIRECT_BASE_URL` - App's default domain (e.g., `https://knowledgeplane-xxxxx.ondigitalocean.app`). Same domain as mcp-server since they share the domain.
   - `MCP_SERVER_URL` - App's default domain root (e.g., `https://knowledgeplane-xxxxx.ondigitalocean.app`). Use domain root without `/mcp`.
   - `MCP_SERVER_API_KEY` - Same value as `API_KEYS` from MCP server service

5. **For each secret:**
   - Enter the **Variable Name** (exactly as shown above, case-sensitive)
   - Enter the **Value**
   - Click **"Save"**

6. **Verify Secrets:**
   - App-level secrets will appear in the **App-Level Environment Variables** list
   - Service-level secrets will appear in each service's environment variables
   - All secrets will be marked as **"Secret"** type
   - You can edit or delete them later if needed

#### Method 2: Via doctl CLI

If you prefer using the command line:

```bash
# Install doctl if you haven't already
# macOS: brew install doctl
# Linux: See https://docs.digitalocean.com/reference/doctl/how-to/install/

# Authenticate
doctl auth init

# Get your app ID
doctl apps list

# Create secrets (replace APP_ID with your actual app ID)
doctl apps create-secret APP_ID \
  --name ARANGO_PASSWORD \
  --value "your-password-here"

doctl apps create-secret APP_ID \
  --name SESSION_SECRET \
  --value "$(openssl rand -base64 32)"

doctl apps create-secret APP_ID \
  --name API_KEYS \
  --value "$(openssl rand -hex 16)"

# Repeat for all other secrets...
```

#### Generate Secure Values

Before creating secrets, generate secure values:

```bash
# Session secret (32+ characters)
openssl rand -base64 32

# Database password
openssl rand -base64 24

# API key
openssl rand -hex 16

# Or use UUID for API keys
uuidgen
```

#### Important Notes

- **App-Level vs Component-Level:** Secrets created at the app level are available to all components (services and workers). This is recommended for shared secrets like `ARANGO_PASSWORD` and `OPENAI_API_KEY`.

- **Component-Specific Secrets:** If you need different values for different components, you can create component-level secrets by going to each component's settings.

- **Secret Names Must Match:** The secret names in the dashboard must exactly match the `key` values in your `app-platform.yaml` file (case-sensitive).

- **After Creating Secrets:** Once you create the secrets, DigitalOcean will automatically use them when deploying. You may need to trigger a new deployment or wait for the next automatic deployment.

- **Updating Secrets:** To update a secret value, go to Settings → App-Level Environment Variables, click on the secret, update the value, and save. This will trigger a new deployment.

#### Reference in App Spec

Your `app-platform.yaml` already references secrets correctly:
```yaml
envs:
  - key: ARANGO_PASSWORD
    scope: RUN_TIME
    type: SECRET
```

The `type: SECRET` tells App Platform to look for a secret with that name. If the secret doesn't exist, the deployment will fail, so make sure to create all required secrets before deploying.

#### Quick Reference: All Required Secrets Checklist

Use this checklist to ensure you've created all required secrets:

**✅ Database Secrets (All Services):**
- [ ] `ARANGO_URL` - ArangoDB connection URL
- [ ] `ARANGO_PASSWORD` - ArangoDB root password

**✅ Security Secrets:**
- [ ] `SESSION_SECRET` - Session encryption key (MCP Server only)
- [ ] `API_KEYS` - API authentication keys (MCP Server only)

**✅ OAuth Secrets (MCP Server & Webapp):**
- [ ] `GOOGLE_CLIENT_ID` - Google OAuth client ID
- [ ] `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- [ ] `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- [ ] `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret

**✅ MCP Server Service Specific:**
- [ ] `SESSION_SECRET` - Session encryption secret
- [ ] `API_KEYS` - API keys for authentication
- [ ] `OAUTH_REDIRECT_BASE_URL` - MCP server domain for OAuth callbacks

**✅ Webapp Service Specific:**
- [ ] `OAUTH_REDIRECT_BASE_URL` - OAuth redirect base URL (webapp domain)
- [ ] `MCP_SERVER_URL` - MCP server domain root (not `/mcp` path)
- [ ] `MCP_SERVER_API_KEY` - API key for MCP server authentication (same as `API_KEYS`)

**Total: 13 secrets** (9 app-level shared, 3 MCP server specific, 3 webapp specific)

> **Tip:** After deployment, DigitalOcean assigns one default domain to your app. Find this domain in the App Platform dashboard. Both services share this domain but use different paths (webapp at `/`, mcp-server at `/mcp`). Use the app's default domain (without `/mcp` path) for `OAUTH_REDIRECT_BASE_URL` and `MCP_SERVER_URL`. The webapp will automatically append `/mcp` when making requests.

## Step 3: Configure Networking

### VPC Configuration (Recommended)

1. **Create VPC:**
   - Go to Networking → VPCs → Create VPC
   - Choose same region as your Droplet and Apps

2. **Add Droplet to VPC:**
   - Go to Droplet → Settings → Networking
   - Select VPC and assign private IP

3. **Add Apps to VPC:**
   - Go to App Platform → Settings → VPC
   - Select the same VPC

4. **Update ARANGO_URL:**
   - Use private IP instead of public IP
   - Example: `http://10.0.0.5:8529`

### Firewall Rules

If using public IP, configure firewall on Droplet:

```bash
# Allow only DigitalOcean App Platform IPs (if known)
sudo ufw allow from 10.0.0.0/8 to any port 8529

# Or allow specific App Platform IPs
sudo ufw allow from <app-platform-ip> to any port 8529
```

## Step 4: Initialize Database

After deployment, initialize the database:

1. **Connect to ArangoDB:**
   ```bash
   # From your local machine or Droplet
   curl -X POST http://your-droplet-ip:8529/_api/database \
     -u root:your-password \
     -d '{"name":"knowledgeplane"}'
   ```

2. **Or use ArangoDB Web Interface:**
   - Visit `http://your-droplet-ip:8529`
   - Login with root credentials
   - Create database `knowledgeplane`

3. **The apps will auto-initialize** collections and indexes on first connection

## Step 5: Verify Deployment

1. **Check MCP Server:**
   ```bash
   curl https://your-mcp-server-domain.com/health
   ```

2. **Check Webapp:**
   ```bash
   curl https://your-webapp-domain.com
   ```

3. **Check ArangoDB:**
   ```bash
   curl http://your-droplet-ip:8529/_api/version
   ```

## Troubleshooting

### Connection Issues

**Problem:** Apps can't connect to ArangoDB

**Solutions:**
- Verify firewall rules allow connections from App Platform
- Check if using VPC, ensure all resources are in same VPC
- Verify ARANGO_URL is correct (public IP or VPC private IP)
- Check ArangoDB logs: `sudo docker logs arangodb`

### Database Initialization

**Problem:** Collections not created

**Solutions:**
- Check app logs in App Platform dashboard
- Verify ARANGO_PASSWORD is correct
- Ensure database exists: `curl http://your-droplet-ip:8529/_api/database -u root:password`
- Apps will auto-create database and collections on first connection

### Performance Issues

**Problem:** Slow queries or high latency

**Solutions:**
- Upgrade Droplet size (more RAM/CPU)
- Use VPC networking instead of public IP
- Check ArangoDB resource usage: `sudo docker stats arangodb`
- Monitor App Platform metrics

## Security Best Practices

1. **Use VPC Networking:** Keep database traffic private
2. **Use Secrets:** Store passwords in DigitalOcean Secrets, not environment variables
3. **Enable Firewall:** Restrict access to ArangoDB port
4. **Regular Backups:** Set up automated backups of `/var/lib/arangodb3`
5. **SSL/TLS:** Consider setting up SSL for ArangoDB (requires reverse proxy)
6. **Strong Passwords:** Use strong, randomly generated passwords

## Backup and Recovery

### Backup ArangoDB

```bash
# SSH into Droplet
ssh root@your-droplet-ip

# Create backup
sudo docker exec arangodb arangodump \
  --server.endpoint tcp://localhost:8529 \
  --server.username root \
  --server.password your-password \
  --server.database knowledgeplane \
  --output-directory /tmp/backup

# Copy backup off server
scp -r root@your-droplet-ip:/tmp/backup ./backup-$(date +%Y%m%d)
```

### Restore ArangoDB

```bash
# Copy backup to Droplet
scp -r ./backup root@your-droplet-ip:/tmp/backup

# Restore
sudo docker exec arangodb arangorestore \
  --server.endpoint tcp://localhost:8529 \
  --server.username root \
  --server.password your-password \
  --server.database knowledgeplane \
  --input-directory /tmp/backup
```

## Cost Estimation

- **Droplet (ArangoDB):** $12-24/month (2GB RAM, 1 vCPU)
- **App Platform (3 services):** ~$12-36/month (basic-xxs instances)
- **Total:** ~$24-60/month

## Next Steps

- Set up custom domains
- Configure SSL certificates
- Set up monitoring and alerts
- Configure automated backups
- Set up CI/CD for deployments

