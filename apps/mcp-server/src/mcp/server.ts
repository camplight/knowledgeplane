import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { FastifyLoggerInstance } from "fastify";
import { factsWriteTool, handleFactsWrite } from "./handlers/facts.write.js";
import { factsSearchTool, handleFactsSearch } from "./handlers/facts.search.js";
import { factsUpdateTool, handleFactsUpdate } from "./handlers/facts.update.js";
import { factsTrashTool, handleFactsTrash } from "./handlers/facts.trash.js";
import {
  usersRegisterTool,
  handleUsersRegister,
} from "./handlers/users.register.js";
import {
  knowledgeContextsListTool,
  handleKnowledgeContextsList,
} from "./handlers/knowledgecontexts.list.js";

export interface McpContext {
  userId?: string;
  knowledgeContext?: string;
}

// Tool definitions from handlers
const tools = [
  factsWriteTool,
  factsSearchTool,
  factsUpdateTool,
  factsTrashTool,
  usersRegisterTool,
  knowledgeContextsListTool,
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

      // Set knowledge_context from context if available
      if (context?.knowledgeContext) {
        handlerArgs.knowledge_context =
          handlerArgs.knowledge_context || context.knowledgeContext;
      }

      handler = handleFactsWrite;
    } else if (name === "facts.search") {
      // Merge context into args for facts.search
      handlerArgs = { ...args } as any;
      if (context?.knowledgeContext) {
        handlerArgs.knowledge_context =
          handlerArgs.knowledge_context || context.knowledgeContext;
      }
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
        if (context.knowledgeContext) {
          handlerArgs.knowledge_context =
            handlerArgs.knowledge_context || context.knowledgeContext;
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
    } else if (name === "knowledgecontexts.list") {
      handlerArgs = { ...args } as any;
      handler = handleKnowledgeContextsList;
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
