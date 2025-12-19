import { router, protectedProcedure } from "../router";
import { User, Invitation } from "@knowledgeplane/db/next";
import { z } from "zod";

export const userRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await User.findById(ctx.user.userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }),
  updateProfile: protectedProcedure
    .input(
      z.object({
        username: z.string().min(1).max(100).optional(),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await User.findById(ctx.user.userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Check if username is being changed and if it's already taken
      if (input.username && input.username !== user.username) {
        const existing = await User.findByUsername(input.username);
        if (existing && existing.id !== user.id) {
          throw new Error("Username already taken");
        }
      }

      const updates: { username?: string; email?: string } = {};
      if (input.username) updates.username = input.username;
      if (input.email) updates.email = input.email;

      return await User.update(ctx.user.userId, updates);
    }),
  generateApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await User.findById(ctx.user.userId);
    if (!user) {
      throw new Error("User not found");
    }
    return await User.generateApiKey(ctx.user.userId);
  }),
  removeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await User.findById(ctx.user.userId);
    if (!user) {
      throw new Error("User not found");
    }
    await User.removeApiKey(ctx.user.userId);
    return { success: true };
  }),
  completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await User.findById(ctx.user.userId);
    if (!user) {
      throw new Error("User not found");
    }
    return await User.completeOnboarding(ctx.user.userId);
  }),
  getMcpUrl: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const user = await User.findById(ctx.user.userId);
      if (!user) {
        throw new Error("User not found");
      }
      
      if (!user.api_key) {
        throw new Error("API key not found. Please generate an API key first.");
      }

      // Build MCP server URL with user's API key
      // Prefer full URL if provided
      let baseUrl: string;
      if (process.env.MCP_SERVER_URL) {
        baseUrl = process.env.MCP_SERVER_URL;
      } else {
        // Otherwise construct from components
        const protocol = process.env.MCP_SERVER_PROTOCOL || "http";
        const host = process.env.MCP_SERVER_HOST || "localhost";
        const port = process.env.MCP_SERVER_PORT || "8080";
        baseUrl = `${protocol}://${host}:${port}/mcp`;
      }

      // Add API key as query parameter
      const url = new URL(baseUrl);
      url.searchParams.set("api_key", user.api_key);
      
      // Add workspace_id if provided
      if (input?.workspaceId) {
        // Validate that user is a member of this workspace
        const { WorkspaceMember } = await import("@knowledgeplane/db/next");
        const member = await WorkspaceMember.findByWorkspaceAndUser(input.workspaceId, ctx.user.userId);
        if (!member) {
          throw new Error("You are not a member of this workspace");
        }
        url.searchParams.set("workspace_id", input.workspaceId);
      }
      
      return { url: url.toString() };
    }),
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const users = await User.list(limit, offset);
      const total = await User.count();

      // Enrich users with invitation status
      // Note: We can only find accepted invitations by user ID since invitations
      // are workspace-based tokens and don't store email addresses
      const enriched = await Promise.all(
        users.map(async (user) => {
          const acceptedInvitations = await Invitation.findByAcceptedBy(user.id);
          const acceptedInvitation = acceptedInvitations.find(
            (inv) => inv.status === "accepted",
          );

          return {
            ...user,
            hasPendingInvitation: false, // Can't determine pending invitations without email
            hasAcceptedInvitation: !!acceptedInvitation,
            invitationStatus: acceptedInvitation ? "accepted" : "none",
          };
        }),
      );

      return { users: enriched, total, limit, offset };
    }),
});

