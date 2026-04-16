---
name: Workspace AI Service Layer
overview: Refactor AI calls behind a single workspace-scoped AI service, move existing OpenAI usage to that service, and add workspace-level provider+model selection (keys remain in env).
todos:
  - id: ws-fields
    content: Add `ai_provider` and `ai_chat_model` to Workspace model + update support
    status: completed
  - id: trpc-workspaces
    content: Expose provider/model in workspace create/get/update tRPC routes
    status: completed
  - id: provider-model-registry
    content: Add curated provider/model registry in `@knowledgeplane/aimodel`
    status: completed
  - id: workspace-ai-service
    content: Implement `WorkspaceAIService` resolving provider+model per workspace and API keys from env
    status: completed
  - id: migrate-chat
    content: Refactor chat route to use `WorkspaceAIService`
    status: completed
  - id: migrate-file-upload
    content: Refactor file upload extraction to use the workspace AI service path
    status: completed
  - id: migrate-card-processing
    content: Refactor card consolidator to resolve provider/model per workspace
    status: completed
  - id: ui-workspace-dropdowns
    content: Add provider+model dropdowns to workspace create/edit UI
    status: completed
  - id: docs
    content: Update `docs/SPEC.md` (and one more doc) to reflect the new service layer
    status: completed
isProject: false
---

# Workspace-scoped AI service refactor

## Goals

- Create **one AI service entrypoint** that all “AI interventions” call (chat, file upload extraction, card consolidation, etc.).
- Make the service **workspace-aware** (provider + model picked per workspace).
- Keep **API keys in env only** (no DB storage), but store **workspace configuration** (provider + model).
- Enable easy extension for **Anthropic** and **Google/Gemini** later.
- Update documentation (and keep [`docs/SPEC.md`](/Users/dimitar/Projects/knowledgeplane/docs/SPEC.md) current per workspace rule).

## Status

- ✅ Workspace-scoped provider + model selection implemented
- ✅ OpenAI + Anthropic supported via `@knowledgeplane/aimodel`
- ✅ **Google (Gemini) chat provider implemented** (text-only prompts for now)

## Current architecture (what exists today)

- **Provider abstraction already exists** in `@knowledgeplane/aimodel`:
  - `AIModelProvider` interface: [`packages/aimodel/src/providers/base.ts`](/Users/dimitar/Projects/knowledgeplane/packages/aimodel/src/providers/base.ts)
  - `OpenAIProvider`: [`packages/aimodel/src/providers/openai.ts`](/Users/dimitar/Projects/knowledgeplane/packages/aimodel/src/providers/openai.ts)
  - `AnthropicProvider` exists but is incomplete for files/embeddings: [`packages/aimodel/src/providers/anthropic.ts`](/Users/dimitar/Projects/knowledgeplane/packages/aimodel/src/providers/anthropic.ts)
  - Client factory: [`packages/aimodel/src/client.ts`](/Users/dimitar/Projects/knowledgeplane/packages/aimodel/src/client.ts)
- **Workspace persistence** is in Arango `workspaces` collection via model: [`packages/db/src/models/Workspace.ts`](/Users/dimitar/Projects/knowledgeplane/packages/db/src/models/Workspace.ts)
- **Workspace context** is selected via cookie and placed on tRPC context: [`apps/webapp/server/trpc/context.ts`](/Users/dimitar/Projects/knowledgeplane/apps/webapp/server/trpc/context.ts)
- **AI call sites** (examples):
  - Chat route creates a client from env: [`apps/webapp/server/trpc/routes/chat.ts`](/Users/dimitar/Projects/knowledgeplane/apps/webapp/server/trpc/routes/chat.ts)
  - File upload uses `processFileUpload` and passes `OPENAI_API_KEY`/`OPENAI_MODEL`: [`apps/webapp/server/trpc/routes/files.ts`](/Users/dimitar/Projects/knowledgeplane/apps/webapp/server/trpc/routes/files.ts)
  - File extraction uses `createAIModelClient` but still names inputs `openaiApiKey/openaiModel`: [`packages/file-processor/src/extract-facts.ts`](/Users/dimitar/Projects/knowledgeplane/packages/file-processor/src/extract-facts.ts)
  - Workers (card consolidation) use env provider/key: [`apps/background-workers/src/workers/card-consolidator.ts`](/Users/dimitar/Projects/knowledgeplane/apps/background-workers/src/workers/card-consolidator.ts)

## Target design

### Data model (workspace-scoped config)

Add to Workspace record:

- `ai_provider`: enum string (`"openai" | "anthropic" | "google"`)
- `ai_chat_model`: string (curated dropdown value)

Notes:

- Keys remain **env-only**, based on your answer.
- Embeddings stay **OpenAI env-based** initially (current `EmbeddingsGenerator` depends on OpenAI embeddings); we can revisit workspace-level embedding provider later.

### Central service API

Add a new “workspace AI service” module that:

- Reads the workspace’s `ai_provider` + `ai_chat_model`
- Resolves the provider’s API key from env (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)
- Produces a ready-to-use `AIModelProvider` (or richer `WorkspaceAIService`) for:
  - chat completions (with consistent options, responseFormat handling, MCP tools wiring)
  - file/fact extraction (model selection and provider selection)
  - card consolidation (model selection per workspace)
- Includes guardrails for capability gaps:
  - Anthropic: no file upload API, no embeddings → service should fail fast or route only supported calls.

Suggested placement (minimal churn):

- Add under `packages/aimodel/src/workspace/` (so existing call sites that already depend on `@knowledgeplane/aimodel` can use it)
  - e.g. `packages/aimodel/src/workspace/workspace-ai-service.ts`

### Flow (high level)

```mermaid
flowchart TD
  ui[WebappWorkspaceCreateEdit] -->|saves ai_provider + ai_chat_model| ws[WorkspacesTRPC]
  ws --> db[WorkspacesCollection]

  chat[ChatTRPCRoute] --> ctx[TRPCContext(workspaceId)]
  files[FilesTRPCRoute] --> ctx
  worker[CardConsolidatorWorker] --> db

  ctx --> svc[WorkspaceAIService]
  db --> svc
  env[EnvAPIKeys] --> svc

  svc --> aimodel[AIModelProvider(OpenAI/Anthropic/...)]
  aimodel --> calls[chatCompletion/fileExtraction/...]
```

## Implementation plan (step-by-step, implementable in small PRs)

### Step 1 — Add workspace AI config fields (DB layer)

- Update `WorkspaceRecord` typing and normalization in [`packages/db/src/models/Workspace.ts`](/Users/dimitar/Projects/knowledgeplane/packages/db/src/models/Workspace.ts)
  - Add optional fields: `ai_provider`, `ai_chat_model`
- Extend `Workspace.update(...)` to allow updating these fields.
- Decide defaults:
  - `ai_provider`: `"openai"`
  - `ai_chat_model`: use current `DEFAULT_OPENAI_MODEL` from [`packages/aimodel/src/constants.ts`](/Users/dimitar/Projects/knowledgeplane/packages/aimodel/src/constants.ts)

### Step 2 — Expose config via tRPC (create/get/update)

- Update zod inputs + handlers in [`apps/webapp/server/trpc/routes/workspaces.ts`](/Users/dimitar/Projects/knowledgeplane/apps/webapp/server/trpc/routes/workspaces.ts)
  - `create`: accept optional provider/model; persist to workspace doc
  - `getById`: return these fields to client (already returns workspace)
  - `update`: allow updating provider/model
- Add lightweight validation:
  - provider must be in allowed list
  - model must be in curated list for that provider (see Step 3)

### Step 3 — Add curated provider+model catalog (shared constants)

- Add a small registry in `@knowledgeplane/aimodel`:
  - `AI_PROVIDERS = ["openai","anthropic","google"]`
  - `AI_PROVIDER_MODELS: Record<Provider,string[]>` (curated lists)
  - Choose initial lists:
    - OpenAI: include `DEFAULT_OPENAI_MODEL` and any other currently supported models you want to expose
    - Anthropic: include `DEFAULT_ANTHROPIC_MODEL` (and any others you want)
    - Google: placeholder list for now (until provider implemented)

### Step 4 — Implement `WorkspaceAIService` (single entrypoint)

Create `packages/aimodel/src/workspace/workspace-ai-service.ts` with responsibilities:

- Load workspace config (takes `workspaceId` and a `Workspace.findById`-like accessor)
- Compute:
  - `providerName`
  - `chatModel`
  - `apiKey` (from env only)
- Construct `AIModelClient`/`AIModelProvider`
- Provide helpers:
  - `getChatProviderForWorkspace(workspaceId)`
  - `getChatOptionsForWorkspace(workspaceId, overrides)` (enforce chosen model)

Key env mapping (env-only, per your decision):

- `openai` → `OPENAI_API_KEY`
- `anthropic` → `ANTHROPIC_API_KEY`
- `google` → `GOOGLE_API_KEY`

### Step 5 — Migrate webapp chat to the service

- Update [`apps/webapp/server/trpc/routes/chat.ts`](/Users/dimitar/Projects/knowledgeplane/apps/webapp/server/trpc/routes/chat.ts)
  - Replace direct env-based AI client creation with `WorkspaceAIService` using `ctx.workspaceId`
  - Ensure the model used comes from workspace config (not `getOpenAIModel()`)
  - Keep MCP tools wiring as-is, but centralize any repeated option-building into the service

### Step 6 — Migrate file upload extraction to the service

- Update [`apps/webapp/server/trpc/routes/files.ts`](/Users/dimitar/Projects/knowledgeplane/apps/webapp/server/trpc/routes/files.ts)
  - Stop passing `openaiApiKey/openaiModel` explicitly
  - Instead pass a workspace-scoped AI config object or just `workspaceId` and let the file-processor resolve via the service

Two options (pick one; both are valid):

- **Option A (recommended):** keep `packages/file-processor` independent of DB and webapp
  - Webapp resolves provider/key/model via `WorkspaceAIService` and passes `{ provider, apiKey, model }` into file-processor.
- **Option B:** make `file-processor` call `WorkspaceAIService`
  - Tighter coupling to DB/workspace model; fewer parameters at call sites.

### Step 7 — Migrate background “card processing” to workspace selection

- Update [`apps/background-workers/src/workers/card-consolidator.ts`](/Users/dimitar/Projects/knowledgeplane/apps/background-workers/src/workers/card-consolidator.ts)
  - Today it constructs one client from env and then processes many workspaces.
  - Change to construct provider per workspace using workspace config:
    - before processing each workspaceId, resolve provider/model/key via `WorkspaceAIService`
- Keep embeddings generator as OpenAI-only for now:
  - [`apps/background-workers/src/workers/embeddings-generator.ts`](/Users/dimitar/Projects/knowledgeplane/apps/background-workers/src/workers/embeddings-generator.ts)

### Step 8 — Add workspace UI dropdowns (create + edit)

- Update workspace screen UI at [`apps/webapp/app/workspaces/page.tsx`](/Users/dimitar/Projects/knowledgeplane/apps/webapp/app/workspaces/page.tsx)
  - Add **AI service** dropdown (`OpenAI`, `Anthropic`, `Google Gemini`)
  - Add **Model** dropdown populated from curated list for selected provider
  - Wire values into `workspaces.create` and `workspaces.update`
  - UX: if provider selected but env key missing on server, show a non-blocking warning (server will error on use; this keeps UI simple)

### Step 9 — Documentation updates

- Update [`docs/SPEC.md`](/Users/dimitar/Projects/knowledgeplane/docs/SPEC.md)
  - Add “Workspace AI configuration” section: provider/model stored on workspace, keys via env
  - Update existing chat + upload sections to describe the new service layer
- Update the root README or env docs to list new env vars if introduced:
  - [`README.md`](/Users/dimitar/Projects/knowledgeplane/README.md) and/or [`ENV_SETUP.md`](/Users/dimitar/Projects/knowledgeplane/ENV_SETUP.md)

## Acceptance criteria

- All AI entrypoints (chat, file upload extraction, card consolidation) resolve **provider+model from workspace**.
- No API keys stored in DB; missing env keys produce clear runtime errors.
- Workspace create/edit screen has dropdowns for provider and model.
- OpenAI remains default and current behavior remains functional without workspace changes.
- `docs/SPEC.md` is updated to reflect new architecture.
