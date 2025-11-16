import { router, protectedProcedure } from "../router";
import { Category } from "@knowledgeplane/db/next";
import { z } from "zod";

export const categoriesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        parent_id: z.string().optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      const categories = await Category.list(input?.parent_id);
      return { categories };
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        parent_id: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new Error("User not authenticated");
      }
      const category = await Category.create({
        name: input.name,
        description: input.description,
        parent_id: input.parent_id,
        created_by: ctx.user.userId,
      });
      return { category };
    }),
  getTree: protectedProcedure.query(async () => {
    const categories = await Category.getTree();
    return { categories };
  }),
});

