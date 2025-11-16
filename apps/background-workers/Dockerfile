FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/background-workers/package*.json ./apps/background-workers/
COPY packages/db/package*.json ./packages/db/

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build
RUN npm run build --workspace=apps/background-workers

WORKDIR /app/apps/background-workers

CMD ["node", "dist/index.js"]

