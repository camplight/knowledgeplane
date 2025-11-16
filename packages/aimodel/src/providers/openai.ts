import OpenAI from "openai";
import type {
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  FileUploadOptions,
  FileUploadResult,
  FileContentResult,
} from "../types";
import type { AIModelProvider } from "./base";

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider implements AIModelProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  getProvider(): string {
    return "openai";
  }

  async chatCompletion(
    messages: ChatMessage[],
    options?: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const model = options?.model || process.env.OPENAI_MODEL || "gpt-4o";
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens;
    const responseFormat = options?.responseFormat;

    // Convert messages to OpenAI format
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      messages.map((msg) => {
        if (typeof msg.content === "string") {
          return {
            role: msg.role,
            content: msg.content,
          };
        } else {
          // Handle multimodal content
          return {
            role: msg.role,
            content: msg.content,
          } as any;
        }
      });

    const response = await this.client.chat.completions.create({
      model,
      messages: openaiMessages,
      temperature,
      max_tokens: maxTokens,
      response_format:
        responseFormat === "json_object"
          ? { type: "json_object" }
          : undefined,
    });

    return {
      content: response.choices[0]?.message?.content || "",
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
    };
  }

  async uploadFile(
    buffer: Buffer,
    options: FileUploadOptions,
  ): Promise<FileUploadResult> {
    // Create File object from buffer
    let fileInput: File | Buffer;
    try {
      // Try to use File API (available in Node.js 18+)
      // Convert Buffer to Uint8Array for File constructor compatibility
      fileInput = new File([new Uint8Array(buffer)], options.filename, {
        type: options.mimeType,
      });
    } catch {
      // Fallback: use buffer directly
      fileInput = buffer;
    }

    const uploadedFile = await this.client.files.create({
      file: fileInput as any,
      purpose: options.purpose || "assistants",
    });

    return {
      fileId: uploadedFile.id,
      status: uploadedFile.status as any,
    };
  }

  async waitForFileProcessing(
    fileId: string,
    maxWaitSeconds: number = 60,
  ): Promise<FileUploadResult> {
    let attempts = 0;
    const maxAttempts = maxWaitSeconds;

    while (attempts < maxAttempts) {
      const fileInfo = await this.client.files.retrieve(fileId);
      const status = fileInfo.status as any;

      if (status === "processed" || status === "error") {
        return {
          fileId,
          status,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error(
      `File processing timeout after ${maxWaitSeconds} seconds for file ${fileId}`,
    );
  }

  async getFileContent(fileId: string): Promise<FileContentResult> {
    const fileContent = await this.client.files.content(fileId);
    const textContent = await fileContent.text();

    return {
      fileId,
      content: textContent,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.client.files.del(fileId);
  }
}

