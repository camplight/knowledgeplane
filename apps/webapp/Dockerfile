FROM node:25-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package files (defines workspaces)
COPY package.json package-lock.json* ./

# Copy workspace packages (required for workspace dependencies)
COPY packages ./packages

# Copy webapp package.json (needed for workspace resolution)
COPY apps/webapp/package.json ./apps/webapp/

# Install all dependencies (including devDependencies for build)
ENV NODE_ENV=development
RUN npm ci --workspaces --include-workspace-root

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages (needed for build)
COPY packages ./packages

# Copy all webapp source files
COPY apps/webapp ./apps/webapp

# Copy workspace node_modules for webapp dependencies
COPY --from=deps /app/apps/webapp/node_modules ./apps/webapp/node_modules

ENV NEXT_TELEMETRY_DISABLED=1
# Use production mode for build to prevent static page generation issues
ENV NODE_ENV=production

# Build from webapp directory
WORKDIR /app/apps/webapp

# Set dummy environment variables for build (actual values set at runtime)
ENV ARANGO_URL=http://localhost:8529
ENV ARANGO_DB_NAME=knowledgeplane
ENV ARANGO_USER=root
ENV ARANGO_PASSWORD=

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output from builder
# With outputFileTracingRoot set to ../.., Next.js creates standalone output
# at apps/webapp/.next/standalone/ and the structure preserves monorepo paths
# Copy the entire standalone directory structure
COPY --from=builder --chown=nextjs:nodejs /app/apps/webapp/.next/standalone ./
# Copy static files to match the standalone structure (server runs from apps/webapp/server.js)
COPY --from=builder --chown=nextjs:nodejs /app/apps/webapp/.next/static ./apps/webapp/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/webapp/public ./apps/webapp/public
COPY --from=builder --chown=nextjs:nodejs /app/packages/api-core/skill-template.md ./packages/api-core/skill-template.md

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# With outputFileTracingRoot set to monorepo root, server.js is at apps/webapp/server.js
CMD ["node", "apps/webapp/server.js"]

