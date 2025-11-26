FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Install build dependencies for native modules (sodium-native)
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    libtool \
    autoconf \
    automake \
    libsodium-dev
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
RUN apk add --no-cache \
    libsodium \
    python3 \
    make \
    g++ \
    libsodium-dev

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Install tsx globally for TypeScript execution (needed for workspace packages)
RUN npm install -g tsx

# Copy node_modules, workspace packages, and built output (as root for rebuild)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/mcp-server/dist ./dist
COPY --from=builder /app/apps/mcp-server/package.json ./package.json

# Rebuild native modules for this platform to ensure compatibility
RUN npm rebuild --build-from-source

# Remove build dependencies to reduce image size (keep only runtime libsodium)
RUN apk del python3 make g++ libsodium-dev

# Change ownership to nodejs user after rebuild
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080

ENV PORT 8080

CMD ["tsx", "dist/index.js"]

