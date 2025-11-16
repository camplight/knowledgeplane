import { router, protectedProcedure } from "../router";
import { Fact } from "@knowledgeplane/db/next";
import { z } from "zod";

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
      }),
    )
    .query(async ({ input }) => {
      const results = await Fact.search({
        query: input.query,
        k: input.k,
        offset: input.offset,
        include_trashed: input.include_trashed,
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
});

