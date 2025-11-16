import { router, protectedProcedure } from "../router";
import { WorkerLog } from "@knowledgeplane/db/next";
import { z } from "zod";

export const workerLogsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        worker_name: z.string().optional(),
        status: z.enum(["success", "error", "running"]).optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const worker_name = input?.worker_name;
      const status = input?.status;
      const logs = await WorkerLog.list(limit, offset, worker_name, status);
      const total = await WorkerLog.count(worker_name, status);
      return { logs, total, limit, offset };
    }),
});

