import { router, protectedProcedure } from "../router";
import { TeamMember } from "@knowledgeplane/db/next";

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return {
      user: ctx.user,
      currentTeamId: ctx.teamId,
    };
  }),
  
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const cookieStore = await import("next/headers").then(m => m.cookies());
    cookieStore.delete("session");
    cookieStore.delete("userId");
    return { success: true };
  }),
});

