import OpenAI from "openai";
import type {
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  FileUploadOptions,
  FileUploadResult,
  FileContentResult,
  EmbeddingsResult,
  Tool,
  McpTool,
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

    // If MCP tools are provided, try to use the responses.create() API
    if (options?.mcpTools && options.mcpTools.length > 0) {
      try {
        // Try to use the responses.create() API for MCP tools
        // This API might not be available in all OpenAI SDK versions
        const lastUserMessage = messages
          .filter((m) => m.role === "user")
          .pop();
        const input = lastUserMessage?.content || "";

        // Convert MCP tools to OpenAI format
        const mcpTools = options.mcpTools.map((tool: McpTool) => ({
          type: "mcp" as const,
          server_label: tool.server_label,
          server_description: tool.server_description,
          server_url: tool.server_url,
          require_approval: tool.require_approval || "never",
        }));

        // Check if responses.create exists (it might be a newer API)
        if (
          typeof (this.client as any).responses !== "undefined" &&
          typeof (this.client as any).responses.create === "function"
        ) {
          const response = await (this.client as any).responses.create({
            model,
            tools: mcpTools,
            input,
          });

          return {
            content: response.output_text || "",
            model: response.model || model,
            usage: {
              promptTokens: response.usage?.prompt_tokens,
              completionTokens: response.usage?.completion_tokens,
              totalTokens: response.usage?.total_tokens,
            },
          };
        } else {
          // Fallback: log warning and continue with standard chat completion
          console.warn(
            "OpenAI responses.create() API not available. Falling back to standard chat completion. MCP tools will not be used.",
          );
        }
      } catch (error: any) {
        // If responses.create() fails, fall back to standard chat completion
        console.warn(
          "Failed to use OpenAI responses.create() API:",
          error.message,
          "Falling back to standard chat completion.",
        );
      }
    }

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

    // Convert tools to OpenAI format
    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined = options?.tools?.map((tool) => ({
      type: "function",
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters || {},
      },
    }));

    // Convert tool choice
    let toolChoice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined;
    if (options?.toolChoice) {
      if (options.toolChoice === "auto") {
        toolChoice = "auto";
      } else if (options.toolChoice === "none") {
        toolChoice = "none";
      } else {
        toolChoice = {
          type: "function",
          function: { name: options.toolChoice.function.name },
        };
      }
    }

    const response = await this.client.chat.completions.create({
      model,
      messages: openaiMessages,
      temperature,
      max_tokens: maxTokens,
      response_format:
        responseFormat === "json_object"
          ? { type: "json_object" }
          : undefined,
      tools: openaiTools,
      tool_choice: toolChoice,
    });

    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls?.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    return {
      content: message?.content || "",
      model: response.model,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
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

  async embeddings(
    input: string | string[],
    model?: string,
  ): Promise<EmbeddingsResult> {
    const embeddingModel = model || process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    
    const response = await this.client.embeddings.create({
      model: embeddingModel,
      input: Array.isArray(input) ? input : [input],
    });

    return {
      embeddings: response.data.map((item) => item.embedding),
      model: response.model,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }
}

