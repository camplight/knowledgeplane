import { router, protectedProcedure } from "../router";
import { File, Fact, WorkspaceMember } from "@knowledgeplane/db/next";
import { processFileUpload } from "@knowledgeplane/file-processor";
import { z } from "zod";
import { stripEmbeddingsArray } from "../strip-embeddings";

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

      // Decode base64 data
      const buffer = Buffer.from(input.data, "base64");

      // Process file using shared service
      const result = await processFileUpload({
        buffer,
        filename: input.filename,
        mimeType: input.mimeType,
        workspaceId: ctx.workspaceId,
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

      const limit = input?.limit || 50;
      const offset = input?.offset || 0;

      const files = await File.list(ctx.workspaceId, limit, offset);
      return { files };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      const file = await File.findById(input.id);
      if (!file) {
        throw new Error("File not found");
      }

      // Validate that file belongs to user's workspace
      if (file.workspace_id !== ctx.workspaceId) {
        throw new Error("File does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      return { file };
    }),

  getFacts: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      const file = await File.findById(input.fileId);
      if (!file) {
        throw new Error("File not found");
      }

      // Validate that file belongs to user's workspace
      if (file.workspace_id !== ctx.workspaceId) {
        throw new Error("File does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const facts = await Promise.all(
        file.fact_ids.map((factId) => Fact.findById(factId)),
      );

      // Filter facts to only return those belonging to the workspace
      const workspaceFacts = facts.filter(
        (fact): fact is NonNullable<typeof fact> =>
          Boolean(fact) && fact.workspace_id === ctx.workspaceId,
      );

      return {
        facts: stripEmbeddingsArray(workspaceFacts),
      };
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

      const file = await File.findById(input.id);
      if (!file) {
        throw new Error("File not found");
      }

      if (file.workspace_id !== ctx.workspaceId) {
        throw new Error("File does not belong to your workspace");
      }

      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      await File.delete(input.id, ctx.user.userId);
      return { success: true };
    }),
});
