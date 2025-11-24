#!/bin/bash
# Setup script for KnowledgePlane development environment
# This script helps set up environment files from examples

set -e

echo "🚀 KnowledgePlane Development Setup"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env files already exist
check_and_copy() {
    local source=$1
    local dest=$2
    
    if [ -f "$dest" ]; then
        echo -e "${YELLOW}⚠️  $dest already exists, skipping...${NC}"
    else
        if [ -f "$source" ]; then
            cp "$source" "$dest"
            echo -e "${GREEN}✅ Created $dest${NC}"
        else
            echo -e "${YELLOW}⚠️  $source not found, skipping...${NC}"
        fi
    fi
}

# Root .env
echo "Setting up root .env..."
check_and_copy ".env.example" ".env"

# MCP Server
echo "Setting up MCP Server environment..."
check_and_copy "apps/mcp-server/.env.example" "apps/mcp-server/.env.dev"

# Webapp
echo "Setting up Webapp environment..."
check_and_copy "apps/webapp/.env.example" "apps/webapp/.env.local"

# Background Workers
echo "Setting up Background Workers environment..."
check_and_copy "apps/background-workers/.env.example" "apps/background-workers/.env.dev"

# REST API
echo "Setting up REST API environment..."
check_and_copy "apps/rest-api/.env.example" "apps/rest-api/.env.dev"

echo ""
echo -e "${GREEN}✅ Environment files set up!${NC}"
echo ""
echo "Next steps:"
echo "1. Edit .env files with your actual values"
echo "2. Set up OAuth apps (see DEVELOPMENT.md)"
echo "3. Run 'npm run dev' to start development servers"
echo "4. Set up ngrok (see DEVELOPMENT.md)"

