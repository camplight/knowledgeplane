import { router, protectedProcedure, publicProcedure } from "../router";
import { Workspace, WorkspaceMember, User, Invitation } from "@knowledgeplane/db/next";
import { z } from "zod";

export const workspacesRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await Workspace.create({
        name: input.name,
        description: input.description,
        created_by: ctx.user.userId,
      });

      // Add creator as owner
      await WorkspaceMember.create({
        workspace_id: workspace.id,
        user_id: ctx.user.userId,
        role: "owner",
      });

      return workspace;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const workspaces = await Workspace.findByUserId(ctx.user.userId);
    return workspaces;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workspace = await Workspace.findById(input.id);
      if (!workspace) {
        throw new Error("Workspace not found");
      }

      // Check if user is a member
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      return workspace;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Check if user is admin or owner
      const member = await WorkspaceMember.findByWorkspaceAndUser(id, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can update workspace settings");
      }

      return await Workspace.update(id, updates);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner") {
        throw new Error("Only owners can delete workspaces");
      }

      await Workspace.delete(input.id);
      return { success: true };
    }),

  // Workspace member management
  listMembers: protectedProcedure
    .input(
      z.object({
        workspace_id: z.string(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user is a member
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.workspace_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const members = await WorkspaceMember.findByWorkspace(
        input.workspace_id,
        input.limit,
        input.offset,
      );

      // Enrich with user information
      const enriched = await Promise.all(
        members.map(async (m) => {
          const user = await User.findById(m.user_id);
          return {
            ...m,
            user: user
              ? {
                  id: user.id,
                  username: user.username,
                  email: user.email,
                }
              : null,
          };
        }),
      );

      const total = await WorkspaceMember.countByWorkspace(input.workspace_id);

      return { members: enriched, total, limit: input.limit, offset: input.offset };
    }),

  addMember: protectedProcedure
    .input(
      z.object({
        workspace_id: z.string(),
        user_id: z.string(),
        role: z.enum(["owner", "admin", "member"]).default("member"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.workspace_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can add members");
      }

      // Cannot add owner role unless current user is owner
      if (input.role === "owner" && member.role !== "owner") {
        throw new Error("Only owners can add other owners");
      }

      return await WorkspaceMember.create({
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        role: input.role,
      });
    }),

  updateMember: protectedProcedure
    .input(
      z.object({
        workspace_id: z.string(),
        member_id: z.string(),
        role: z.enum(["owner", "admin", "member"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.workspace_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can update member roles");
      }

      // Cannot change to owner role unless current user is owner
      if (input.role === "owner" && member.role !== "owner") {
        throw new Error("Only owners can assign owner role");
      }

      // Cannot change owner's role unless current user is owner
      const targetMember = await WorkspaceMember.findById(input.member_id);
      if (!targetMember) {
        throw new Error("Member not found");
      }
      if (targetMember.role === "owner" && member.role !== "owner") {
        throw new Error("Only owners can change owner roles");
      }

      return await WorkspaceMember.update(input.member_id, { role: input.role });
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        workspace_id: z.string(),
        member_id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.workspace_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can remove members");
      }

      // Cannot remove owner unless current user is owner
      const targetMember = await WorkspaceMember.findById(input.member_id);
      if (!targetMember) {
        throw new Error("Member not found");
      }
      if (targetMember.role === "owner" && member.role !== "owner") {
        throw new Error("Only owners can remove other owners");
      }

      // Cannot remove yourself
      if (targetMember.user_id === ctx.user.userId) {
        throw new Error("You cannot remove yourself from the workspace");
      }

      await WorkspaceMember.delete(input.member_id);
      return { success: true };
    }),

  // Invitation management
  createInvitation: protectedProcedure
    .input(
      z.object({
        workspace_id: z.string(),
        expires_in_days: z.number().min(1).max(365).default(7),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.workspace_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can create invitations");
      }

      return await Invitation.create({
        workspace_id: input.workspace_id,
        invited_by: ctx.user.userId,
        expires_in_days: input.expires_in_days,
      });
    }),

  listInvitations: protectedProcedure
    .input(
      z.object({
        workspace_id: z.string(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        status: z.enum(["pending", "accepted", "expired"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user is a member
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.workspace_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      await Invitation.checkAndExpire();

      const invitations = await Invitation.list(
        input.workspace_id,
        input.limit,
        input.offset,
        input.status,
      );
      const total = await Invitation.count(input.workspace_id, input.status);

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

      return {
        invitations: enriched,
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  acceptInvitation: protectedProcedure
    .input(
      z.object({
        token: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invitation = await Invitation.findByToken(input.token);
      if (!invitation) {
        throw new Error("Invitation not found");
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
        // User might already be a member, ignore error
        if (!error.message.includes("already a member")) {
          throw error;
        }
      }

      // Switch user's active workspace to the invited workspace
      const cookieStore = await import("next/headers").then((m) => m.cookies());
      cookieStore.set("workspaceId", invitation.workspace_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return { success: true, workspace_id: invitation.workspace_id };
    }),

  getInvitationByToken: publicProcedure
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

      const workspace = await Workspace.findById(invitation.workspace_id);
      const inviter = await User.findById(invitation.invited_by);

      return {
        ...invitation,
        workspace: workspace
          ? {
              id: workspace.id,
              name: workspace.name,
              slug: workspace.slug,
            }
          : null,
        inviter: inviter
          ? {
              id: inviter.id,
              username: inviter.username,
              email: inviter.email,
            }
          : null,
      };
    }),

  deleteInvitation: protectedProcedure
    .input(
      z.object({
        workspace_id: z.string(),
        invitation_id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.workspace_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can delete invitations");
      }

      const invitation = await Invitation.findById(input.invitation_id);
      if (!invitation) {
        throw new Error("Invitation not found");
      }

      if (invitation.workspace_id !== input.workspace_id) {
        throw new Error("Invitation does not belong to this workspace");
      }

      await Invitation.delete(input.invitation_id);
      return { success: true };
    }),

  switchWorkspace: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Validate that user is a member of this workspace
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        input.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      // Set workspaceId cookie
      const cookieStore = await import("next/headers").then((m) => m.cookies());
      cookieStore.set("workspaceId", input.workspaceId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return { success: true, workspaceId: input.workspaceId };
    }),
});

