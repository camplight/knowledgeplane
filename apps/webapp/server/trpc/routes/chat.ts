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
} from "@knowledgeplane/aimodel";

// Build MCP server URL with API key and workspace_id
function getMcpServerUrl(workspaceId?: string | null): string | undefined {
  // Prefer full URL if provided
  let baseUrl: string;
  if (process.env.MCP_SERVER_URL) {
    baseUrl = process.env.MCP_SERVER_URL;
  } else {
    // Otherwise construct from components
    const protocol = process.env.MCP_SERVER_PROTOCOL || "http";
    const host = process.env.MCP_SERVER_HOST || "localhost";
    const port = process.env.MCP_SERVER_PORT || "8080";
    baseUrl = `${protocol}://${host}:${port}/mcp`;
  }

  const url = new URL(baseUrl);
  
  // Add API key as query parameter if provided
  if (process.env.MCP_SERVER_API_KEY) {
    url.searchParams.set("api_key", process.env.MCP_SERVER_API_KEY);
  }
  
  // Add workspace_id as query parameter if provided
  if (workspaceId) {
    url.searchParams.set("workspace_id", workspaceId);
  }

  return url.toString();
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

      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      const { message } = input;
      const userId = ctx.user.userId;

      // Validate workspace membership
      const { WorkspaceMember } = await import("@knowledgeplane/db/next");
      const member = await WorkspaceMember.findByWorkspaceAndUser(ctx.workspaceId, userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      // Get or create thread for user and workspace
      const thread = await ChatThread.getOrCreate(userId, ctx.workspaceId);

      // Store user message
      await ChatThread.addMessage({
        thread_id: thread.id,
        role: "user",
        content: message,
      });

      // Create AI model client
      const client = createAIModelClient(
        (process.env.AI_PROVIDER as any) || "openai",
        process.env.OPENAI_API_KEY,
      );

      // Get MCP server URL with workspace_id
      const mcpServerUrl = getMcpServerUrl(ctx.workspaceId);

      // Build system prompt with instructions for JSON response
      // Note: If MCP tools are available, use them. If not, respond normally without mentioning tools.
      const systemPrompt = `You are a helpful assistant${mcpServerUrl ? " with access to a knowledge base through MCP tools" : ""}.

IMPORTANT: You MUST always return your response as valid JSON with the following structure:
{
  "content": "Your response text here",
  "usedFacts": ["fact_id_1", "fact_id_2", ...]
}

Rules:
1. The "content" field should contain your actual response to the user
2. The "usedFacts" array should contain the IDs (as strings) of facts that you actually used to construct your response
3. If you didn't use any facts, return an empty array [] for "usedFacts"
4. Always return valid JSON, even if tool calls fail or you don't use any facts
5. ${mcpServerUrl ? "After using MCP tools, you must still format your final response as JSON with the structure above" : "Simply respond to the user's question in the content field"}
6. ${mcpServerUrl ? "If MCP tools are available, use them to search the knowledge base. If tools are not available or fail, respond normally without mentioning the tools." : "Respond to the user's question directly."}
7. NEVER output tool specifications or tool call details as text - only use tools if they are actually available and working

Example response:
{
  "content": "${mcpServerUrl ? "Based on the knowledge base, I found that..." : "I can help you with that."}",
  "usedFacts": ${mcpServerUrl ? '["facts/123", "facts/456"]' : "[]"}
}`;

      // Get thread messages (with truncation)
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

      const provider = client.getProvider();

      try {
        const chatOptions: ChatCompletionOptions = {
          model: process.env.OPENAI_MODEL || "gpt-4o",
          temperature: 0.7,
          maxTokens: 1000,
          responseFormat: "json_object", // Request JSON response
        };

        // Add MCP tools if MCP server URL is configured
        if (mcpServerUrl) {
          chatOptions.mcpTools = [
            {
              type: "mcp",
              server_label: "KnowledgePlane",
              server_description:
                "Knowledge base with facts and knowledge cards",
              server_url: mcpServerUrl,
              require_approval: "never",
            },
          ];
        }

        const completion = await provider.chatCompletion(messages, chatOptions);
        const responseText =
          completion.content || "I'm sorry, I couldn't generate a response.";

        // Parse JSON response to extract content and usedFacts
        let responseContent = responseText;
        let usedFactIds: string[] = [];

        try {
          const parsedResponse = JSON.parse(responseText);
          if (parsedResponse.content) {
            // Handle case where content might be an object (with nested content and metadata)
            if (typeof parsedResponse.content === "string") {
              responseContent = parsedResponse.content;
            } else if (
              typeof parsedResponse.content === "object" &&
              parsedResponse.content !== null
            ) {
              // If content is an object, try to extract the string content
              if (typeof parsedResponse.content.content === "string") {
                responseContent = parsedResponse.content.content;
              } else {
                // Fallback: stringify the object if it doesn't have a content property
                responseContent = JSON.stringify(parsedResponse.content);
              }
            }
          }
          if (Array.isArray(parsedResponse.usedFacts)) {
            usedFactIds = parsedResponse.usedFacts;
          }
        } catch (parseError) {
          // If parsing fails, use the response as-is (fallback)
          console.warn(
            "Failed to parse JSON response, using raw response:",
            parseError,
          );
        }

        // Store assistant response (store the content, not the JSON)
        await ChatThread.addMessage({
          thread_id: thread.id,
          role: "assistant",
          content: responseContent,
        });

        // Fetch fact objects by IDs
        const factsToReturn: Array<{ id: string; content: string }> = [];
        if (usedFactIds.length > 0) {
          try {
            const facts = await Promise.all(
              usedFactIds.map(async (factId) => {
                try {
                  const fact = await Fact.findById(factId);
                  if (
                    fact &&
                    !fact.trashed &&
                    fact.workspace_id === ctx.workspaceId
                  ) {
                    return {
                      id: fact.id,
                      content: fact.content,
                    };
                  }
                } catch (error) {
                  console.warn(`Failed to fetch fact ${factId}:`, error);
                }
                return null;
              }),
            );
            factsToReturn.push(
              ...facts.filter(
                (f): f is { id: string; content: string } => f !== null,
              ),
            );
          } catch (error) {
            console.error("Error fetching used facts:", error);
          }
        }

        return {
          response: responseContent,
          factsUsed: factsToReturn.length,
          facts: factsToReturn,
        };
      } catch (error: any) {
        console.error("AI model API error:", error);
        throw new Error(error.message || "Failed to get response from AI");
      }
    }),
});
