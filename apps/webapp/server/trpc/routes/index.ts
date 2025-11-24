import { router } from "../router";
import { authRouter } from "./auth";
import { userRouter } from "./user";
import { factsRouter } from "./facts";
import { cardsRouter } from "./cards";
import { chatRouter } from "./chat";
import { filesRouter } from "./files";
import { invitationsRouter } from "./invitations";
import { workerLogsRouter } from "./worker-logs";
import { factRelationsRouter } from "./fact-relations";
import { teamsRouter } from "./teams";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  facts: factsRouter,
  cards: cardsRouter,
  chat: chatRouter,
  files: filesRouter,
  invitations: invitationsRouter,
  workerLogs: workerLogsRouter,
  factRelations: factRelationsRouter,
  teams: teamsRouter,
});

export type AppRouter = typeof appRouter;

