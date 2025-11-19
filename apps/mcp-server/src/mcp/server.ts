import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { FastifyLoggerInstance } from "fastify";
import { factsWriteTool, handleFactsWrite } from "./handlers/facts.write.js";
import {
  factsBulkWriteTool,
  handleFactsBulkWrite,
} from "./handlers/facts.bulkwrite.js";
import { factsSearchTool, handleFactsSearch } from "./handlers/facts.search.js";
import { factsUpdateTool, handleFactsUpdate } from "./handlers/facts.update.js";
import { factsTrashTool, handleFactsTrash } from "./handlers/facts.trash.js";
import {
  usersRegisterTool,
  handleUsersRegister,
} from "./handlers/users.register.js";
import {
  filesUploadTool,
  handleFilesUpload,
} from "./handlers/files.upload.js";

export interface McpContext {
  userId?: string;
}

// Tool definitions from handlers
import { workersTriggerTool, handleWorkersTrigger } from "./handlers/workers.trigger.js";

const tools = [
  factsWriteTool,
  factsBulkWriteTool,
  factsSearchTool,
  factsUpdateTool,
  factsTrashTool,
  usersRegisterTool,
  filesUploadTool,
  workersTriggerTool,
];

export function createMcpServer(
  logger?: FastifyLoggerInstance,
  contextGetter?: () => McpContext | undefined,
  sessionContexts?: Map<string, McpContext>,
) {
  const server = new Server(
    {
      name: "knowledgeplane",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    if (logger) {
      logger.info("MCP: ListTools request received");
    }
    return { tools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("Tool arguments are required");
    }

    // Get context if available
    // First try the contextGetter, then try to get from sessionContexts if we have access
    let context = contextGetter?.();

    // If we have sessionContexts map, try to get context from the request metadata
    // The transport's sessionId should be available, but we need to access it differently
    // For now, use the contextGetter which should be set up to access sessionContexts

    if (logger) {
      logger.info(
        {
          tool: name,
          args: JSON.parse(JSON.stringify(args)), // Deep clone to ensure serializable
          context,
        },
        `MCP: Calling tool handler "${name}"`,
      );
    }

    let handler;
    let handlerArgs: any;

    if (name === "facts.write") {
      // Merge context into args for facts.write
      handlerArgs = { ...args } as any;

      // Infer userId from context if available
      if (context?.userId) {
        // Use context userId as default for created_by and last_updated_by if not provided
        handlerArgs.created_by = handlerArgs.created_by || context.userId;
        handlerArgs.last_updated_by =
          handlerArgs.last_updated_by || context.userId;
      }

      handler = handleFactsWrite;
    } else if (name === "facts.bulkwrite") {
      // Merge context into args for facts.bulkwrite
      handlerArgs = { ...args } as any;

      // Infer userId from context and apply to all facts if available
      if (context?.userId && handlerArgs.facts) {
        handlerArgs.facts = handlerArgs.facts.map((fact: any) => ({
          ...fact,
          created_by: fact.created_by || context.userId,
          last_updated_by: fact.last_updated_by || context.userId,
        }));
      }

      handler = handleFactsBulkWrite;
    } else if (name === "facts.search") {
      handlerArgs = { ...args } as any;
      handler = handleFactsSearch;
    } else if (name === "facts.update") {
      // Merge context into args for facts.update
      handlerArgs = { ...args } as any;
      if (context) {
        if (context.userId) {
          // Use context userId as default for last_updated_by if not provided
          handlerArgs.last_updated_by =
            handlerArgs.last_updated_by || context.userId;
        }
      }
      handler = handleFactsUpdate;
    } else if (name === "facts.trash") {
      // Merge context into args for facts.trash
      handlerArgs = { ...args } as any;
      if (context?.userId) {
        handlerArgs.last_updated_by =
          handlerArgs.last_updated_by || context.userId;
      }
      handler = handleFactsTrash;
    } else if (name === "users.register") {
      handlerArgs = { ...args } as any;
      handler = handleUsersRegister;
    } else if (name === "files.upload") {
      // Merge context into args for files.upload
      handlerArgs = { ...args } as any;
      if (context) {
        if (context.userId) {
          // Use context userId as default for created_by if not provided
          handlerArgs.created_by =
            handlerArgs.created_by || context.userId;
        }
      }
      handler = handleFilesUpload;
    } else if (name === "workers.trigger") {
      handlerArgs = { ...args } as any;
      handler = handleWorkersTrigger;
    } else {
      const error = `Unknown tool: ${name}`;
      if (logger) {
        logger.error({ tool: name }, error);
      }
      throw new Error(error);
    }

    const startTime = Date.now();
    try {
      const result = await handler(handlerArgs);
      const duration = Date.now() - startTime;
      if (logger) {
        logger.info(
          {
            tool: name,
            duration: `${duration}ms`,
          },
          `MCP: Tool handler "${name}" completed successfully`,
        );
      }
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      if (logger) {
        logger.error(
          {
            tool: name,
            args: JSON.parse(JSON.stringify(handlerArgs)),
            duration: `${duration}ms`,
            error: error.message || String(error),
          },
          `MCP: Tool handler "${name}" failed`,
        );
      }
      throw error;
    }
  });

  return server;
}
