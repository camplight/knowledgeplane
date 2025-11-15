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
  content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }>;
}

/**
 * Chat completion options
 */
export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

/**
 * Chat completion result
 */
export interface ChatCompletionResult {
  content: string;
  model: string;
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

