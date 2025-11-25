#!/bin/bash
# ArangoDB Setup Script for DigitalOcean Droplet
# This script sets up ArangoDB on a DigitalOcean Droplet for use with DigitalOcean Apps

set -e

echo "🚀 Setting up ArangoDB on DigitalOcean Droplet..."

# Configuration
ARANGO_VERSION="latest"
ARANGO_PASSWORD="${ARANGO_PASSWORD:-$(openssl rand -base64 24)}"
ARANGO_DB_NAME="${ARANGO_DB_NAME:-knowledgeplane}"
ARANGO_USER="${ARANGO_USER:-root}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Configuration:${NC}"
echo "  ArangoDB Version: ${ARANGO_VERSION}"
echo "  Database Name: ${ARANGO_DB_NAME}"
echo "  Database User: ${ARANGO_USER}"
echo "  Database Password: [HIDDEN]"
echo ""

# Update system
echo -e "${YELLOW}Updating system packages...${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    echo -e "${GREEN}Docker is already installed${NC}"
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    echo -e "${GREEN}Docker Compose is already installed${NC}"
fi

# Create directory for ArangoDB data
echo -e "${YELLOW}Creating ArangoDB data directory...${NC}"
sudo mkdir -p /var/lib/arangodb3
sudo chown -R 999:999 /var/lib/arangodb3

# Create docker-compose.yml for ArangoDB
echo -e "${YELLOW}Creating Docker Compose configuration...${NC}"
cat > /tmp/docker-compose-arangodb.yml <<EOF
version: '3.9'

services:
  arangodb:
    image: arangodb/arangodb:${ARANGO_VERSION}
    container_name: arangodb
    command: --experimental-vector-index
    environment:
      ARANGO_ROOT_PASSWORD: ${ARANGO_PASSWORD}
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
    networks:
      - arangodb-network

networks:
  arangodb-network:
    driver: bridge
EOF

# Start ArangoDB
echo -e "${YELLOW}Starting ArangoDB...${NC}"
cd /tmp
sudo docker-compose -f docker-compose-arangodb.yml up -d

# Wait for ArangoDB to be ready
echo -e "${YELLOW}Waiting for ArangoDB to be ready...${NC}"
for i in {1..30}; do
    if curl -f http://localhost:8529/_api/version &> /dev/null; then
        echo -e "${GREEN}ArangoDB is ready!${NC}"
        break
    fi
    echo "  Waiting... ($i/30)"
    sleep 2
done

# Configure firewall (UFW)
echo -e "${YELLOW}Configuring firewall...${NC}"
if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp  # SSH
    sudo ufw allow 8529/tcp  # ArangoDB
    echo -e "${YELLOW}Note: For DigitalOcean Apps, you may need to configure VPC firewall rules instead${NC}"
fi

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip)

# Display connection information
echo ""
echo -e "${GREEN}✅ ArangoDB setup complete!${NC}"
echo ""
echo "Connection Information:"
echo "  Public URL: http://${PUBLIC_IP}:8529"
echo "  Database Name: ${ARANGO_DB_NAME}"
echo "  Username: ${ARANGO_USER}"
echo "  Password: ${ARANGO_PASSWORD}"
echo ""
echo "For DigitalOcean Apps, use these environment variables:"
echo "  ARANGO_URL=http://${PUBLIC_IP}:8529"
echo "  ARANGO_DB_NAME=${ARANGO_DB_NAME}"
echo "  ARANGO_USER=${ARANGO_USER}"
echo "  ARANGO_PASSWORD=${ARANGO_PASSWORD}"
echo ""
echo -e "${YELLOW}⚠️  Security Notes:${NC}"
echo "  1. For production, configure VPC networking instead of public IP"
echo "  2. Set up firewall rules to only allow connections from DigitalOcean Apps"
echo "  3. Consider using SSL/TLS for encrypted connections"
echo "  4. Store the password securely (consider using DigitalOcean Secrets)"
echo ""
echo "To save credentials to a file:"
echo "  echo 'ARANGO_URL=http://${PUBLIC_IP}:8529' > arangodb-credentials.env"
echo "  echo 'ARANGO_DB_NAME=${ARANGO_DB_NAME}' >> arangodb-credentials.env"
echo "  echo 'ARANGO_USER=${ARANGO_USER}' >> arangodb-credentials.env"
echo "  echo 'ARANGO_PASSWORD=${ARANGO_PASSWORD}' >> arangodb-credentials.env"
echo ""
echo "To view logs:"
echo "  sudo docker logs -f arangodb"
echo ""
echo "To stop ArangoDB:"
echo "  sudo docker-compose -f /tmp/docker-compose-arangodb.yml down"
echo ""
echo "To restart ArangoDB:"
echo "  sudo docker-compose -f /tmp/docker-compose-arangodb.yml restart"

