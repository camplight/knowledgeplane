import { router, protectedProcedure } from "../router";
import { Invitation, User, WorkspaceMember } from "@knowledgeplane/db/next";
import { z } from "zod";

export const invitationsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        expires_in_days: z.number().min(1).max(365).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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

      return await Invitation.create({
        workspace_id: ctx.workspaceId,
        invited_by: ctx.user.userId,
        expires_in_days: input.expires_in_days,
      });
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
          status: z.enum(["pending", "accepted", "expired"]).optional(),
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
      const status = input?.status;

      // Check and expire old invitations
      await Invitation.checkAndExpire();

      const invitations = await Invitation.list(
        ctx.workspaceId,
        limit,
        offset,
        status,
      );
      const total = await Invitation.count(ctx.workspaceId, status);

      // Enrich with inviter information
      const enriched = await Promise.all(
        invitations.map(async (inv) => {
          const inviter = await User.findById(inv.invited_by);
          return {
            ...inv,
            inviter: inviter
              ? {
                  id: inviter.id,
                  username: inviter.username,
                  email: inviter.email,
                }
              : null,
          };
        }),
      );

      return { invitations: enriched, total, limit, offset };
    }),

  accept: protectedProcedure
    .input(
      z.object({
        token: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new Error("User must be authenticated");
      }

      const invitation = await Invitation.findByToken(input.token);
      if (!invitation) {
        throw new Error("Invitation not found");
      }

      // Check if user is already a member
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        invitation.workspace_id,
        ctx.user.userId,
      );
      if (member) {
        throw new Error("You are already a member of this workspace");
      }

      // Accept invitation
      await Invitation.accept(input.token, ctx.user.userId);

      // Add user to workspace as member
      try {
        await WorkspaceMember.create({
          workspace_id: invitation.workspace_id,
          user_id: ctx.user.userId,
          role: "member",
        });
      } catch (error: any) {
        // User might already be a member (race condition), ignore error
        if (!error.message.includes("already a member")) {
          throw error;
        }
      }

      return { success: true, workspace_id: invitation.workspace_id };
    }),

  getByToken: protectedProcedure
    .input(
      z.object({
        token: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const invitation = await Invitation.findByToken(input.token);
      if (!invitation) {
        throw new Error("Invitation not found");
      }

      const inviter = await User.findById(invitation.invited_by);
      return {
        ...invitation,
        inviter: inviter
          ? {
              id: inviter.id,
              username: inviter.username,
              email: inviter.email,
            }
          : null,
      };
    }),
});
