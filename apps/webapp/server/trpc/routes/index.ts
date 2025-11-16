import { router } from "../router";
import { authRouter } from "./auth";
import { userRouter } from "./user";
import { factsRouter } from "./facts";
import { chatRouter } from "./chat";
import { filesRouter } from "./files";
import { invitationsRouter } from "./invitations";
import { categoriesRouter } from "./categories";
import { workerLogsRouter } from "./worker-logs";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  facts: factsRouter,
  chat: chatRouter,
  files: filesRouter,
  invitations: invitationsRouter,
  categories: categoriesRouter,
  workerLogs: workerLogsRouter,
});

export type AppRouter = typeof appRouter;

