import { router, protectedProcedure } from "../router";
import { Invitation, User } from "@knowledgeplane/db/next";
import { z } from "zod";

export const invitationsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        expires_in_days: z.number().min(1).max(365).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user with this email already exists
      const existingUser = await User.findByUsername(input.email);
      if (existingUser) {
        throw new Error("User with this email already exists");
      }

      // Check if there's already a pending invitation for this email
      const existingInvitations = await Invitation.findByEmail(input.email);
      const pendingInvitation = existingInvitations.find(
        (inv) => inv.status === "pending",
      );
      if (pendingInvitation) {
        const expiresAt = new Date(pendingInvitation.expires_at);
        if (expiresAt > new Date()) {
          throw new Error(
            "A pending invitation already exists for this email address",
          );
        }
      }

      return await Invitation.create({
        email: input.email,
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
    .query(async ({ input }) => {
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const status = input?.status;

      // Check and expire old invitations
      await Invitation.checkAndExpire();

      const invitations = await Invitation.list(limit, offset, status);
      const total = await Invitation.count(status);

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
      const invitation = await Invitation.findByToken(input.token);
      if (!invitation) {
        throw new Error("Invitation not found");
      }

      // Check if the user's email matches the invitation email
      const user = await User.findById(ctx.user.userId);
      if (!user) {
        throw new Error("User not found");
      }

      if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new Error(
          "Your email does not match the invitation email address",
        );
      }

      return await Invitation.accept(input.token, ctx.user.userId);
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

