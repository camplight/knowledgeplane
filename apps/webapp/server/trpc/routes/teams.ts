import { router, protectedProcedure, publicProcedure } from "../router";
import { Team, TeamMember, User, Invitation } from "@knowledgeplane/db/next";
import { z } from "zod";

export const teamsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const team = await Team.create({
        name: input.name,
        description: input.description,
        created_by: ctx.user.userId,
      });

      // Add creator as owner
      await TeamMember.create({
        team_id: team.id,
        user_id: ctx.user.userId,
        role: "owner",
      });

      return team;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const teams = await Team.findByUserId(ctx.user.userId);
    return teams;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const team = await Team.findById(input.id);
      if (!team) {
        throw new Error("Team not found");
      }

      // Check if user is a member
      const member = await TeamMember.findByTeamAndUser(
        input.id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      return team;
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
      const member = await TeamMember.findByTeamAndUser(id, ctx.user.userId);
      if (!member) {
        throw new Error("You are not a member of this team");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can update team settings");
      }

      return await Team.update(id, updates);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user is owner
      const member = await TeamMember.findByTeamAndUser(
        input.id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }
      if (member.role !== "owner") {
        throw new Error("Only owners can delete teams");
      }

      await Team.delete(input.id);
      return { success: true };
    }),

  // Team member management
  listMembers: protectedProcedure
    .input(
      z.object({
        team_id: z.string(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user is a member
      const member = await TeamMember.findByTeamAndUser(
        input.team_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      const members = await TeamMember.findByTeam(
        input.team_id,
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

      const total = await TeamMember.countByTeam(input.team_id);

      return { members: enriched, total, limit: input.limit, offset: input.offset };
    }),

  addMember: protectedProcedure
    .input(
      z.object({
        team_id: z.string(),
        user_id: z.string(),
        role: z.enum(["owner", "admin", "member"]).default("member"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await TeamMember.findByTeamAndUser(
        input.team_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can add members");
      }

      // Cannot add owner role unless current user is owner
      if (input.role === "owner" && member.role !== "owner") {
        throw new Error("Only owners can add other owners");
      }

      return await TeamMember.create({
        team_id: input.team_id,
        user_id: input.user_id,
        role: input.role,
      });
    }),

  updateMember: protectedProcedure
    .input(
      z.object({
        team_id: z.string(),
        member_id: z.string(),
        role: z.enum(["owner", "admin", "member"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await TeamMember.findByTeamAndUser(
        input.team_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can update member roles");
      }

      // Cannot change to owner role unless current user is owner
      if (input.role === "owner" && member.role !== "owner") {
        throw new Error("Only owners can assign owner role");
      }

      // Cannot change owner's role unless current user is owner
      const targetMember = await TeamMember.findById(input.member_id);
      if (!targetMember) {
        throw new Error("Member not found");
      }
      if (targetMember.role === "owner" && member.role !== "owner") {
        throw new Error("Only owners can change owner roles");
      }

      return await TeamMember.update(input.member_id, { role: input.role });
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        team_id: z.string(),
        member_id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await TeamMember.findByTeamAndUser(
        input.team_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can remove members");
      }

      // Cannot remove owner unless current user is owner
      const targetMember = await TeamMember.findById(input.member_id);
      if (!targetMember) {
        throw new Error("Member not found");
      }
      if (targetMember.role === "owner" && member.role !== "owner") {
        throw new Error("Only owners can remove other owners");
      }

      // Cannot remove yourself
      if (targetMember.user_id === ctx.user.userId) {
        throw new Error("You cannot remove yourself from the team");
      }

      await TeamMember.delete(input.member_id);
      return { success: true };
    }),

  // Invitation management
  createInvitation: protectedProcedure
    .input(
      z.object({
        team_id: z.string(),
        expires_in_days: z.number().min(1).max(365).default(7),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await TeamMember.findByTeamAndUser(
        input.team_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can create invitations");
      }

      return await Invitation.create({
        team_id: input.team_id,
        invited_by: ctx.user.userId,
        expires_in_days: input.expires_in_days,
      });
    }),

  listInvitations: protectedProcedure
    .input(
      z.object({
        team_id: z.string(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        status: z.enum(["pending", "accepted", "expired"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user is a member
      const member = await TeamMember.findByTeamAndUser(
        input.team_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      await Invitation.checkAndExpire();

      const invitations = await Invitation.list(
        input.team_id,
        input.limit,
        input.offset,
        input.status,
      );
      const total = await Invitation.count(input.team_id, input.status);

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

      // Add user to team as member
      try {
        await TeamMember.create({
          team_id: invitation.team_id,
          user_id: ctx.user.userId,
          role: "member",
        });
      } catch (error: any) {
        // User might already be a member, ignore error
        if (!error.message.includes("already a member")) {
          throw error;
        }
      }

      // Switch user's active team to the invited team
      const cookieStore = await import("next/headers").then((m) => m.cookies());
      cookieStore.set("teamId", invitation.team_id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return { success: true, team_id: invitation.team_id };
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

      const team = await Team.findById(invitation.team_id);
      const inviter = await User.findById(invitation.invited_by);

      return {
        ...invitation,
        team: team
          ? {
              id: team.id,
              name: team.name,
              slug: team.slug,
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
        team_id: z.string(),
        invitation_id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is admin or owner
      const member = await TeamMember.findByTeamAndUser(
        input.team_id,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can delete invitations");
      }

      const invitation = await Invitation.findById(input.invitation_id);
      if (!invitation) {
        throw new Error("Invitation not found");
      }

      if (invitation.team_id !== input.team_id) {
        throw new Error("Invitation does not belong to this team");
      }

      await Invitation.delete(input.invitation_id);
      return { success: true };
    }),

  switchTeam: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Validate that user is a member of this team
      const member = await TeamMember.findByTeamAndUser(
        input.teamId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this team");
      }

      // Set teamId cookie
      const cookieStore = await import("next/headers").then((m) => m.cookies());
      cookieStore.set("teamId", input.teamId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return { success: true, teamId: input.teamId };
    }),
});

