import { router, protectedProcedure } from "../router";
import { FactRelation, Fact } from "@knowledgeplane/db/next";
import { z } from "zod";

export const factRelationsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        from_fact: z.string().optional(),
        to_fact: z.string().optional(),
        type: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional(),
    )
    .query(async ({ input }) => {
      const relations = await FactRelation.query({
        from_fact: input?.from_fact,
        to_fact: input?.to_fact,
        type: input?.type,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
      });
      return { relations };
    }),
  create: protectedProcedure
    .input(
      z.object({
        from_fact: z.string().min(1),
        to_fact: z.string().min(1),
        type: z.string().min(1),
        metadata: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new Error("User not authenticated");
      }
      const relation = await FactRelation.create({
        from_fact: input.from_fact,
        to_fact: input.to_fact,
        type: input.type,
        metadata: input.metadata,
        created_by: ctx.user.userId,
      });
      return { relation };
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      // Note: FactRelation doesn't have a delete method yet
      // For now, we'll need to implement it or use AQL
      // This is a placeholder
      throw new Error("Delete not yet implemented for FactRelation");
    }),
  getForFact: protectedProcedure
    .input(
      z.object({
        fact_id: z.string().min(1),
        type: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const outgoing = await FactRelation.getRelatedFacts(input.fact_id, input.type);
      const incoming = await FactRelation.getIncomingRelations(input.fact_id, input.type);
      return {
        outgoing,
        incoming,
      };
    }),
});

