import { router, protectedProcedure } from "../router";
import { FactRelation, Fact, TeamMember } from "@knowledgeplane/db/next";
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
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      const relations = await FactRelation.query({
        team_id: ctx.teamId,
        from_fact: input?.from_fact,
        to_fact: input?.to_fact,
        type: input?.type,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
      });
      // Get total count by querying without limit/offset
      const allRelations = await FactRelation.query({
        team_id: ctx.teamId,
        from_fact: input?.from_fact,
        to_fact: input?.to_fact,
        type: input?.type,
      });
      return { relations, total: allRelations.length };
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
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      // Get both facts to validate they belong to the same team
      const fromFact = await Fact.findById(input.from_fact);
      const toFact = await Fact.findById(input.to_fact);

      if (!fromFact) {
        throw new Error("Source fact not found");
      }
      if (!toFact) {
        throw new Error("Target fact not found");
      }

      // Validate that both facts belong to user's team
      if (fromFact.team_id !== ctx.teamId || toFact.team_id !== ctx.teamId) {
        throw new Error("Both facts must belong to your team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      const relation = await FactRelation.create({
        from_fact: input.from_fact,
        to_fact: input.to_fact,
        type: input.type,
        team_id: ctx.teamId,
        metadata: input.metadata,
        created_by: ctx.user.userId,
      });
      return { relation };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        type: z.string().min(1).optional(),
        metadata: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      // Get the relation first to check its team_id
      const existingRelation = await FactRelation.findById(input.id);
      if (!existingRelation) {
        throw new Error("FactRelation not found");
      }

      // Validate that relation belongs to user's team
      if (existingRelation.team_id !== ctx.teamId) {
        throw new Error("FactRelation does not belong to your team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      const { id, ...updates } = input;
      const relation = await FactRelation.update(id, updates);
      return { relation };
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      // Get the relation first to check its team_id
      const relation = await FactRelation.findById(input.id);
      if (!relation) {
        throw new Error("FactRelation not found");
      }

      // Validate that relation belongs to user's team
      if (relation.team_id !== ctx.teamId) {
        throw new Error("FactRelation does not belong to your team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      await FactRelation.delete(input.id);
      return { success: true };
    }),
  getForFact: protectedProcedure
    .input(
      z.object({
        fact_id: z.string().min(1),
        type: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      // Get the fact first to check its team_id
      const fact = await Fact.findById(input.fact_id);
      if (!fact) {
        throw new Error("Fact not found");
      }

      // Validate that fact belongs to user's team
      if (fact.team_id !== ctx.teamId) {
        throw new Error("Fact does not belong to your team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      const outgoing = await FactRelation.getRelatedFacts(input.fact_id, input.type);
      const incoming = await FactRelation.getIncomingRelations(input.fact_id, input.type);

      // Filter results to only include relations and facts from the same team
      const filteredOutgoing = outgoing.filter(
        (r) => r.relation.team_id === ctx.teamId && r.fact.team_id === ctx.teamId,
      );
      const filteredIncoming = incoming.filter(
        (r) => r.relation.team_id === ctx.teamId && r.fact.team_id === ctx.teamId,
      );

      return {
        outgoing: filteredOutgoing,
        incoming: filteredIncoming,
      };
    }),
});

