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

# Install all dependencies (including workspace linking)
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy workspace packages (needed for build)
COPY packages ./packages

# Copy all webapp source files (including public directory)
COPY apps/webapp ./apps/webapp

# Ensure public directory exists (Next.js requires it)
RUN mkdir -p ./apps/webapp/public

ENV NEXT_TELEMETRY_DISABLED 1

# Build from webapp directory
WORKDIR /app/apps/webapp
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install tsx globally for TypeScript execution (needed for workspace packages)
RUN npm install -g tsx

# Copy public directory and Next.js build output from webapp directory
COPY --from=builder /app/apps/webapp/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/webapp/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/webapp/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["tsx", "apps/webapp/server.js"]

