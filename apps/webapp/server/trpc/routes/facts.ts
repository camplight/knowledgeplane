import { router, protectedProcedure } from "../router";
import { Fact } from "@knowledgeplane/db";
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
});

