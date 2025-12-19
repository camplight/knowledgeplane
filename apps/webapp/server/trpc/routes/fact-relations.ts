import { router, protectedProcedure } from "../router";
import { FactRelation, Fact, WorkspaceMember } from "@knowledgeplane/db/next";
import { z } from "zod";

export const factRelationsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          from_fact: z.string().optional(),
          to_fact: z.string().optional(),
          type: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const relations = await FactRelation.query({
        workspace_id: ctx.workspaceId,
        from_fact: input?.from_fact,
        to_fact: input?.to_fact,
        type: input?.type,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
      });
      // Get total count by querying without limit/offset
      const allRelations = await FactRelation.query({
        workspace_id: ctx.workspaceId,
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
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Get both facts to validate they belong to the same workspace
      const fromFact = await Fact.findById(input.from_fact);
      const toFact = await Fact.findById(input.to_fact);

      if (!fromFact) {
        throw new Error("Source fact not found");
      }
      if (!toFact) {
        throw new Error("Target fact not found");
      }

      // Validate that both facts belong to user's workspace
      if (
        fromFact.workspace_id !== ctx.workspaceId ||
        toFact.workspace_id !== ctx.workspaceId
      ) {
        throw new Error("Both facts must belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const relation = await FactRelation.create({
        from_fact: input.from_fact,
        to_fact: input.to_fact,
        type: input.type,
        workspace_id: ctx.workspaceId,
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
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Get the relation first to check its workspace_id
      const existingRelation = await FactRelation.findById(input.id);
      if (!existingRelation) {
        throw new Error("FactRelation not found");
      }

      // Validate that relation belongs to user's workspace
      if (existingRelation.workspace_id !== ctx.workspaceId) {
        throw new Error("FactRelation does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
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
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Get the relation first to check its workspace_id
      const relation = await FactRelation.findById(input.id);
      if (!relation) {
        throw new Error("FactRelation not found");
      }

      // Validate that relation belongs to user's workspace
      if (relation.workspace_id !== ctx.workspaceId) {
        throw new Error("FactRelation does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
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
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Get the fact first to check its workspace_id
      const fact = await Fact.findById(input.fact_id);
      if (!fact) {
        throw new Error("Fact not found");
      }

      // Validate that fact belongs to user's workspace
      if (fact.workspace_id !== ctx.workspaceId) {
        throw new Error("Fact does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const outgoing = await FactRelation.getRelatedFacts(
        input.fact_id,
        input.type,
      );
      const incoming = await FactRelation.getIncomingRelations(
        input.fact_id,
        input.type,
      );

      // Filter results to only include relations and facts from the same workspace
      const filteredOutgoing = outgoing.filter(
        (r) =>
          r.relation.workspace_id === ctx.workspaceId &&
          r.fact.workspace_id === ctx.workspaceId,
      );
      const filteredIncoming = incoming.filter(
        (r) =>
          r.relation.workspace_id === ctx.workspaceId &&
          r.fact.workspace_id === ctx.workspaceId,
      );

      return {
        outgoing: filteredOutgoing,
        incoming: filteredIncoming,
      };
    }),
});
