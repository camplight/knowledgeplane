import { router } from "../router";
import { authRouter } from "./auth";
import { userRouter } from "./user";
import { factsRouter } from "./facts";
import { chatRouter } from "./chat";
import { filesRouter } from "./files";
import { invitationsRouter } from "./invitations";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  facts: factsRouter,
  chat: chatRouter,
  files: filesRouter,
  invitations: invitationsRouter,
});

export type AppRouter = typeof appRouter;

