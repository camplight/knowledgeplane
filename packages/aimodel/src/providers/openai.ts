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
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_EMBEDDING_MODEL } from "../constants";

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
    const model = options?.model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens;
    const responseFormat = options?.responseFormat;

    // If MCP tools are provided, try to use the responses.create() API
    if (options?.mcpTools && options.mcpTools.length > 0) {
      try {
        // Validate MCP server URLs before attempting to use them
        for (const tool of options.mcpTools) {
          try {
            // Use WHATWG URL API instead of deprecated url.parse()
            new URL(tool.server_url);
          } catch (urlError) {
            console.warn(
              `Invalid MCP server URL: ${tool.server_url}. Error: ${urlError instanceof Error ? urlError.message : String(urlError)}`,
            );
            // Skip MCP tools with invalid URLs and continue with standard chat completion
            throw new Error(
              `Invalid MCP server URL for tool "${tool.server_label}": ${tool.server_url}`,
            );
          }
        }

        // Try to use the responses.create() API for MCP tools
        // This API might not be available in all OpenAI SDK versions
        // Convert messages to array format for responses.create() input parameter
        // The API uses 'input' parameter (as array) instead of 'messages'
        const conversationInput = messages.map((msg) => {
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
          // Pass full conversation history via input parameter (as array)
          // This ensures the model has access to previous chat messages
          const requestParams: any = {
            model,
            tools: mcpTools,
            input: conversationInput,
          };

          // Add response format if specified (Responses API uses text.format with type object)
          if (responseFormat === "json_object") {
            requestParams.text = {
              format: {
                type: "json_object",
              },
            };
          }

          const response = await (this.client as any).responses.create(
            requestParams,
          );

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
        // Extract more detailed error information if available
        const errorMessage = error.message || String(error);
        const errorStatus = error.status || error.statusCode;
        const errorDetails = error.response?.data || error.body;

        // Log detailed error information for debugging
        if (errorStatus === 424) {
          console.warn(
            `Failed to use OpenAI responses.create() API: MCP server connection failed (HTTP ${errorStatus}).`,
            `Server URL: ${options.mcpTools?.[0]?.server_url || "unknown"}`,
            `Error: ${errorMessage}`,
            "Falling back to standard chat completion.",
          );
        } else {
          console.warn(
            `Failed to use OpenAI responses.create() API: ${errorMessage}`,
            errorStatus ? `(HTTP ${errorStatus})` : "",
            "Falling back to standard chat completion.",
          );
        }

        // Log additional error details if available (but don't expose sensitive info)
        if (errorDetails && typeof errorDetails === "object") {
          console.debug(
            "MCP tool error details:",
            JSON.stringify(errorDetails),
          );
        }
      }
    }

    // Convert messages to OpenAI format
    // Handle tool role messages (not in ChatMessage type but needed for function calling)
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      messages.map((msg: any) => {
        // Handle tool role messages (for function calling responses)
        if (msg.role === "tool") {
          return {
            role: "tool",
            content:
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
            tool_call_id: msg.tool_call_id,
          };
        }

        // Handle assistant messages with tool_calls
        if (msg.role === "assistant" && msg.tool_calls) {
          return {
            role: "assistant",
            content:
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
            tool_calls: msg.tool_calls,
          };
        }

        if (typeof msg.content === "string") {
          return {
            role: msg.role,
            content: msg.content,
          };
        } else {
          // Handle multimodal content (text, image_url, file)
          // Map file type to OpenAI's expected format
          // Based on: https://gist.github.com/outbounder/14c0c5df7f902b49a8219c05f3053a22
          const mappedContent = msg.content.map((item: any) => {
            if (item.type === "file") {
              // OpenAI expects file content with file_data and filename
              return {
                type: "file",
                file: {
                  file_data: item.file?.file_data,
                  filename: item.file?.filename,
                },
              };
            }
            return item;
          });
          return {
            role: msg.role,
            content: mappedContent,
          } as any;
        }
      });

    // Convert tools to OpenAI format
    const openaiTools:
      | OpenAI.Chat.Completions.ChatCompletionTool[]
      | undefined = options?.tools?.map((tool) => ({
      type: "function",
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters || {},
      },
    }));

    // Convert tool choice
    let toolChoice:
      | OpenAI.Chat.Completions.ChatCompletionToolChoiceOption
      | undefined;
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
      response_format:
        responseFormat === "json_object" ? { type: "json_object" } : undefined,
      tools: openaiTools,
      tool_choice: toolChoice,
    });

    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls
      ?.filter((tc) => tc.type === "function" && "function" in tc)
      .map((tc) => ({
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
    const filesApi = this.client.files as any;
    if (typeof filesApi.delete === "function") {
      await filesApi.delete(fileId);
      return;
    }
    if (typeof filesApi.del === "function") {
      await filesApi.del(fileId);
      return;
    }
    throw new Error("OpenAI SDK files delete API unavailable");
  }

  async embeddings(
    input: string | string[],
    model?: string,
  ): Promise<EmbeddingsResult> {
    const embeddingModel =
      model || process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL;

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
