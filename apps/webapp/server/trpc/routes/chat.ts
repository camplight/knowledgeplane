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

// Build MCP server URL with API key
function getMcpServerUrl(): string | undefined {
  // Prefer full URL if provided
  if (process.env.MCP_SERVER_URL) {
    const url = new URL(process.env.MCP_SERVER_URL);
    // Add API key as query parameter if provided
    if (process.env.MCP_SERVER_API_KEY) {
      url.searchParams.set("api_key", process.env.MCP_SERVER_API_KEY);
    }
    return url.toString();
  }

  // Otherwise construct from components
  const protocol = process.env.MCP_SERVER_PROTOCOL || "http";
  const host = process.env.MCP_SERVER_HOST || "localhost";
  const port = process.env.MCP_SERVER_PORT || "8080";
  const baseUrl = `${protocol}://${host}:${port}/mcp`;

  // Add API key as query parameter if provided
  if (process.env.MCP_SERVER_API_KEY) {
    const url = new URL(baseUrl);
    url.searchParams.set("api_key", process.env.MCP_SERVER_API_KEY);
    return url.toString();
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

      // Create AI model client
      const client = createAIModelClient(
        (process.env.AI_PROVIDER as any) || "openai",
        process.env.OPENAI_API_KEY,
      );

      // Get MCP server URL
      const mcpServerUrl = getMcpServerUrl();

      // Build system prompt with instructions for JSON response
      const systemPrompt = `You are a helpful assistant with access to a knowledge base through MCP tools.

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
5. After using MCP tools, you must still format your final response as JSON with the structure above

Example response:
{
  "content": "Based on the knowledge base, I found that...",
  "usedFacts": ["facts/123", "facts/456"]
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
            responseContent = parsedResponse.content;
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
                  if (fact && !fact.trashed) {
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
