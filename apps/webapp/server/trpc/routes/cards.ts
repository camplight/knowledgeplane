import { router, protectedProcedure } from "../router";
import { KnowledgeCard, TeamMember } from "@knowledgeplane/db/next";
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
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const cards = await KnowledgeCard.list(ctx.teamId, limit, offset);
      const total = await KnowledgeCard.count(ctx.teamId);
      return { cards, total, limit, offset };
    }),
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      const card = await KnowledgeCard.findById(input.id);
      if (!card) {
        throw new Error("Card not found");
      }

      // Validate that card belongs to user's team
      if (card.team_id !== ctx.teamId) {
        throw new Error("Card does not belong to your team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      return { card };
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      // Get the card first to check its team_id
      const card = await KnowledgeCard.findById(input.id);
      if (!card) {
        throw new Error("Card not found");
      }

      // Validate that card belongs to user's team
      if (card.team_id !== ctx.teamId) {
        throw new Error("Card does not belong to your team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      await KnowledgeCard.delete(input.id);
      return { success: true };
    }),
});
