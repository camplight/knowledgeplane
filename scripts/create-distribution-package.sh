#!/bin/bash
# Create a distribution package for clients
# Usage: ./scripts/create-distribution-package.sh [version]

set -e

VERSION=${1:-latest}
PACKAGE_NAME="knowledgeplane-distribution-${VERSION}"
PACKAGE_DIR="dist/${PACKAGE_NAME}"

echo "📦 Creating KnowledgePlane distribution package (version: $VERSION)"
echo ""

# Create package directory
mkdir -p ${PACKAGE_DIR}

# Copy distribution files
echo "Copying distribution files..."
cp distribution/docker-compose.yml ${PACKAGE_DIR}/
cp distribution/env.example ${PACKAGE_DIR}/
cp distribution/README.md ${PACKAGE_DIR}/
cp distribution/.dockerignore ${PACKAGE_DIR}/

# Don't copy CLIENT_GUIDE.md (merged into README.md)

# Create a version file
echo "VERSION=${VERSION}" > ${PACKAGE_DIR}/VERSION
echo "BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> ${PACKAGE_DIR}/VERSION

# Create a tar.gz archive
echo "Creating archive..."
cd dist
tar -czf ${PACKAGE_NAME}.tar.gz ${PACKAGE_NAME}
cd ..

echo ""
echo "✅ Distribution package created!"
echo ""
echo "Package location: dist/${PACKAGE_NAME}.tar.gz"
echo "Package contents: dist/${PACKAGE_NAME}/"
echo ""
echo "To distribute:"
echo "  1. Share dist/${PACKAGE_NAME}.tar.gz with clients"
echo "  2. Clients extract, configure .env, and run: docker compose up -d"

