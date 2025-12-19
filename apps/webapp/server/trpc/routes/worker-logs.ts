import { router, protectedProcedure } from "../router";
import { WorkerLog, WorkspaceMember } from "@knowledgeplane/db/next";
import { collections } from "@knowledgeplane/db";
import { z } from "zod";

export const workerLogsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
          worker_name: z.string().optional(),
          status: z.enum(["success", "error", "running"]).optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user || !ctx.workspaceId) {
        throw new Error("User must be authenticated and have a workspace");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const worker_name = input?.worker_name;
      const status = input?.status;
      const logs = await WorkerLog.list(
        ctx.workspaceId,
        limit,
        offset,
        worker_name,
        status,
      );
      const total = await WorkerLog.count(ctx.workspaceId, worker_name, status);
      return { logs, total, limit, offset };
    }),
  trigger: protectedProcedure
    .input(
      z.object({
        worker: z.enum(["card-consolidator", "embeddings-generator"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Create a trigger record in the database
      // Workers can check this collection for pending triggers
      const now = new Date().toISOString();
      const triggerDoc = {
        worker_name: input.worker,
        triggered_at: now,
        status: "pending",
        created_at: now,
      };

      try {
        // Ensure the collection exists
        try {
          await collections.worker_triggers.get();
        } catch (error: any) {
          if (error.errorNum === 1203) {
            // Collection doesn't exist, create it
            await collections.worker_triggers.create();
          } else {
            throw error;
          }
        }

        const result = await collections.worker_triggers.save(triggerDoc, {
          returnNew: true,
        });

        // Create a log entry to track the trigger request
        await WorkerLog.create({
          worker_name: input.worker,
          task_type: "manual-trigger",
          workspace_id: ctx.workspaceId || undefined,
          status: "running",
          message: `Manual trigger requested for ${input.worker}`,
        });

        return {
          success: true,
          message: `Worker ${input.worker} trigger request created`,
          triggerId: result.new!._id,
        };
      } catch (error: any) {
        throw new Error(`Failed to trigger worker: ${error.message}`);
      }
    }),
});
