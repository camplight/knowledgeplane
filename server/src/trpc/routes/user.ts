import { router, protectedProcedure } from "../router.js";
import { User } from "../../models/User.js";

export const userRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await User.findById(ctx.user.userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }),
});

