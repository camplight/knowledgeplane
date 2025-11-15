import type {
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  FileUploadOptions,
  FileUploadResult,
  FileContentResult,
} from "../types.js";

/**
 * Base interface for AI model providers
 */
export interface AIModelProvider {
  /**
   * Get the provider name
   */
  getProvider(): string;

  /**
   * Chat completion
   */
  chatCompletion(
    messages: ChatMessage[],
    options?: ChatCompletionOptions,
  ): Promise<ChatCompletionResult>;

  /**
   * Upload a file to the provider
   */
  uploadFile(
    buffer: Buffer,
    options: FileUploadOptions,
  ): Promise<FileUploadResult>;

  /**
   * Wait for file processing to complete
   */
  waitForFileProcessing(
    fileId: string,
    maxWaitSeconds?: number,
  ): Promise<FileUploadResult>;

  /**
   * Get file content
   */
  getFileContent(fileId: string): Promise<FileContentResult>;

  /**
   * Delete a file
   */
  deleteFile(fileId: string): Promise<void>;
}

