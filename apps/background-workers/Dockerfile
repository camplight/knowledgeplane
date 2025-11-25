FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package files (defines workspaces)
COPY package.json package-lock.json* ./

# Copy workspace packages (required for workspace dependencies)
COPY packages ./packages

# Copy background-workers package.json (needed for workspace resolution)
COPY apps/background-workers/package.json ./apps/background-workers/

# Install all dependencies (including workspace linking)
RUN npm ci

# Build the source code
FROM base AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages (needed for build)
COPY packages ./packages

# Copy background-workers source files
COPY apps/background-workers ./apps/background-workers

# Build from background-workers directory
WORKDIR /app/apps/background-workers
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
COPY --from=builder --chown=nodejs:nodejs /app/apps/background-workers/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/background-workers/package.json ./package.json

USER nodejs

CMD ["tsx", "dist/index.js"]

