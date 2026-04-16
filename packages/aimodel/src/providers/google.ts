import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  FileUploadOptions,
  FileUploadResult,
  FileContentResult,
  EmbeddingsResult,
} from "../types";
import type { AIModelProvider } from "./base";
import { getGoogleApiKey } from "../constants";

function assertGeminiSupportsMessages(messages: ChatMessage[]) {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      // We currently only support text-only prompts for Gemini in this codebase.
      // File/image inputs are OpenAI-shaped today; we should add a proper Gemini multimodal adapter later.
      throw new Error("Google provider currently supports text-only messages");
    }
  }
}

function toPrompt(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      return `${m.role.toUpperCase()}: ${content}`;
    })
    .join("\n\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when Google’s API is temporarily overloaded or rate-limited (safe to retry). */
function isTransientGoogleApiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /\[503|Service Unavailable|\b429\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|try again later|overloaded|EAI_AGAIN/i.test(
      msg,
    )
  ) {
    return true;
  }
  const anyErr = err as { status?: number; statusCode?: number; cause?: { status?: number } };
  const status = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.cause?.status;
  return status === 503 || status === 429;
}

async function withGoogleApiRetries<T>(
  operation: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts || !isTransientGoogleApiError(e)) {
        throw e;
      }
      const capMs = 30_000;
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1) + Math.random() * 400, capMs);
      await sleep(backoff);
    }
  }
  throw lastError;
}

/**
 * Google Gemini provider implementation (chat only for now)
 */
export class GoogleProvider implements AIModelProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    const key = apiKey || getGoogleApiKey();
    if (!key) {
      throw new Error(
        "GOOGLE_API_KEY is required for Google provider (aliases: GEMINI_API_KEY, Google_API_KEY)",
      );
    }
    this.client = new GoogleGenerativeAI(key);
  }

  getProvider(): string {
    return "google";
  }

  async chatCompletion(
    messages: ChatMessage[],
    options?: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    assertGeminiSupportsMessages(messages);

    const modelName = options?.model || process.env.GOOGLE_MODEL || "gemini-2.0-flash";
    const temperature = options?.temperature ?? 0.3;
    const maxOutputTokens = options?.maxTokens;

    const model = this.client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature,
        ...(typeof maxOutputTokens === "number" ? { maxOutputTokens } : {}),
      },
    });

    let prompt = toPrompt(messages);

    // Best-effort JSON mode: Gemini supports structured outputs, but keep a portable fallback instruction.
    if (options?.responseFormat === "json_object") {
      prompt = `${prompt}\n\nIMPORTANT: Return ONLY valid JSON (no markdown, no prose outside JSON).`;
    }

    const result = await withGoogleApiRetries(() => model.generateContent(prompt));
    const response = result.response;
    const text = response.text() || "";

    return {
      content: text,
      model: modelName,
    };
  }

  async uploadFile(_buffer: Buffer, _options: FileUploadOptions): Promise<FileUploadResult> {
    throw new Error("Google provider does not support file uploads via this interface");
  }

  async waitForFileProcessing(_fileId: string, _maxWaitSeconds?: number): Promise<FileUploadResult> {
    throw new Error("Google provider does not support file uploads via this interface");
  }

  async getFileContent(_fileId: string): Promise<FileContentResult> {
    throw new Error("Google provider does not support file uploads via this interface");
  }

  async deleteFile(_fileId: string): Promise<void> {
    throw new Error("Google provider does not support file uploads via this interface");
  }

  async embeddings(_input: string | string[], _model?: string): Promise<EmbeddingsResult> {
    const embeddingModel = _model || process.env.GOOGLE_EMBEDDING_MODEL || "text-embedding-004";
    const inputs = Array.isArray(_input) ? _input : [_input];

    // Note: Arango vector index in this codebase expects 1536-d embeddings today (OpenAI-shaped).
    // Some Google embedding models return a different dimensionality (commonly 768).
    // To keep the system working with a single vector index, we pad/truncate to 1536.
    const TARGET_DIM = 1536;
    const normalizeDim = (vec: number[]) => {
      if (vec.length === TARGET_DIM) return vec;
      if (vec.length > TARGET_DIM) return vec.slice(0, TARGET_DIM);
      return vec.concat(new Array(TARGET_DIM - vec.length).fill(0));
    };

    const model = this.client.getGenerativeModel({ model: embeddingModel });
    const embeddings = await Promise.all(
      inputs.map(async (text) => {
        const resp = await withGoogleApiRetries(() => model.embedContent(text));
        const values = (resp as any)?.embedding?.values;
        if (!Array.isArray(values) || values.length === 0) {
          throw new Error("No embedding returned from Google provider");
        }
        return normalizeDim(values as number[]);
      }),
    );

    return {
      embeddings,
      model: embeddingModel,
    };
  }
}

