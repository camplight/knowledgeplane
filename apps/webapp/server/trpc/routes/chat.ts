import { router, protectedProcedure } from "../router";
// Import db module early to ensure fetch patch is applied before any database operations
// This side-effect import ensures the db.ts module is loaded and fetch is patched
import "@knowledgeplane/db/next";
import { Fact, ChatThread, ensureInitialized } from "@knowledgeplane/db/next";
import { z } from "zod";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
  mcpSessionManager,
  McpClient,
} from "@knowledgeplane/aimodel";

// MCP client helper to call facts.search with hybrid search
async function searchFacts(
  query: string,
  aiProvider?: ReturnType<typeof createAIModelClient>,
) {
  try {
    const provider = aiProvider?.getProvider();
    const results = await Fact.search({
      query: query === "*" ? "*" : query,
      k: 10,
      offset: 0,
      include_trashed: false,
      use_vector_search: undefined, // Use hybrid search (default)
      embeddingProvider: provider,
    });
    return results;
  } catch (error) {
    console.error("Error searching facts:", error);
    return [];
  }
}

// Get MCP client for a thread, maintaining persistent sessions
async function getMcpClient(
  threadId: string,
  userId: string,
): Promise<McpClient | null> {
  const mcpServerUrl = getMcpServerUrl();
  if (!mcpServerUrl) {
    return null;
  }

  // Extract API key from URL if present, but keep it in the URL for the client
  const url = new URL(mcpServerUrl);
  const apiKey =
    url.searchParams.get("api_key") || process.env.MCP_SERVER_API_KEY;
  // Keep the full URL with API key for the client
  const fullServerUrl = mcpServerUrl;

  // Get thread to check for existing session ID
  const thread = await ChatThread.getOrCreate(userId);

  // Create session key from thread ID
  const sessionKey = `thread:${thread.id}`;

  // Get or create MCP client with persistent session
  const client = mcpSessionManager.getOrCreateClient(sessionKey, {
    serverUrl: fullServerUrl,
    apiKey: apiKey || undefined,
    userId,
    sessionId: thread.mcp_session_id,
  });

  // Initialize the client (will reuse session if available)
  try {
    await client.initialize();

    // Store session ID if we got a new one
    const sessionId = client.getSessionId();
    if (sessionId && sessionId !== thread.mcp_session_id) {
      await ChatThread.updateMcpSessionId(thread.id, sessionId);
    }

    return client;
  } catch (error) {
    console.error("Failed to initialize MCP client:", error);
    return null;
  }
}

// Get MCP server URL from environment variables
function getMcpServerUrl(): string | null {
  // Try MCP_SERVER_URL first, then construct from MCP_SERVER_HOST and MCP_SERVER_PORT
  let baseUrl: string;
  if (process.env.MCP_SERVER_URL) {
    baseUrl = process.env.MCP_SERVER_URL;
    // Validate URL using WHATWG URL API (not deprecated url.parse())
    try {
      new URL(baseUrl);
    } catch (error) {
      console.error(
        `Invalid MCP_SERVER_URL: ${baseUrl}. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  } else {
    const host = process.env.MCP_SERVER_HOST || "localhost";
    const port = process.env.MCP_SERVER_PORT || "8080";
    const protocol = process.env.MCP_SERVER_PROTOCOL || "http";
    baseUrl = `${protocol}://${host}:${port}/mcp`;

    // Validate constructed URL
    try {
      new URL(baseUrl);
    } catch (error) {
      console.error(
        `Invalid constructed MCP server URL: ${baseUrl}. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  // For internal use (OpenAI MCP connector), add API key as query parameter
  // since OpenAI doesn't support custom headers for MCP servers
  const apiKey = process.env.MCP_SERVER_API_KEY;
  if (apiKey) {
    try {
      // Use WHATWG URL API (not deprecated url.parse())
      const url = new URL(baseUrl);
      url.searchParams.set("api_key", apiKey);
      return url.toString();
    } catch (error) {
      // If URL parsing fails, log error and return null
      console.error(
        `Failed to add API key to MCP server URL: ${baseUrl}. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  return baseUrl;
}

export const chatRouter = router({
  sendMessage: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Ensure database is initialized (applies fetch patch)
      await ensureInitialized();

      const { message } = input;
      const userId = ctx.user.userId;

      // Get or create thread for user
      const thread = await ChatThread.getOrCreate(userId);

      // Store user message
      await ChatThread.addMessage({
        thread_id: thread.id,
        role: "user",
        content: message,
      });

      // Create AI model client (needed for embeddings)
      const client = createAIModelClient(
        (process.env.AI_PROVIDER as any) || "openai",
        process.env.OPENAI_API_KEY,
      );

      // Search facts relevant to the user's message using hybrid search
      const relevantFacts = await searchFacts(message, client);

      // Build context from facts
      const factsContext =
        relevantFacts.length > 0
          ? `\n\nRelevant knowledge from the knowledge base:\n${relevantFacts
              .map((fact, idx) => `${idx + 1}. ${fact.content}`)
              .join("\n")}`
          : "";

      // Build system prompt
      const systemPrompt = `${factsContext}`;

      // Get thread messages (with truncation - preserves tool calls within window)
      const threadMessages = await ChatThread.getMessages(thread.id, 20);

      // Convert to ChatMessage format for AI model
      const chatMessages = ChatThread.messagesToChatMessages(threadMessages);

      // Prepare messages for AI model (add system prompt and new user message)
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: systemPrompt,
        },
        ...chatMessages,
      ];

      console.log(messages);

      const provider = client.getProvider();

      try {
        // Get MCP client with persistent session
        const mcpClient = await getMcpClient(thread.id, userId);

        // Convert MCP tools to OpenAI function tools if MCP client is available
        let tools = undefined;
        if (mcpClient) {
          try {
            tools = await mcpClient.getOpenAITools();
          } catch (error) {
            console.error("Failed to get MCP tools:", error);
            // Continue without tools if we can't get them
          }
        }

        const chatOptions: ChatCompletionOptions = {
          model: process.env.OPENAI_MODEL || "gpt-4o",
          temperature: 0.7,
          maxTokens: 1000,
          tools: tools && tools.length > 0 ? tools : undefined,
        };

        let completion = await provider.chatCompletion(messages, chatOptions);
        let response =
          completion.content || "I'm sorry, I couldn't generate a response.";

        // Handle tool calls if any
        if (
          completion.toolCalls &&
          completion.toolCalls.length > 0 &&
          mcpClient
        ) {
          // Store assistant message with tool calls
          await ChatThread.addMessage({
            thread_id: thread.id,
            role: "assistant",
            content: response,
            tool_calls: completion.toolCalls,
          });

          // Execute each tool call through the MCP client
          const toolResponses: Array<{ tool_call_id: string; response: any }> =
            [];

          for (const toolCall of completion.toolCalls) {
            try {
              const args = JSON.parse(toolCall.function.arguments || "{}");
              const toolResult = await mcpClient.callTool(
                toolCall.function.name,
                args,
              );

              // Store tool response
              await ChatThread.addMessage({
                thread_id: thread.id,
                role: "assistant",
                content: "",
                tool_call_id: toolCall.id,
                tool_response: JSON.stringify(toolResult),
              });

              toolResponses.push({
                tool_call_id: toolCall.id,
                response: toolResult,
              });
            } catch (error: any) {
              console.error(
                `Error calling tool ${toolCall.function.name}:`,
                error,
              );
              const errorResponse = {
                error: error.message || String(error),
              };

              await ChatThread.addMessage({
                thread_id: thread.id,
                role: "assistant",
                content: "",
                tool_call_id: toolCall.id,
                tool_response: JSON.stringify(errorResponse),
              });

              toolResponses.push({
                tool_call_id: toolCall.id,
                response: errorResponse,
              });
            }
          }

          // Get updated messages including tool responses for final completion
          // We need to manually construct messages with tool responses
          const finalMessages: any[] = [
            {
              role: "system",
              content: systemPrompt,
            },
          ];

          // Add all previous messages
          for (const msg of chatMessages) {
            finalMessages.push({
              role: msg.role,
              content: msg.content,
            });
          }

          // Add the assistant message with tool calls
          finalMessages.push({
            role: "assistant",
            content: response,
            tool_calls: completion.toolCalls?.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          });

          // Add tool response messages (OpenAI expects role "tool")
          for (const tr of toolResponses) {
            finalMessages.push({
              role: "tool",
              content: JSON.stringify(tr.response),
              tool_call_id: tr.tool_call_id,
            });
          }

          // Get final response from AI with tool results
          const finalCompletion = await provider.chatCompletion(
            finalMessages as ChatMessage[],
            {
              ...chatOptions,
              tools: tools, // Keep tools available for potential follow-up calls
            },
          );

          response = finalCompletion.content || response;
        }

        // Store final assistant response
        await ChatThread.addMessage({
          thread_id: thread.id,
          role: "assistant",
          content: response,
          tool_calls: completion.toolCalls,
        });

        return {
          response,
          factsUsed: relevantFacts.length,
          facts: relevantFacts.map((f) => ({
            id: f.id,
            content: f.content,
          })),
        };
      } catch (error: any) {
        console.error("AI model API error:", error);
        throw new Error(error.message || "Failed to get response from AI");
      }
    }),
});
