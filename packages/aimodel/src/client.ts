import type { Provider } from "./types";
import type { AIModelProvider } from "./providers/base";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { GoogleProvider } from "./providers/google";
import { DEFAULT_WORKSPACE_AI_PROVIDER } from "./model-catalog";

/**
 * AI Model Client - Facade for interacting with different AI providers
 */
export class AIModelClient {
  private provider: AIModelProvider;

  constructor(provider?: Provider, apiKey?: string) {
    const providerName = provider || DEFAULT_WORKSPACE_AI_PROVIDER;

    switch (providerName) {
      case "openai":
        this.provider = new OpenAIProvider(apiKey);
        break;
      case "anthropic":
        this.provider = new AnthropicProvider(apiKey);
        break;
      case "google":
        this.provider = new GoogleProvider(apiKey);
        break;
      case "azure":
        // TODO: Implement Azure provider
        throw new Error("Azure provider not yet implemented");
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Get the current provider
   */
  getProvider(): AIModelProvider {
    return this.provider;
  }

  /**
   * Get the provider name
   */
  getProviderName(): string {
    return this.provider.getProvider();
  }
}

/**
 * Create a default AI model client instance
 */
export function createAIModelClient(
  provider?: Provider,
  apiKey?: string,
): AIModelClient {
  return new AIModelClient(provider, apiKey);
}

/**
 * Default singleton instance
 */
let defaultClient: AIModelClient | null = null;

/**
 * Get or create the default AI model client
 */
export function getDefaultAIModelClient(
  provider?: Provider,
  apiKey?: string,
): AIModelClient {
  if (!defaultClient) {
    defaultClient = createAIModelClient(provider, apiKey);
  }
  return defaultClient;
}

