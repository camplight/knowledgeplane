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
async function searchFacts(query: string, aiProvider?: ReturnType<typeof createAIModelClient>) {
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
  if (process.env.MCP_SERVER_URL) {
    return process.env.MCP_SERVER_URL;
  }

  const host = process.env.MCP_SERVER_HOST || "localhost";
  const port = process.env.MCP_SERVER_PORT || "8080";
  const protocol = process.env.MCP_SERVER_PROTOCOL || "http";

  // For OpenAI MCP integration, we might need an SSE endpoint
  // The StreamableHTTPServerTransport should handle SSE automatically
  return `${protocol}://${host}:${port}/mcp`;
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
- Answering questions using information from the knowledge base
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

  searchKnowledge: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        k: z.number().min(1).max(50).default(10),
        use_vector_search: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      // Create AI client for embeddings
      let embeddingProvider;
      if (input.use_vector_search !== false) {
        try {
          const client = createAIModelClient(
            (process.env.AI_PROVIDER as any) || "openai",
            process.env.OPENAI_API_KEY,
          );
          embeddingProvider = client.getProvider();
        } catch (error) {
          console.warn("Failed to create AI client for embeddings, using full-text search only");
        }
      }

      const results = await Fact.search({
        query: input.query,
        k: input.k,
        offset: 0,
        include_trashed: false,
        use_vector_search: input.use_vector_search,
        embeddingProvider,
      });

      return {
        results: results.map((f) => ({
          id: f.id,
          content: f.content,
          score: f.score,
        })),
      };
    }),
});
