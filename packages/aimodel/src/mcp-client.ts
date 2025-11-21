/**
 * MCP Client for maintaining persistent sessions and converting MCP tools to OpenAI function tools
 */

import type { Tool } from "./types.js";

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface McpClientOptions {
  serverUrl: string;
  apiKey?: string;
  userId: string;
  sessionId?: string; // Optional: if provided, will reuse existing session
}

export class McpClient {
  private serverUrl: string;
  private apiKey?: string;
  private userId: string;
  private sessionId?: string;
  private tools: McpToolDefinition[] | null = null;
  private initialized = false;

  constructor(options: McpClientOptions) {
    this.serverUrl = options.serverUrl;
    this.apiKey = options.apiKey;
    this.userId = options.userId;
    this.sessionId = options.sessionId;
  }

  /**
   * Initialize the MCP session and fetch available tools
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.tools) {
      return; // Already initialized
    }

    try {
      // If we have a sessionId, try to reuse it by listing tools
      // If that fails, we'll create a new session
      if (this.sessionId) {
        try {
          await this.listTools();
          this.initialized = true;
          return;
        } catch (error) {
          // Session might have expired, create a new one
          this.sessionId = undefined;
        }
      }

      // Initialize new session
      const initResponse = await this.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: "knowledgeplane-aimodel",
          version: "1.0.0",
        },
      });

      // The session ID should be set from response headers
      // Send initialized notification
      await this.sendRequest("notifications/initialized", {});

      // List available tools
      await this.listTools();

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize MCP client:", error);
      throw error;
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<McpToolDefinition[]> {
    const response = await this.sendRequest("tools/list", {});
    // MCP tools/list returns { tools: [...] }
    this.tools = (response.tools || response) as McpToolDefinition[];
    return this.tools;
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    const response = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    });

    // MCP tools/call returns { content: [{ type: "text", text: "..." }] }
    // Extract the text content
    if (response.content && Array.isArray(response.content)) {
      const textContent = response.content
        .filter((item: any) => item.type === "text")
        .map((item: any) => item.text)
        .join("\n");
      
      try {
        // Try to parse as JSON, otherwise return as string
        return JSON.parse(textContent);
      } catch {
        return textContent;
      }
    }

    return response;
  }

  /**
   * Convert MCP tools to OpenAI function tools
   */
  async getOpenAITools(): Promise<Tool[]> {
    if (!this.initialized || !this.tools) {
      await this.initialize();
    }

    if (!this.tools) {
      return [];
    }

    return this.tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description || `Call ${tool.name} on the MCP server`,
        parameters: tool.inputSchema.properties || {},
      },
    }));
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Send a request to the MCP server
   */
  private async sendRequest(
    method: string,
    params: any,
  ): Promise<any> {
    const url = new URL(this.serverUrl);
    if (this.apiKey) {
      url.searchParams.set("api_key", this.apiKey);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const requestId = Math.random().toString(36).substring(7);
    const body: any = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    };

    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `MCP request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();

    // Handle JSON-RPC response format
    if (data.error) {
      throw new Error(
        `MCP error: ${data.error.code || "unknown"} - ${data.error.message || JSON.stringify(data.error)}`,
      );
    }

    // Extract session ID from response headers if available
    const sessionIdHeader = response.headers.get("mcp-session-id");
    if (sessionIdHeader) {
      this.sessionId = sessionIdHeader;
    }

    // Return the result, handling both direct result and nested result
    return data.result !== undefined ? data.result : data;
  }
}

/**
 * Session manager for maintaining MCP client instances per user/thread
 */
class McpSessionManager {
  private sessions = new Map<string, McpClient>();

  /**
   * Get or create an MCP client for a given session key
   */
  getOrCreateClient(
    sessionKey: string,
    options: McpClientOptions,
  ): McpClient {
    if (this.sessions.has(sessionKey)) {
      const client = this.sessions.get(sessionKey)!;
      // Update userId if it changed
      if (client["userId"] !== options.userId) {
        client["userId"] = options.userId;
      }
      return client;
    }

    const client = new McpClient(options);
    this.sessions.set(sessionKey, client);
    return client;
  }

  /**
   * Remove a session
   */
  removeSession(sessionKey: string): void {
    this.sessions.delete(sessionKey);
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
  }
}

// Singleton session manager
export const mcpSessionManager = new McpSessionManager();

