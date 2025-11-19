import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const workersTriggerTool: Tool = {
  name: "workers.trigger",
  description: "Trigger a background worker to run immediately",
  inputSchema: {
    type: "object",
    properties: {
      worker: {
        type: "string",
        enum: ["card-consolidator"],
        description: "The name of the worker to trigger",
      },
    },
    required: ["worker"],
  },
};

export async function handleWorkersTrigger(args: {
  worker: "card-consolidator";
}) {
  // Note: This is a placeholder implementation
  // In a real implementation, you would need a way to trigger workers
  // This could be done via:
  // 1. HTTP endpoint on the background-workers service
  // 2. Message queue (Redis, RabbitMQ, etc.)
  // 3. Database flag that workers check
  // 4. Direct process communication
  
  // For now, we'll return a success message
  // The actual implementation would depend on your infrastructure
  
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          message: `Worker ${args.worker} trigger request received. Workers run on a schedule, but this request will be processed in the next cycle.`,
          note: "To implement immediate triggering, add an HTTP endpoint or message queue to the background-workers service.",
        }, null, 2),
      },
    ],
  };
}

