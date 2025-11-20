import { router, protectedProcedure } from "../router";
import { Fact } from "@knowledgeplane/db/next";
import { z } from "zod";
import { createAIModelClient } from "@knowledgeplane/aimodel";

export const factsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        includeTrashed: z.boolean().default(false),
      }).optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const includeTrashed = input?.includeTrashed || false;
      const facts = await Fact.list(limit, offset, includeTrashed);
      const total = await Fact.count(includeTrashed);
      return { facts, total, limit, offset };
    }),
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        k: z.number().min(1).max(100).default(10),
        offset: z.number().min(0).default(0),
        include_trashed: z.boolean().default(false),
        use_vector_search: z.boolean().optional(), // Optional: true for vector only, false for full-text only, undefined for hybrid
      }),
    )
    .query(async ({ input }) => {
      // Create AI client for embeddings if vector search is requested
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
        offset: input.offset,
        include_trashed: input.include_trashed,
        use_vector_search: input.use_vector_search,
        embeddingProvider,
      });
      return { results };
    }),
  create: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1),
        metadata: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new Error("User not authenticated");
      }
      const fact = await Fact.write({
        content: input.content,
        metadata: input.metadata,
        created_by: ctx.user.userId,
        last_updated_by: ctx.user.userId,
      });
      return { fact };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        content: z.string().min(1).optional(),
        metadata: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new Error("User not authenticated");
      }
      const fact = await Fact.update({
        id: input.id,
        content: input.content,
        metadata: input.metadata,
        last_updated_by: ctx.user.userId,
      });
      return { fact };
    }),
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const fact = await Fact.findById(input.id);
      if (!fact) {
        throw new Error("Fact not found");
      }
      return { fact };
    }),
});

