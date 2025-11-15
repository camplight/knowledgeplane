import { router, protectedProcedure } from "../router";
import { File, Fact } from "@knowledgeplane/db";
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
      if (!ctx.user) {
        throw new Error("Unauthorized");
      }

      // Decode base64 data
      const buffer = Buffer.from(input.data, "base64");

      // Process file using shared service
      const result = await processFileUpload({
        buffer,
        filename: input.filename,
        mimeType: input.mimeType,
        uploadedBy: ctx.user.userId,
        knowledgeContext: input.knowledgeContext,
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
    .query(async ({ input }) => {
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const knowledgeContext = input?.knowledgeContext;

      const files = await File.list(limit, offset, knowledgeContext);
      return { files };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const file = await File.findById(input.id);
      if (!file) {
        throw new Error("File not found");
      }
      return { file };
    }),

  getFacts: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ input }) => {
      const file = await File.findById(input.fileId);
      if (!file) {
        throw new Error("File not found");
      }

      const facts = await Promise.all(
        file.fact_ids.map((factId) => Fact.findById(factId)),
      );

      return {
        facts: facts.filter((f) => f !== null),
      };
    }),
});

