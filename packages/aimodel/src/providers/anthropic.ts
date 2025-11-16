import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  FileUploadOptions,
  FileUploadResult,
  FileContentResult,
  Tool,
} from "../types";
import type { AIModelProvider } from "./base";

/**
 * Anthropic provider implementation
 */
export class AnthropicProvider implements AIModelProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  getProvider(): string {
    return "anthropic";
  }

  async chatCompletion(
    messages: ChatMessage[],
    options?: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const model = options?.model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens || 4096;

    // Convert messages to Anthropic format
    // Anthropic uses a different message format - system message is separate
    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const anthropicMessages: Anthropic.MessageParam[] = conversationMessages.map((msg) => {
      if (typeof msg.content === "string") {
        return {
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content,
        };
      } else {
        // Handle multimodal content
        return {
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content as any,
        };
      }
    });

    // Convert tools to Anthropic format
    const tools: Anthropic.Tool[] | undefined = options?.tools?.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description || "",
      input_schema: tool.function.parameters || {},
    }));

    const params: Anthropic.Messages.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: anthropicMessages,
      ...(systemMessage && typeof systemMessage.content === "string" && {
        system: systemMessage.content,
      }),
      ...(tools && tools.length > 0 && { tools }),
      ...(options?.toolChoice && {
        tool_choice: options.toolChoice === "auto" 
          ? { type: "auto" as const }
          : options.toolChoice === "none"
          ? { type: "none" as const }
          : { type: "tool" as const, name: options.toolChoice.function.name },
      }),
    };

    const response = await this.client.messages.create(params);

    // Extract content and tool calls
    const contentParts: string[] = [];
    const toolCalls: ChatCompletionResult["toolCalls"] = [];

    for (const content of response.content) {
      if (content.type === "text") {
        contentParts.push(content.text);
      } else if (content.type === "tool_use") {
        toolCalls.push({
          id: content.id,
          type: "function",
          function: {
            name: content.name,
            arguments: JSON.stringify(content.input),
          },
        });
      }
    }

    return {
      content: contentParts.join("\n"),
      model: response.model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async uploadFile(
    buffer: Buffer,
    options: FileUploadOptions,
  ): Promise<FileUploadResult> {
    // Anthropic doesn't have a file upload API like OpenAI
    // Files are passed directly in messages
    throw new Error("Anthropic does not support file uploads via API. Pass file content directly in messages.");
  }

  async waitForFileProcessing(
    fileId: string,
    maxWaitSeconds: number = 60,
  ): Promise<FileUploadResult> {
    throw new Error("Anthropic does not support file uploads via API.");
  }

  async getFileContent(fileId: string): Promise<FileContentResult> {
    throw new Error("Anthropic does not support file uploads via API.");
  }

  async deleteFile(fileId: string): Promise<void> {
    throw new Error("Anthropic does not support file uploads via API.");
  }
}

