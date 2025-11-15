FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/background-worker/package*.json ./apps/background-worker/
COPY packages/db/package*.json ./packages/db/

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build
RUN npm run build --workspace=apps/background-worker

WORKDIR /app/apps/background-worker

CMD ["node", "dist/index.js"]

