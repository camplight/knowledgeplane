import { router, protectedProcedure } from "../router";
import { Fact } from "@knowledgeplane/db/next";
import { z } from "zod";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
} from "@knowledgeplane/aimodel";

// MCP client helper to call facts.search
async function searchFacts(query: string, knowledgeContext?: string) {
  try {
    const results = await Fact.search({
      query: query === "*" ? "*" : query,
      knowledge_context: knowledgeContext,
      k: 10,
      offset: 0,
      include_trashed: false,
    });
    return results;
  } catch (error) {
    console.error("Error searching facts:", error);
    return [];
  }
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
        knowledgeContext: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { message, conversationHistory = [], knowledgeContext } = input;

      // Search facts relevant to the user's message
      const relevantFacts = await searchFacts(message, knowledgeContext);

      // Build context from facts
      const factsContext =
        relevantFacts.length > 0
          ? `\n\nRelevant knowledge from the knowledge base:\n${relevantFacts
              .map(
                (fact, idx) =>
                  `${idx + 1}. ${fact.content}${fact.knowledge_context ? ` (Context: ${fact.knowledge_context})` : ""}`,
              )
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

      // Create AI model client
      const client = createAIModelClient(
        (process.env.AI_PROVIDER as any) || "openai",
        process.env.OPENAI_API_KEY,
      );
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
        const chatOptions: ChatCompletionOptions = {
          model: process.env.OPENAI_MODEL || "gpt-4o",
          temperature: 0.7,
          maxTokens: 1000,
        };

        const completion = await provider.chatCompletion(messages, chatOptions);

        const response = completion.content || "I'm sorry, I couldn't generate a response.";

        // Optionally, write the user's question and the AI's response as facts
        // This could be configurable or done selectively

        return {
          response,
          factsUsed: relevantFacts.length,
          facts: relevantFacts.map((f) => ({
            id: f.id,
            content: f.content,
            knowledge_context: f.knowledge_context,
          })),
        };
      } catch (error: any) {
        console.error("AI model API error:", error);
        throw new Error(
          error.message || "Failed to get response from AI",
        );
      }
    }),

  searchKnowledge: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        knowledgeContext: z.string().optional(),
        k: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ input }) => {
      const results = await Fact.search({
        query: input.query,
        knowledge_context: input.knowledgeContext,
        k: input.k,
        offset: 0,
        include_trashed: false,
      });

      return {
        results: results.map((f) => ({
          id: f.id,
          content: f.content,
          knowledge_context: f.knowledge_context,
          score: f.score,
        })),
      };
    }),
});

