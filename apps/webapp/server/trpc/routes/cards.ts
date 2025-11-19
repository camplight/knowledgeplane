import { router, protectedProcedure } from "../router";
import { KnowledgeCard } from "@knowledgeplane/db/next";
import { z } from "zod";

export const cardsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const cards = await KnowledgeCard.list(limit, offset);
      const total = await KnowledgeCard.count();
      return { cards, total, limit, offset };
    }),
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const card = await KnowledgeCard.findById(input.id);
      if (!card) {
        throw new Error("Card not found");
      }
      return { card };
    }),
});
