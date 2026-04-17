// Anthropic is intentionally hidden from workspace selection for now.
// Important: Anthropic does not provide an embeddings model in this codebase,
// so when re-enabling it we need to decide how embeddings should work for
// workspace-level search/background workers before exposing it in the UI again.
export const WORKSPACE_AI_PROVIDERS = [
  "openai",
  // "anthropic",
  "google",
] as const;
export type WorkspaceAIProvider = (typeof WORKSPACE_AI_PROVIDERS)[number];
export const DEFAULT_WORKSPACE_AI_PROVIDER: WorkspaceAIProvider =
  WORKSPACE_AI_PROVIDERS[0];

export const WORKSPACE_AI_PROVIDER_LABELS: Record<WorkspaceAIProvider, string> =
  {
    openai: "OpenAI",
    google: "Google (Gemini)",
  };

export const WORKSPACE_AI_CHAT_MODELS: Record<WorkspaceAIProvider, string[]> = {
  openai: ["gpt-5.2", "gpt-5-mini"],
  google: [
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-pro",
  ],
} as const;

export const WORKSPACE_AI_EMBEDDING_MODELS: Record<
  WorkspaceAIProvider,
  string[]
> = {
  openai: ["text-embedding-3-small"],
  google: ["text-embedding-004"],
} as const;

export function getWorkspaceDefaultChatModel(
  provider: WorkspaceAIProvider,
): string {
  return (
    WORKSPACE_AI_CHAT_MODELS[provider][0] ||
    WORKSPACE_AI_CHAT_MODELS[DEFAULT_WORKSPACE_AI_PROVIDER][0]
  );
}

export function getWorkspaceDefaultEmbeddingModel(
  provider: WorkspaceAIProvider,
): string {
  return (
    WORKSPACE_AI_EMBEDDING_MODELS[provider][0] ||
    WORKSPACE_AI_EMBEDDING_MODELS[DEFAULT_WORKSPACE_AI_PROVIDER][0]
  );
}

export function isWorkspaceAIProvider(
  value: string,
): value is WorkspaceAIProvider {
  return (WORKSPACE_AI_PROVIDERS as readonly string[]).includes(value);
}

export function isWorkspaceChatModelAllowed(
  provider: WorkspaceAIProvider,
  model: string,
): boolean {
  return WORKSPACE_AI_CHAT_MODELS[provider].includes(model);
}

export function getWorkspaceAllowedChatModel(
  provider: WorkspaceAIProvider,
  model?: string | null,
): string {
  if (model && isWorkspaceChatModelAllowed(provider, model)) {
    return model;
  }
  return getWorkspaceDefaultChatModel(provider);
}

export function isWorkspaceEmbeddingModelAllowed(
  provider: WorkspaceAIProvider,
  model: string,
): boolean {
  return WORKSPACE_AI_EMBEDDING_MODELS[provider].includes(model);
}

export function getWorkspaceAllowedEmbeddingModel(
  provider: WorkspaceAIProvider,
  model?: string | null,
): string {
  if (model && isWorkspaceEmbeddingModelAllowed(provider, model)) {
    return model;
  }
  return getWorkspaceDefaultEmbeddingModel(provider);
}
