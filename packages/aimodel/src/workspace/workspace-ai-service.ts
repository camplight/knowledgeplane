import type { Provider } from "../types";
import { createAIModelClient } from "../client";
import {
  getGoogleApiKey,
} from "../constants";
import {
  DEFAULT_WORKSPACE_AI_PROVIDER,
  getWorkspaceDefaultChatModel,
  isWorkspaceAIProvider,
  type WorkspaceAIProvider,
} from "../model-catalog";

export type WorkspaceAIConfig = {
  provider: WorkspaceAIProvider;
  chatModel: string;
};

export type WorkspaceRecordLike = {
  id: string;
  ai_provider?: string | null;
  ai_chat_model?: string | null;
};

export type GetWorkspaceById = (workspaceId: string) => Promise<WorkspaceRecordLike | null>;

function getEnvApiKeyForProvider(provider: WorkspaceAIProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "google":
      // Standardize on GOOGLE_API_KEY for now (Gemini), but accept aliases.
      return getGoogleApiKey();
  }
}

export async function resolveWorkspaceAIConfig(args: {
  workspaceId: string;
  getWorkspaceById: GetWorkspaceById;
}): Promise<WorkspaceAIConfig> {
  const workspace = await args.getWorkspaceById(args.workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const providerRaw = workspace.ai_provider || DEFAULT_WORKSPACE_AI_PROVIDER;
  const provider: WorkspaceAIProvider = isWorkspaceAIProvider(providerRaw)
    ? providerRaw
    : DEFAULT_WORKSPACE_AI_PROVIDER;

  const chatModel = workspace.ai_chat_model || getWorkspaceDefaultChatModel(provider);

  return { provider, chatModel };
}

export async function getWorkspaceAIProvider(args: {
  workspaceId: string;
  getWorkspaceById: GetWorkspaceById;
}) {
  const cfg = await resolveWorkspaceAIConfig(args);
  const apiKey = getEnvApiKeyForProvider(cfg.provider);
  if (!apiKey) {
    throw new Error(
      cfg.provider === "google"
        ? "GOOGLE_API_KEY is required for Google provider (aliases: GEMINI_API_KEY, Google_API_KEY). If this runs in background workers, set the key in apps/background-workers/.env.dev or repo root .env — not only apps/webapp/.env.local."
        : "OPENAI_API_KEY is required for OpenAI provider",
    );
  }

  // AIModelClient supports openai/anthropic today; google will throw until implemented.
  const client = createAIModelClient(cfg.provider as Provider, apiKey);
  return {
    provider: client.getProvider(),
    config: cfg,
  };
}

export function getWorkspaceChatModelOrDefault(model?: string | null): string {
  return model || getWorkspaceDefaultChatModel(DEFAULT_WORKSPACE_AI_PROVIDER);
}

