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
      const enriched = await Promise.all(
        users.map(async (user) => {
          const invitations = await Invitation.findByEmail(user.email);
          const pendingInvitation = invitations.find(
            (inv) => inv.status === "pending",
          );
          const acceptedInvitation = invitations.find(
            (inv) => inv.status === "accepted",
          );

          return {
            ...user,
            hasPendingInvitation: !!pendingInvitation,
            hasAcceptedInvitation: !!acceptedInvitation,
            invitationStatus: pendingInvitation
              ? "pending"
              : acceptedInvitation
                ? "accepted"
                : "none",
          };
        }),
      );

      return { users: enriched, total, limit, offset };
    }),
});

