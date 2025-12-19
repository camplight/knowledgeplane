import { collections, ensureInitialized } from "../db";
import type { ToolCall, ChatMessage } from "@knowledgeplane/aimodel";

export interface ChatThreadRecord {
  _key?: string;
  _id?: string;
  id: string;
  user_id: string;
  workspace_id: string; // Workspace ID
  created_at: string;
  updated_at: string;
  mcp_session_id?: string; // MCP session ID for persistent connections
}

export interface ChatMessageRecord {
  _key?: string;
  _id?: string;
  id: string;
  thread_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // For tool response messages
  tool_response?: string; // For tool response messages
  created_at: string;
  sequence: number; // Order of messages in the thread
}

export interface ChatMessageInput {
  thread_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_response?: string;
}

export class ChatThread {
  /**
   * Create or get existing thread for a user and workspace
   */
  static async getOrCreate(
    userId: string,
    workspaceId: string,
  ): Promise<ChatThreadRecord> {
    await ensureInitialized();

    // Try to find existing thread
    const aql = `
      FOR thread IN chat_threads
        FILTER thread.user_id == @userId
        FILTER thread.workspace_id == @workspaceId
        SORT thread.updated_at DESC
        LIMIT 1
        RETURN thread
    `;

    const cursor = await collections.chat_threads.database.query(aql, {
      userId,
      workspaceId,
    });
    const existing = await cursor.next();

    if (existing) {
      return this._normalizeRecord(existing);
    }

    // Create new thread
    const now = new Date().toISOString();
    const doc = {
      user_id: userId,
      workspace_id: workspaceId,
      created_at: now,
      updated_at: now,
    };

    const result = await collections.chat_threads.save(doc, {
      returnNew: true,
    });
    return this._normalizeRecord(result.new!);
  }

  /**
   * Add a message to a thread
   */
  static async addMessage(input: ChatMessageInput): Promise<ChatMessageRecord> {
    await ensureInitialized();

    // Get the next sequence number
    const sequenceAql = `
      FOR msg IN chat_messages
        FILTER msg.thread_id == @threadId
        COLLECT WITH COUNT INTO count
        RETURN count
    `;

    const sequenceCursor = await collections.chat_messages.database.query(
      sequenceAql,
      { threadId: input.thread_id },
    );
    const currentCount = (await sequenceCursor.next()) || 0;
    const sequence = currentCount + 1;

    const now = new Date().toISOString();
    const doc = {
      thread_id: input.thread_id,
      role: input.role,
      content: input.content,
      tool_calls: input.tool_calls || null,
      tool_call_id: input.tool_call_id || null,
      tool_response: input.tool_response || null,
      created_at: now,
      sequence,
    };

    const result = await collections.chat_messages.save(doc, {
      returnNew: true,
    });

    // Update thread's updated_at
    const threadKey = this.extractKey(input.thread_id);
    await collections.chat_threads.update(threadKey, {
      updated_at: now,
    });

    return this._normalizeMessageRecord(result.new!);
  }

  /**
   * Get messages for a thread, with truncation logic
   * Preserves tool calls within the window of the last 20 human messages
   */
  static async getMessages(
    threadId: string,
    maxHumanMessages: number = 20,
  ): Promise<ChatMessageRecord[]> {
    await ensureInitialized();

    // Get all messages ordered by sequence
    const aql = `
      FOR msg IN chat_messages
        FILTER msg.thread_id == @threadId
        SORT msg.sequence ASC
        RETURN msg
    `;

    const cursor = await collections.chat_messages.database.query(aql, {
      threadId,
    });
    const allMessages = await cursor.all();

    if (allMessages.length === 0) {
      return [];
    }

    // Count human messages (user + assistant with content)
    const humanMessages: ChatMessageRecord[] = [];
    for (const msg of allMessages) {
      const normalized = this._normalizeMessageRecord(msg);
      if (
        normalized.role === "user" ||
        (normalized.role === "assistant" && normalized.content)
      ) {
        humanMessages.push(normalized);
      }
    }

    // If we have <= maxHumanMessages human messages, return all
    if (humanMessages.length <= maxHumanMessages) {
      return allMessages.map((m) => this._normalizeMessageRecord(m));
    }

    // Find the cutoff point: keep the last maxHumanMessages human messages
    const cutoffHumanMessage =
      humanMessages[humanMessages.length - maxHumanMessages];
    const cutoffSequence = cutoffHumanMessage.sequence;

    // Find all tool calls that are part of messages we're keeping
    // A tool call is kept if:
    // 1. It's in a message we're keeping (sequence >= cutoffSequence)
    // 2. Or it's a tool response that corresponds to a tool call we're keeping
    const messagesToKeep: ChatMessageRecord[] = [];
    const toolCallIdsToKeep = new Set<string>();

    // First pass: identify tool calls in messages we're keeping
    for (const msg of allMessages) {
      const normalized = this._normalizeMessageRecord(msg);
      if (normalized.sequence >= cutoffSequence) {
        messagesToKeep.push(normalized);
        if (normalized.tool_calls) {
          for (const toolCall of normalized.tool_calls) {
            toolCallIdsToKeep.add(toolCall.id);
          }
        }
      }
    }

    // Second pass: add tool response messages for tool calls we're keeping
    // Also add any messages before cutoff that have tool responses we need
    for (const msg of allMessages) {
      const normalized = this._normalizeMessageRecord(msg);
      if (
        normalized.tool_call_id &&
        toolCallIdsToKeep.has(normalized.tool_call_id)
      ) {
        // This is a tool response for a tool call we're keeping
        if (!messagesToKeep.find((m) => m.id === normalized.id)) {
          messagesToKeep.push(normalized);
        }
      }
    }

    // Sort by sequence and return
    messagesToKeep.sort((a, b) => a.sequence - b.sequence);
    return messagesToKeep;
  }

  /**
   * Convert messages to ChatMessage format for AI model
   * Returns messages that can be passed to the AI provider
   * Note: Tool messages are returned as assistant messages with special handling
   * The OpenAI provider will need to handle tool messages separately
   */
  static messagesToChatMessages(messages: ChatMessageRecord[]): ChatMessage[] {
    const result: ChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system" || msg.role === "user") {
        result.push({
          role: msg.role,
          content: msg.content,
        });
      } else if (msg.role === "assistant") {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Assistant message with tool calls
          // Note: ChatMessage doesn't support tool_calls, so we'll include them in content
          // The actual tool calls will be handled by the provider
          result.push({
            role: "assistant",
            content: msg.content || "",
          });
          // Tool calls are stored separately and will be handled by the provider
        } else if (msg.tool_call_id && msg.tool_response) {
          // Tool response message - skip for now as ChatMessage doesn't support tool role
          // These will be handled separately if needed for regular function tools
          // For MCP tools, OpenAI handles them internally
        } else {
          // Regular assistant message
          result.push({
            role: "assistant",
            content: msg.content,
          });
        }
      }
    }

    return result;
  }

  /**
   * Delete a thread and all its messages
   */
  static async delete(threadId: string): Promise<void> {
    await ensureInitialized();

    const threadKey = this.extractKey(threadId);

    // Delete all messages
    const deleteMessagesAql = `
      FOR msg IN chat_messages
        FILTER msg.thread_id == @threadId
        REMOVE msg IN chat_messages
    `;
    await collections.chat_messages.database.query(deleteMessagesAql, {
      threadId,
    });

    // Delete thread
    try {
      await collections.chat_threads.remove(threadKey);
    } catch (error: any) {
      if (error.errorNum !== 1202) {
        // 1202 = document not found
        throw error;
      }
    }
  }

  // Helper methods
  static extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  /**
   * Update MCP session ID for a thread
   */
  static async updateMcpSessionId(
    threadId: string,
    mcpSessionId: string,
  ): Promise<void> {
    await ensureInitialized();
    const threadKey = this.extractKey(threadId);
    await collections.chat_threads.update(threadKey, {
      mcp_session_id: mcpSessionId,
      updated_at: new Date().toISOString(),
    });
  }

  static _normalizeRecord(doc: any): ChatThreadRecord {
    if (!doc) {
      throw new Error("Cannot normalize null or undefined thread document");
    }
    return {
      id: doc._id || `chat_threads/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      user_id: doc.user_id,
      workspace_id: doc.workspace_id,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      mcp_session_id: doc.mcp_session_id,
    };
  }

  static _normalizeMessageRecord(doc: any): ChatMessageRecord {
    if (!doc) {
      throw new Error("Cannot normalize null or undefined message document");
    }
    return {
      id: doc._id || `chat_messages/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      thread_id: doc.thread_id,
      role: doc.role,
      content: doc.content || "",
      tool_calls: doc.tool_calls || undefined,
      tool_call_id: doc.tool_call_id || undefined,
      tool_response: doc.tool_response || undefined,
      created_at: doc.created_at,
      sequence: doc.sequence,
    };
  }
}
