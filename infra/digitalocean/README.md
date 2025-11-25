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
   - **Routes:** `/mcp`
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

For each service, add these environment variables in App Platform dashboard:

#### Common (All Services)
```
ARANGO_URL=http://your-droplet-ip:8529
# Or for VPC: http://10.x.x.x:8529

ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=your-secure-password
```

#### MCP Server Specific
```
NODE_ENV=production
PORT=8080
SESSION_SECRET=generate-with-openssl-rand-base64-32
API_KEYS=your-api-key-here
OAUTH_REDIRECT_BASE_URL=https://your-mcp-server-domain.com
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

#### Webapp Specific
```
NODE_ENV=production
NEXTAUTH_URL=https://your-webapp-domain.com
MCP_SERVER_URL=https://your-mcp-server-domain.com/mcp
MCP_SERVER_API_KEY=your-api-key-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

#### Background Workers Specific
```
NODE_ENV=production
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

### Using DigitalOcean Secrets (Recommended)

Instead of storing passwords in environment variables, use DigitalOcean App Platform Secrets:

1. Go to App Platform → Settings → App-Level Environment Variables
2. Click "Create Secret"
3. Add secrets for:
   - `ARANGO_PASSWORD`
   - `SESSION_SECRET`
   - `API_KEYS`
   - `OPENAI_API_KEY`
   - OAuth credentials
   - etc.

4. Reference secrets in your app spec:
   ```yaml
   envs:
     - key: ARANGO_PASSWORD
       scope: RUN_TIME
       type: SECRET
   ```

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

