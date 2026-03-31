import { router, protectedProcedure } from "../router";
import { KnowledgeCard, WorkspaceMember } from "@knowledgeplane/db/next";
import { z } from "zod";
import { stripEmbeddings, stripEmbeddingsArray } from "../strip-embeddings";

export const cardsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(1000).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(ctx.workspaceId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const cards = await KnowledgeCard.list(ctx.workspaceId, limit, offset);
      const total = await KnowledgeCard.count(ctx.workspaceId);
      return { cards: stripEmbeddingsArray(cards), total, limit, offset };
    }),
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      const card = await KnowledgeCard.findById(input.id);
      if (!card) {
        throw new Error("Card not found");
      }

      // Validate that card belongs to user's workspace
      if (card.workspace_id !== ctx.workspaceId) {
        throw new Error("Card does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(ctx.workspaceId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      return { card: stripEmbeddings(card) };
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Get the card first to check its workspace_id
      const card = await KnowledgeCard.findById(input.id);
      if (!card) {
        throw new Error("Card not found");
      }

      // Validate that card belongs to user's workspace
      if (card.workspace_id !== ctx.workspaceId) {
        throw new Error("Card does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(ctx.workspaceId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      await KnowledgeCard.delete(input.id, ctx.user.userId);
      return { success: true };
    }),
});
