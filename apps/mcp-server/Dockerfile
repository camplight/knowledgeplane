FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
# Install build dependencies for native modules (sodium-native)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsodium-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy root package files (defines workspaces)
COPY package.json package-lock.json* ./

# Copy workspace packages (required for workspace dependencies)
COPY packages ./packages

# Copy mcp-server package.json (needed for workspace resolution)
COPY apps/mcp-server/package.json ./apps/mcp-server/

# Install all dependencies (including workspace linking)
RUN npm ci

# Build the source code
FROM base AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages (needed for build)
COPY packages ./packages

# Copy mcp-server source files
COPY apps/mcp-server ./apps/mcp-server

# Build from mcp-server directory
WORKDIR /app/apps/mcp-server
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install runtime and build dependencies for native modules
# We need build tools temporarily to rebuild native modules for this platform
RUN apt-get update && apt-get install -y \
    libsodium23 \
    python3 \
    make \
    g++ \
    libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nodejs

# Install tsx globally for TypeScript execution (needed for workspace packages)
RUN npm install -g tsx

# Copy node_modules, workspace packages, and built output (as root for rebuild)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/mcp-server/dist ./dist
COPY --from=builder /app/apps/mcp-server/package.json ./package.json

# Rebuild sodium-native specifically for this platform to ensure compatibility
# Remove it first, then reinstall to force a fresh build
RUN npm uninstall sodium-native || true
RUN npm install sodium-native --build-from-source --no-save

# Remove build dependencies to reduce image size (keep only runtime libsodium)
RUN apt-get update && apt-get remove -y python3 make g++ libsodium-dev && \
    apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Change ownership to nodejs user after rebuild
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080

ENV PORT 8080

CMD ["tsx", "dist/index.js"]

