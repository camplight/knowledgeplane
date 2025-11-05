import { router, protectedProcedure } from "../router";

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return {
      user: ctx.user,
    };
  }),
  
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const cookieStore = await import("next/headers").then(m => m.cookies());
    cookieStore.delete("session");
    cookieStore.delete("userId");
    return { success: true };
  }),
});

