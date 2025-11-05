import { router } from "../router.js";
import { authRouter } from "./auth.js";
import { userRouter } from "./user.js";
import { factsRouter } from "./facts.js";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  facts: factsRouter,
});

export type AppRouter = typeof appRouter;

