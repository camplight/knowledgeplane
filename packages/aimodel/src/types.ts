/**
 * Supported AI model providers
 */
export type Provider = "openai" | "anthropic" | "google" | "azure";

/**
 * Chat message role
 */
export type MessageRole = "system" | "user" | "assistant";

/**
 * Chat message
 */
export interface ChatMessage {
  role: MessageRole;
  content: string | Array<{ 
    type: "text" | "image_url" | "file"; 
    text?: string; 
    image_url?: { url: string };
    file?: { file_data: string; filename: string };
  }>;
}

/**
 * Tool definition for function calling
 */
export interface Tool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

/**
 * MCP tool definition for OpenAI MCP connectors
 */
export interface McpTool {
  type: "mcp";
  server_label: string;
  server_description: string;
  server_url: string;
  require_approval?: "always" | "never" | "auto";
}

/**
 * Chat completion options
 */
export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
  tools?: Tool[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  mcpTools?: McpTool[];
}

/**
 * Tool call result
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Chat completion result
 */
export interface ChatCompletionResult {
  content: string;
  model: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * File upload options
 */
export interface FileUploadOptions {
  filename: string;
  mimeType: string;
  purpose?: "assistants" | "fine-tune";
}

/**
 * File upload result
 */
export interface FileUploadResult {
  fileId: string;
  status: "uploading" | "processing" | "processed" | "error";
}

/**
 * File content result
 */
export interface FileContentResult {
  content: string;
  fileId: string;
}

/**
 * Embeddings result
 */
export interface EmbeddingsResult {
  embeddings: number[][];
  model: string;
  usage?: {
    promptTokens?: number;
    totalTokens?: number;
  };
}

