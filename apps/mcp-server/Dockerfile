FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
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

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Install tsx globally for TypeScript execution (needed for workspace packages)
RUN npm install -g tsx

# Copy node_modules, workspace packages, and built output
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/apps/mcp-server/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/mcp-server/package.json ./package.json

USER nodejs

EXPOSE 8080

ENV PORT 8080

CMD ["tsx", "dist/index.js"]

