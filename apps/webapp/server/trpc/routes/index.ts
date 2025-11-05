import { router } from "../router";
import { authRouter } from "./auth";
import { userRouter } from "./user";
import { factsRouter } from "./facts";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  facts: factsRouter,
});

export type AppRouter = typeof appRouter;

