#!/bin/bash
# Build and optionally publish Docker images for KnowledgePlane distribution
# Usage: ./scripts/build-images.sh [version] [--publish]
#   version: Image tag version (default: latest)
#   --publish: Push images to Docker Hub after building

set -e

VERSION=${1:-latest}
PUBLISH=false

# Check for --publish flag
if [[ "$*" == *"--publish"* ]]; then
    PUBLISH=true
    # Remove --publish from version if it was passed as first arg
    if [ "$1" == "--publish" ]; then
        VERSION=${2:-latest}
    fi
fi

# Docker Hub registry (change to your Docker Hub username/organization)
DOCKERHUB_USER=${DOCKERHUB_USER:-knowledgeplane}
REGISTRY=${DOCKER_REGISTRY:-${DOCKERHUB_USER}}

echo "🏗️  Building KnowledgePlane Docker images (version: $VERSION)"
if [ "$PUBLISH" = true ]; then
    echo "📤 Will publish to Docker Hub: ${REGISTRY}/*"
fi
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Docker Hub login if publishing
if [ "$PUBLISH" = true ]; then
    echo -e "${YELLOW}Checking Docker Hub authentication...${NC}"
    if ! docker info | grep -q "Username:"; then
        echo -e "${YELLOW}⚠️  Not logged into Docker Hub. Please run: docker login${NC}"
        echo "   Or set DOCKERHUB_USER environment variable"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Build MCP Server
echo -e "${BLUE}Building MCP Server...${NC}"
docker build -t ${REGISTRY}/mcp-server:${VERSION} -f apps/mcp-server/Dockerfile .
if [ "$PUBLISH" = true ]; then
    docker push ${REGISTRY}/mcp-server:${VERSION}
    echo -e "${GREEN}✅ MCP Server published${NC}"
else
    echo -e "${GREEN}✅ MCP Server built${NC}"
fi

# Build Webapp
echo -e "${BLUE}Building Webapp...${NC}"
docker build -t ${REGISTRY}/webapp:${VERSION} -f apps/webapp/Dockerfile .
if [ "$PUBLISH" = true ]; then
    docker push ${REGISTRY}/webapp:${VERSION}
    echo -e "${GREEN}✅ Webapp published${NC}"
else
    echo -e "${GREEN}✅ Webapp built${NC}"
fi

# Build Background Workers
echo -e "${BLUE}Building Background Workers...${NC}"
docker build -t ${REGISTRY}/background-workers:${VERSION} -f apps/background-workers/Dockerfile .
if [ "$PUBLISH" = true ]; then
    docker push ${REGISTRY}/background-workers:${VERSION}
    echo -e "${GREEN}✅ Background Workers published${NC}"
else
    echo -e "${GREEN}✅ Background Workers built${NC}"
fi

echo ""
echo -e "${GREEN}🎉 All images built successfully!${NC}"
echo ""
echo "Images:"
echo "  - ${REGISTRY}/mcp-server:${VERSION}"
echo "  - ${REGISTRY}/webapp:${VERSION}"
echo "  - ${REGISTRY}/background-workers:${VERSION}"
echo ""

if [ "$PUBLISH" = true ]; then
    echo -e "${GREEN}✅ All images published to Docker Hub!${NC}"
    echo ""
    echo "Clients can now use these images by updating docker-compose.yml:"
    echo "  image: ${REGISTRY}/mcp-server:${VERSION}"
    echo "  image: ${REGISTRY}/webapp:${VERSION}"
    echo "  image: ${REGISTRY}/background-workers:${VERSION}"
else
    echo "To publish to Docker Hub, run:"
    echo "  ./scripts/build-images.sh ${VERSION} --publish"
    echo ""
    echo "Or manually push:"
    echo "  docker push ${REGISTRY}/mcp-server:${VERSION}"
    echo "  docker push ${REGISTRY}/webapp:${VERSION}"
    echo "  docker push ${REGISTRY}/background-workers:${VERSION}"
fi
