import { router, protectedProcedure } from "../router.js";
import { User } from "@knowledgeplane/db";
import { z } from "zod";

export const userRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await User.findById(ctx.user.userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
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
      return { users, total, limit, offset };
    }),
});

