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

export const WORKSPACE_AI_PROVIDER_LABELS: Record<WorkspaceAIProvider, string> = {
  openai: "OpenAI",
  google: "Google (Gemini)",
};

export const WORKSPACE_AI_CHAT_MODELS: Record<WorkspaceAIProvider, string[]> = {
  openai: ["gpt-5.2", "gpt-5-mini"],
  google: [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
  ],
} as const;

export function getWorkspaceDefaultChatModel(provider: WorkspaceAIProvider): string {
  return (
    WORKSPACE_AI_CHAT_MODELS[provider][0] ||
    WORKSPACE_AI_CHAT_MODELS[DEFAULT_WORKSPACE_AI_PROVIDER][0]
  );
}

export function isWorkspaceAIProvider(value: string): value is WorkspaceAIProvider {
  return (WORKSPACE_AI_PROVIDERS as readonly string[]).includes(value);
}

export function isWorkspaceChatModelAllowed(
  provider: WorkspaceAIProvider,
  model: string,
): boolean {
  return WORKSPACE_AI_CHAT_MODELS[provider].includes(model);
}
