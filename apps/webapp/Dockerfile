FROM node:20-alpine AS base

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
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages (needed for build)
COPY packages ./packages

# Copy all webapp source files
COPY apps/webapp ./apps/webapp

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=development

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
# at apps/webapp/.next/standalone/ but traces files relative to the root
# The standalone output includes everything needed: server.js, node_modules, and workspace packages
COPY --from=builder --chown=nextjs:nodejs /app/apps/webapp/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/webapp/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/webapp/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Next.js standalone output has server.js at the root of the standalone directory
CMD ["node", "server.js"]

