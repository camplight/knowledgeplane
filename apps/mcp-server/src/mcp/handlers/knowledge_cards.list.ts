import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard } from "@knowledgeplane/db";
import { stripEmbeddingsArray } from "./strip-embeddings.js";

export const knowledgeCardsListTool: Tool = {
  name: "knowledge_cards_list",
  description: "List knowledge cards with pagination",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of cards to return (default: 50)",
      },
      offset: {
        type: "number",
        description: "Offset for pagination (default: 0)",
      },
    },
  },
};

export async function handleKnowledgeCardsList(args: {
  workspace_id?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = args.limit || 50;
  const offset = args.offset || 0;

  const cards = await KnowledgeCard.list(args.workspace_id, limit, offset); // workspace_id maps to workspaceId
  const sanitizedCards = stripEmbeddingsArray(cards);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ cards: sanitizedCards }, null, 2),
      },
    ],
  };
}

