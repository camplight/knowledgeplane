import { router, protectedProcedure } from "../router.js";

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return {
      user: ctx.user,
    };
  }),
  
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    // Clear session
    const session = await (ctx.req as any).session;
    if (session) {
      await session.destroy();
    }
    return { success: true };
  }),
});

