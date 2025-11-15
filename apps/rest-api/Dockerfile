FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/rest-api/package*.json ./apps/rest-api/
COPY packages/db/package*.json ./packages/db/

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build
RUN npm run build --workspace=apps/rest-api

WORKDIR /app/apps/rest-api

CMD ["node", "dist/index.js"]

