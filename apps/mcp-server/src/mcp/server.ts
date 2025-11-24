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
import { filesListTool, handleFilesList } from "./handlers/files.list.js";
import { filesGetTool, handleFilesGet } from "./handlers/files.get.js";
import {
  filesSearchTool,
  handleFilesSearch,
} from "./handlers/files.search.js";
import {
  filesUpdateTool,
  handleFilesUpdate,
} from "./handlers/files.update.js";
import {
  filesDeleteTool,
  handleFilesDelete,
} from "./handlers/files.delete.js";
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
  teamId?: string;
}

// Tool definitions from handlers
import { workersTriggerTool, handleWorkersTrigger } from "./handlers/workers.trigger.js";

const tools = [
  factsWriteTool,
  factsBulkWriteTool,
  factsSearchTool,
  factsUpdateTool,
  factsTrashTool,
  factsConsolidateTool,
  usersRegisterTool,
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
  workersTriggerTool,
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
      // Merge context into args for facts.write
      handlerArgs = { ...args } as any;

      // Infer userId and teamId from context if available
      if (context?.userId) {
        // Use context userId as default for created_by and last_updated_by if not provided
        handlerArgs.created_by = handlerArgs.created_by || context.userId;
        handlerArgs.last_updated_by =
          handlerArgs.last_updated_by || context.userId;
      }
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }

      handler = handleFactsWrite;
    } else if (name === "facts.bulkwrite") {
      // Merge context into args for facts.bulkwrite
      handlerArgs = { ...args } as any;

      // Infer userId and teamId from context and apply to all facts if available
      if (context?.userId && handlerArgs.facts) {
        handlerArgs.facts = handlerArgs.facts.map((fact: any) => ({
          ...fact,
          created_by: fact.created_by || context.userId,
          last_updated_by: fact.last_updated_by || context.userId,
          team_id: fact.team_id || context.teamId,
        }));
      }

      handler = handleFactsBulkWrite;
    } else if (name === "facts.search") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
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
        if (context.teamId) {
          handlerArgs.team_id = handlerArgs.team_id || context.teamId;
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
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
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
        if (context.teamId) {
          handlerArgs.team_id = handlerArgs.team_id || context.teamId;
        }
      }
      handler = handleFilesUpload;
    } else if (name === "files.list") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleFilesList;
    } else if (name === "files.get") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      if (context?.userId) {
        handlerArgs.user_id = handlerArgs.user_id || context.userId;
      }
      handler = handleFilesGet;
    } else if (name === "files.search") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleFilesSearch;
    } else if (name === "files.update") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      if (context?.userId) {
        handlerArgs.user_id = handlerArgs.user_id || context.userId;
      }
      handler = handleFilesUpdate;
    } else if (name === "files.delete") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      if (context?.userId) {
        handlerArgs.user_id = handlerArgs.user_id || context.userId;
      }
      handler = handleFilesDelete;
    } else if (name === "fact_relations.create") {
      // Merge context into args for fact_relations.create
      handlerArgs = { ...args } as any;
      if (context?.userId) {
        handlerArgs.created_by = handlerArgs.created_by || context.userId;
      }
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleFactRelationsCreate;
    } else if (name === "fact_relations.update") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      if (context?.userId) {
        handlerArgs.user_id = handlerArgs.user_id || context.userId;
      }
      handler = handleFactRelationsUpdate;
    } else if (name === "fact_relations.delete") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      if (context?.userId) {
        handlerArgs.user_id = handlerArgs.user_id || context.userId;
      }
      handler = handleFactRelationsDelete;
    } else if (name === "fact_relations.search") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleFactRelationsSearch;
    } else if (name === "fact_relations.get") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      if (context?.userId) {
        handlerArgs.user_id = handlerArgs.user_id || context.userId;
      }
      handler = handleFactRelationsGet;
    } else if (name === "fact_relations.get_related") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleFactRelationsGetRelated;
    } else if (name === "fact_relations.get_incoming") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleFactRelationsGetIncoming;
    } else if (name === "workers.trigger") {
      handlerArgs = { ...args } as any;
      handler = handleWorkersTrigger;
    } else if (name === "facts.consolidate") {
      // Merge context into args for facts.consolidate
      handlerArgs = { ...args } as any;
      if (context?.userId) {
        handlerArgs.created_by = handlerArgs.created_by || context.userId;
        handlerArgs.last_updated_by =
          handlerArgs.last_updated_by || context.userId;
      }
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleFactsConsolidate;
    } else if (name === "knowledge_cards.create") {
      // Merge context into args for knowledge_cards.create
      handlerArgs = { ...args } as any;
      if (context?.userId) {
        handlerArgs.created_by = handlerArgs.created_by || context.userId;
        handlerArgs.last_updated_by =
          handlerArgs.last_updated_by || context.userId;
      }
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleKnowledgeCardsCreate;
    } else if (name === "knowledge_cards.update") {
      // Merge context into args for knowledge_cards.update
      handlerArgs = { ...args } as any;
      if (context?.userId) {
        handlerArgs.last_updated_by =
          handlerArgs.last_updated_by || context.userId;
      }
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleKnowledgeCardsUpdate;
    } else if (name === "knowledge_cards.list") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleKnowledgeCardsList;
    } else if (name === "knowledge_cards.search") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleKnowledgeCardsSearch;
    } else if (name === "knowledge_cards.delete") {
      handlerArgs = { ...args } as any;
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      if (context?.userId) {
        handlerArgs.user_id = handlerArgs.user_id || context.userId;
      }
      handler = handleKnowledgeCardsDelete;
    } else if (name === "knowledge_cards.search") {
      handlerArgs = { ...args } as any;
      handler = handleKnowledgeCardsSearch;
    } else if (name === "knowledge_cards.list") {
      handlerArgs = { ...args } as any;
      handler = handleKnowledgeCardsList;
    } else if (name === "knowledge_cards.split") {
      // Merge context into args for knowledge_cards.split
      handlerArgs = { ...args } as any;
      if (context?.userId) {
        handlerArgs.created_by = handlerArgs.created_by || context.userId;
        handlerArgs.last_updated_by =
          handlerArgs.last_updated_by || context.userId;
      }
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleKnowledgeCardsSplit;
    } else if (name === "knowledge_cards.combine") {
      // Merge context into args for knowledge_cards.combine
      handlerArgs = { ...args } as any;
      if (context?.userId) {
        handlerArgs.created_by = handlerArgs.created_by || context.userId;
        handlerArgs.last_updated_by =
          handlerArgs.last_updated_by || context.userId;
      }
      if (context?.teamId) {
        handlerArgs.team_id = handlerArgs.team_id || context.teamId;
      }
      handler = handleKnowledgeCardsCombine;
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
