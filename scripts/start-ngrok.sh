#!/bin/bash
# Start ngrok tunnel for KnowledgePlane MCP server
# Usage: ./scripts/start-ngrok.sh [port] [domain]

set -e

PORT=${1:-8080}
DOMAIN=${2:-}

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed"
    echo ""
    echo "Install ngrok:"
    echo "  macOS: brew install ngrok"
    echo "  Or download from: https://ngrok.com/download"
    exit 1
fi

# Check if authtoken is configured
if ! ngrok config check &> /dev/null; then
    echo "⚠️  ngrok authtoken not configured"
    echo ""
    echo "Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "Then run: ngrok config add-authtoken YOUR_AUTHTOKEN"
    exit 1
fi

echo "🚀 Starting ngrok tunnel on port $PORT"
if [ -n "$DOMAIN" ]; then
    echo "   Using domain: $DOMAIN"
    ngrok http $PORT --domain=$DOMAIN --log=stdout
else
    echo "   Using random domain (get a reserved domain for stability)"
    ngrok http $PORT --log=stdout
fi

