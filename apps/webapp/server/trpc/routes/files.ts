import { router, protectedProcedure } from "../router";
import { File, Fact, TeamMember } from "@knowledgeplane/db/next";
import { processFileUpload } from "@knowledgeplane/file-processor";
import { z } from "zod";

export const filesRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        data: z.string(), // Base64 encoded file data
        knowledgeContext: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      // Decode base64 data
      const buffer = Buffer.from(input.data, "base64");

      // Process file using shared service
      const result = await processFileUpload({
        buffer,
        filename: input.filename,
        mimeType: input.mimeType,
        teamId: ctx.teamId,
        uploadedBy: ctx.user.userId,
        openaiApiKey: process.env.OPENAI_API_KEY,
        openaiModel: process.env.OPENAI_MODEL,
      });

      return result;
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
          knowledgeContext: z.string().optional(),
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

      const files = await File.list(ctx.teamId, limit, offset);
      return { files };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      const file = await File.findById(input.id);
      if (!file) {
        throw new Error("File not found");
      }

      // Validate that file belongs to user's team
      if (file.team_id !== ctx.teamId) {
        throw new Error("File does not belong to your team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      return { file };
    }),

  getFacts: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.teamId) {
        throw new Error("User must be authenticated and have a team");
      }

      const file = await File.findById(input.fileId);
      if (!file) {
        throw new Error("File not found");
      }

      // Validate that file belongs to user's team
      if (file.team_id !== ctx.teamId) {
        throw new Error("File does not belong to your team");
      }

      // Validate team membership
      const member = await TeamMember.findByTeamAndUser(ctx.teamId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      const facts = await Promise.all(
        file.fact_ids.map((factId) => Fact.findById(factId)),
      );

      // Filter facts to only return those belonging to the team
      const teamFacts = facts.filter((f) => f !== null && f.team_id === ctx.teamId);

      return {
        facts: teamFacts,
      };
    }),
});

