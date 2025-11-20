import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard } from "@knowledgeplane/db";

export const knowledgeCardsListTool: Tool = {
  name: "knowledge_cards.list",
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
  limit?: number;
  offset?: number;
}) {
  const limit = args.limit || 50;
  const offset = args.offset || 0;

  const cards = await KnowledgeCard.list(limit, offset);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ cards }, null, 2),
      },
    ],
  };
}

