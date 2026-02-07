import { router, protectedProcedure } from "../router";
import { Fact, WorkspaceMember } from "@knowledgeplane/db/next";
import { z } from "zod";
import { createAIModelClient } from "@knowledgeplane/aimodel";
import { stripEmbeddings, stripEmbeddingsArray } from "../strip-embeddings";

export const factsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        includeTrashed: z.boolean().default(false),
      }).optional(),
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
      const includeTrashed = input?.includeTrashed || false;
      const facts = await Fact.list(ctx.workspaceId, limit, offset, includeTrashed);
      const total = await Fact.count(ctx.workspaceId, includeTrashed);
      return { facts: stripEmbeddingsArray(facts), total, limit, offset };
    }),
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        k: z.number().min(1).max(100).default(10),
        offset: z.number().min(0).default(0),
        include_trashed: z.boolean().default(false),
        use_vector_search: z.boolean().optional(), // Optional: true for vector only, false for full-text only, undefined for hybrid
      }),
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

      // Create AI client for embeddings if vector search is requested
      let embeddingProvider;
      if (input.use_vector_search !== false) {
        try {
          const client = createAIModelClient(
            (process.env.AI_PROVIDER as any) || "openai",
            process.env.OPENAI_API_KEY,
          );
          embeddingProvider = client.getProvider();
        } catch (error) {
          console.warn("Failed to create AI client for embeddings, using full-text search only");
        }
      }

      const results = await Fact.search({
        query: input.query,
        workspace_id: ctx.workspaceId,
        k: input.k,
        offset: input.offset,
        include_trashed: input.include_trashed,
        use_vector_search: input.use_vector_search,
        embeddingProvider,
      });
      return { results: stripEmbeddingsArray(results) };
    }),
  create: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1),
        metadata: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(ctx.workspaceId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const fact = await Fact.write({
        content: input.content,
        metadata: input.metadata,
        workspace_id: ctx.workspaceId,
        created_by: ctx.user.userId,
        last_updated_by: ctx.user.userId,
      });
      return { fact: stripEmbeddings(fact) };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        content: z.string().min(1).optional(),
        metadata: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Get the fact first to check its workspace_id
      const existingFact = await Fact.findById(input.id);
      if (!existingFact) {
        throw new Error("Fact not found");
      }

      // Validate that fact belongs to user's workspace
      if (existingFact.workspace_id !== ctx.workspaceId) {
        throw new Error("Fact does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(ctx.workspaceId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const fact = await Fact.update({
        id: input.id,
        content: input.content,
        metadata: input.metadata,
        last_updated_by: ctx.user.userId,
      });
      return { fact: stripEmbeddings(fact) };
    }),
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      const fact = await Fact.findById(input.id);
      if (!fact) {
        throw new Error("Fact not found");
      }

      // Validate that fact belongs to user's workspace
      if (fact.workspace_id !== ctx.workspaceId) {
        throw new Error("Fact does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(ctx.workspaceId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      return { fact: stripEmbeddings(fact) };
    }),
  trash: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Get the fact first to check its workspace_id
      const existingFact = await Fact.findById(input.id);
      if (!existingFact) {
        throw new Error("Fact not found");
      }

      // Validate that fact belongs to user's workspace
      if (existingFact.workspace_id !== ctx.workspaceId) {
        throw new Error("Fact does not belong to your workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(ctx.workspaceId, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const fact = await Fact.trash(input.id, ctx.user.userId);
      return { fact: stripEmbeddings(fact) };
    }),
});

