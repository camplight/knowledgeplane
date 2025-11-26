# Web Application

Next.js web application for KnowledgePlane providing a user interface for managing knowledge, facts, cards, and categories.

## Overview

This is a Next.js 15 application that provides:
- **Dashboard**: Main interface for viewing and managing knowledge
- **Chat Interface**: Interactive chat for querying knowledge
- **Editor**: Rich text editor for creating and editing content
- **Upload**: File upload interface for processing documents
- **Authentication**: OAuth 2.0 authentication with Google and GitHub
- **tRPC API**: Type-safe API layer using tRPC

## Environment Variables

### Required

- `ARANGO_URL` - ArangoDB connection URL (default: `http://localhost:8529`)
- `ARANGO_DB_NAME` - Database name (default: `knowledgeplane`)
- `ARANGO_USER` - Database username (default: `root`)
- `ARANGO_PASSWORD` - Database password (default: empty string)

### Optional - Server Configuration

- `NODE_ENV` - Environment mode (`development` or `production`)
- `PORT` - Server port (default: `3000`)

### Optional - OAuth Authentication

#### Google OAuth
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

#### GitHub OAuth
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret

### Optional - OAuth Configuration

- `OAUTH_REDIRECT_BASE_URL` - Base URL for OAuth redirects (default: `http://localhost:3000`)

### Optional - AI/Embeddings

- `OPENAI_API_KEY` - OpenAI API key for AI operations
- `EMBEDDINGS_PROVIDER` - Embeddings provider (e.g., `openai`)

## Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment variables**:
Create a `.env.local` file in the app directory:
```env
# Database
ARANGO_URL=http://localhost:8529
ARANGO_DB_NAME=knowledgeplane
ARANGO_USER=root
ARANGO_PASSWORD=root

# Server
OAUTH_REDIRECT_BASE_URL=http://localhost:3000
NODE_ENV=development

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# AI/Embeddings (optional)
OPENAI_API_KEY=your-openai-api-key
EMBEDDINGS_PROVIDER=openai
```

3. **Ensure database is running**:
The application requires an ArangoDB instance to be running and accessible.

4. **Set up OAuth providers** (optional):

   **Google OAuth:**
   1. Go to [Google Cloud Console](https://console.cloud.google.com/)
   2. Create a new project or select an existing one
   3. Enable Google+ API
   4. Create OAuth 2.0 credentials
   5. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
   6. Copy Client ID and Client Secret to `.env.local`

   **GitHub OAuth:**
   1. Go to GitHub Settings > Developer settings > OAuth Apps
   2. Create a new OAuth App
   3. Set Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
   4. Copy Client ID and Client Secret to `.env.local`

## Running

### Development

```bash
npm run dev
```

This runs the development server with hot reload. The application will be available at `http://localhost:3000`.

### Production

1. **Build the application**:
```bash
npm run build
```

2. **Start the production server**:
```bash
npm start
```

### Docker

The application can be run using Docker Compose. See the root `infra/docker-compose.yml` for configuration.

## Application Structure

- `app/` - Next.js App Router pages and routes
  - `api/` - API routes (OAuth callbacks, tRPC)
  - `chat/` - Chat interface page
  - `dashboard/` - Dashboard page
  - `editor/` - Editor page
  - `upload/` - Upload page
- `server/trpc/` - tRPC server routes and context
- `utils/` - Utility functions

## Pages

### Dashboard (`/dashboard`)
Main interface for viewing and managing knowledge cards, facts, and categories.

### Chat (`/chat`)
Interactive chat interface for querying the knowledge base.

### Editor (`/editor`)
Rich text editor for creating and editing knowledge content.

### Upload (`/upload`)
File upload interface for processing documents and extracting facts.

## Authentication

The application supports OAuth 2.0 authentication with:
- **Google**: Sign in with Google account
- **GitHub**: Sign in with GitHub account

Authentication endpoints:
- `GET /api/auth/google` - Initiate Google OAuth flow
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/github` - Initiate GitHub OAuth flow
- `GET /api/auth/github/callback` - GitHub OAuth callback

## tRPC API

The application uses tRPC for type-safe API communication. The tRPC router is available at `/api/trpc/[trpc]`.

Available routes:
- `auth.*` - Authentication routes
- `facts.*` - Facts management
- `files.*` - File operations
- `chat.*` - Chat functionality
- `user.*` - User management

## Styling

The application uses:
- **Tailwind CSS** - Utility-first CSS framework
- **PostCSS** - CSS processing

## Dependencies

- `next` - Next.js framework
- `react` - React library
- `@trpc/server` - tRPC server
- `@trpc/client` - tRPC client
- `@trpc/next` - Next.js tRPC integration
- `@tanstack/react-query` - Data fetching and caching
- `@knowledgeplane/db` - Database models and connection
- `@knowledgeplane/file-processor` - File processing utilities
- `@knowledgeplane/aimodel` - AI model client

## Development

### Linting

```bash
npm run lint
```

### Type Checking

TypeScript type checking is performed during build. Use your IDE's TypeScript integration for real-time checking.

## Production Deployment

1. Set all required environment variables in your deployment platform
2. Build the application: `npm run build`
3. Start the production server: `npm start`

For production, ensure:
- `NODE_ENV=production`
- `OAUTH_REDIRECT_BASE_URL` is set to your production URL
- OAuth redirect URIs are configured for your production domain
- Database connection is secure and accessible

