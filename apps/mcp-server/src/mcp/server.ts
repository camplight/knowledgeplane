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
import { filesUploadTool, handleFilesUpload } from "./handlers/files.upload.js";
import { filesListTool, handleFilesList } from "./handlers/files.list.js";
import { filesGetTool, handleFilesGet } from "./handlers/files.get.js";
import { filesSearchTool, handleFilesSearch } from "./handlers/files.search.js";
import { filesUpdateTool, handleFilesUpdate } from "./handlers/files.update.js";
import { filesDeleteTool, handleFilesDelete } from "./handlers/files.delete.js";
import {
  factRelationsCreateTool,
  handleFactRelationsCreate,
} from "./handlers/fact_relations.create.js";
import {
  factRelationsUpdateTool,
  handleFactRelationsUpdate,
} from "./handlers/fact_relations.update.js";
import {
  factRelationsDeleteTool,
  handleFactRelationsDelete,
} from "./handlers/fact_relations.delete.js";
import {
  factRelationsSearchTool,
  handleFactRelationsSearch,
} from "./handlers/fact_relations.search.js";
import {
  factRelationsGetTool,
  handleFactRelationsGet,
} from "./handlers/fact_relations.get.js";
import {
  factRelationsGetRelatedTool,
  handleFactRelationsGetRelated,
} from "./handlers/fact_relations.get_related.js";
import {
  factRelationsGetIncomingTool,
  handleFactRelationsGetIncoming,
} from "./handlers/fact_relations.get_incoming.js";
import {
  knowledgeCardsCreateTool,
  handleKnowledgeCardsCreate,
} from "./handlers/knowledge_cards.create.js";
import {
  knowledgeCardsUpdateTool,
  handleKnowledgeCardsUpdate,
} from "./handlers/knowledge_cards.update.js";
import {
  knowledgeCardsDeleteTool,
  handleKnowledgeCardsDelete,
} from "./handlers/knowledge_cards.delete.js";
import {
  knowledgeCardsSearchTool,
  handleKnowledgeCardsSearch,
} from "./handlers/knowledge_cards.search.js";
import {
  knowledgeCardsListTool,
  handleKnowledgeCardsList,
} from "./handlers/knowledge_cards.list.js";
import {
  knowledgeCardsSplitTool,
  handleKnowledgeCardsSplit,
} from "./handlers/knowledge_cards.split.js";
import {
  knowledgeCardsCombineTool,
  handleKnowledgeCardsCombine,
} from "./handlers/knowledge_cards.combine.js";
import {
  factsConsolidateTool,
  handleFactsConsolidate,
} from "./handlers/facts.consolidate.js";

export interface McpContext {
  userId?: string;
  workspaceId?: string;
}

/**
 * Options for preparing handler arguments from context
 */
interface PrepareArgsOptions {
  /** Set created_by from context.userId if not provided */
  setCreatedBy?: boolean;
  /** Set last_updated_by from context.userId if not provided */
  setLastUpdatedBy?: boolean;
  /** Set user_id from context.userId if not provided */
  setUserId?: boolean;
}

/**
 * Prepares handler arguments by:
 * 1. Removing workspace_id from args (workspace_id is never accepted from args)
 * 2. Setting workspace_id from context if available
 * 3. Optionally setting userId-related fields from context
 */
function prepareHandlerArgs(
  args: any,
  context: McpContext | undefined,
  options: PrepareArgsOptions = {},
): any {
  const { setCreatedBy, setLastUpdatedBy, setUserId } = options;

  // Remove workspace_id from args - it should never come from args, only from context
  const { workspace_id, ...cleanedArgs } = args;

  const preparedArgs = { ...cleanedArgs };

  // Always set workspace_id from context if available (never from args)
  if (context?.workspaceId) {
    preparedArgs.workspace_id = context.workspaceId;
  }

  // Optionally set userId-related fields from context
  if (context?.userId) {
    if (setCreatedBy && !preparedArgs.created_by) {
      preparedArgs.created_by = context.userId;
    }
    if (setLastUpdatedBy && !preparedArgs.last_updated_by) {
      preparedArgs.last_updated_by = context.userId;
    }
    if (setUserId && !preparedArgs.user_id) {
      preparedArgs.user_id = context.userId;
    }
  }

  return preparedArgs;
}

/**
 * Prepares handler arguments for bulk operations (e.g., facts.bulkwrite)
 * where workspace_id needs to be removed from nested fact objects
 */
function prepareBulkHandlerArgs(
  args: any,
  context: McpContext | undefined,
  options: PrepareArgsOptions = {},
): any {
  const { setCreatedBy, setLastUpdatedBy } = options;

  // Remove workspace_id from top-level args
  const { workspace_id, ...cleanedArgs } = args;

  const preparedArgs = { ...cleanedArgs };

  // Handle nested facts array if present
  if (preparedArgs.facts && Array.isArray(preparedArgs.facts)) {
    preparedArgs.facts = preparedArgs.facts.map((fact: any) => {
      // Remove workspace_id from each fact
      const { workspace_id: factWorkspaceId, ...factWithoutWorkspaceId } = fact;

      const preparedFact: any = { ...factWithoutWorkspaceId };

      // Always set workspace_id from context if available
      if (context?.workspaceId) {
        preparedFact.workspace_id = context.workspaceId;
      }

      // Optionally set userId-related fields from context
      if (context?.userId) {
        if (setCreatedBy && !preparedFact.created_by) {
          preparedFact.created_by = context.userId;
        }
        if (setLastUpdatedBy && !preparedFact.last_updated_by) {
          preparedFact.last_updated_by = context.userId;
        }
      }

      return preparedFact;
    });
  }

  return preparedArgs;
}

// Tool definitions from handlers
const tools = [
  factsWriteTool,
  factsBulkWriteTool,
  factsSearchTool,
  factsUpdateTool,
  factsTrashTool,
  factsConsolidateTool,
  filesUploadTool,
  filesListTool,
  filesGetTool,
  filesSearchTool,
  filesUpdateTool,
  filesDeleteTool,
  factRelationsCreateTool,
  factRelationsUpdateTool,
  factRelationsDeleteTool,
  factRelationsSearchTool,
  factRelationsGetTool,
  factRelationsGetRelatedTool,
  factRelationsGetIncomingTool,
  knowledgeCardsCreateTool,
  knowledgeCardsUpdateTool,
  knowledgeCardsDeleteTool,
  knowledgeCardsSearchTool,
  knowledgeCardsListTool,
  knowledgeCardsSplitTool,
  knowledgeCardsCombineTool,
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
      handlerArgs = prepareHandlerArgs(args, context, {
        setCreatedBy: true,
        setLastUpdatedBy: true,
      });
      handler = handleFactsWrite;
    } else if (name === "facts.bulkwrite") {
      handlerArgs = prepareBulkHandlerArgs(args, context, {
        setCreatedBy: true,
        setLastUpdatedBy: true,
      });
      handler = handleFactsBulkWrite;
    } else if (name === "facts.search") {
      handlerArgs = prepareHandlerArgs(args, context);
      handler = handleFactsSearch;
    } else if (name === "facts.update") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setLastUpdatedBy: true,
      });
      handler = handleFactsUpdate;
    } else if (name === "facts.trash") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setLastUpdatedBy: true,
      });
      handler = handleFactsTrash;
    } else if (name === "files.upload") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setCreatedBy: true,
      });
      handler = handleFilesUpload;
    } else if (name === "files.list") {
      handlerArgs = prepareHandlerArgs(args, context);
      handler = handleFilesList;
    } else if (name === "files.get") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setUserId: true,
      });
      handler = handleFilesGet;
    } else if (name === "files.search") {
      handlerArgs = prepareHandlerArgs(args, context);
      handler = handleFilesSearch;
    } else if (name === "files.update") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setUserId: true,
      });
      handler = handleFilesUpdate;
    } else if (name === "files.delete") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setUserId: true,
      });
      handler = handleFilesDelete;
    } else if (name === "fact_relations.create") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setCreatedBy: true,
      });
      handler = handleFactRelationsCreate;
    } else if (name === "fact_relations.update") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setUserId: true,
      });
      handler = handleFactRelationsUpdate;
    } else if (name === "fact_relations.delete") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setUserId: true,
      });
      handler = handleFactRelationsDelete;
    } else if (name === "fact_relations.search") {
      handlerArgs = prepareHandlerArgs(args, context);
      handler = handleFactRelationsSearch;
    } else if (name === "fact_relations.get") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setUserId: true,
      });
      handler = handleFactRelationsGet;
    } else if (name === "fact_relations.get_related") {
      handlerArgs = prepareHandlerArgs(args, context);
      handler = handleFactRelationsGetRelated;
    } else if (name === "fact_relations.get_incoming") {
      handlerArgs = prepareHandlerArgs(args, context);
      handler = handleFactRelationsGetIncoming;
    } else if (name === "facts.consolidate") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setCreatedBy: true,
        setLastUpdatedBy: true,
      });
      handler = handleFactsConsolidate;
    } else if (name === "knowledge_cards.create") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setCreatedBy: true,
        setLastUpdatedBy: true,
      });
      handler = handleKnowledgeCardsCreate;
    } else if (name === "knowledge_cards.update") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setLastUpdatedBy: true,
      });
      handler = handleKnowledgeCardsUpdate;
    } else if (name === "knowledge_cards.list") {
      handlerArgs = prepareHandlerArgs(args, context);
      handler = handleKnowledgeCardsList;
    } else if (name === "knowledge_cards.search") {
      handlerArgs = prepareHandlerArgs(args, context);
      handler = handleKnowledgeCardsSearch;
    } else if (name === "knowledge_cards.delete") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setUserId: true,
      });
      handler = handleKnowledgeCardsDelete;
    } else if (name === "knowledge_cards.split") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setCreatedBy: true,
        setLastUpdatedBy: true,
      });
      handler = handleKnowledgeCardsSplit;
    } else if (name === "knowledge_cards.combine") {
      handlerArgs = prepareHandlerArgs(args, context, {
        setCreatedBy: true,
        setLastUpdatedBy: true,
      });
      handler = handleKnowledgeCardsCombine;
    } else if (name === "code_execute") {
      // For code_execute, we need to preserve secrets from args but set workspace_id and created_by from context
      const { workspace_id, ...cleanedArgs } = args;
      handlerArgs = {
        ...cleanedArgs,
        workspace_id: context?.workspaceId || workspace_id,
        created_by: context?.userId || cleanedArgs.created_by || "system",
      };
      handler = handleCodeExecute;
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
