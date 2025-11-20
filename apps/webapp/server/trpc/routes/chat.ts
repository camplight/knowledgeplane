import { router, protectedProcedure } from "../router";
import { Fact } from "@knowledgeplane/db/next";
import { z } from "zod";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
  type McpTool,
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
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant", "system"]),
              content: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { message, conversationHistory = [] } = input;

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
      const systemPrompt = `You are an AI assistant with access to a knowledge base. You can help users by:
- Answering questions using information from the knowledge base and the relevant knowledge passed in the system prompt.
- Providing insights based on stored facts
- Helping users understand relationships between different pieces of information
- Suggesting new facts to add to the knowledge base when appropriate

When you reference information from the knowledge base, be clear about it. If the knowledge base doesn't have relevant information, say so honestly.

${factsContext}`;

      const provider = client.getProvider();

      // Prepare messages for AI model
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: systemPrompt,
        },
        ...conversationHistory.map((msg) => ({
          role: msg.role as "system" | "user" | "assistant",
          content: msg.content,
        })),
        {
          role: "user",
          content: message,
        },
      ];

      try {
        // Configure MCP tools if MCP server URL is available
        const mcpServerUrl = getMcpServerUrl();
        const mcpTools: McpTool[] | undefined = mcpServerUrl
          ? [
              {
                type: "mcp",
                server_label: "knowledgeplane",
                server_description:
                  "A knowledge base MCP server for storing, searching, and managing facts, topics, and files. Provides tools for fact management, search, file uploads, and knowledge organization.",
                server_url: mcpServerUrl,
                require_approval: "never",
              },
            ]
          : undefined;

        const chatOptions: ChatCompletionOptions = {
          model: process.env.OPENAI_MODEL || "gpt-4o",
          temperature: 0.7,
          maxTokens: 1000,
          mcpTools: mcpTools,
        };

        const completion = await provider.chatCompletion(messages, chatOptions);

        const response =
          completion.content || "I'm sorry, I couldn't generate a response.";

        // Optionally, write the user's question and the AI's response as facts
        // This could be configurable or done selectively

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
