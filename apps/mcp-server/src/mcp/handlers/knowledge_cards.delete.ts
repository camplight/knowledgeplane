import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard } from "@knowledgeplane/db";

export const knowledgeCardsDeleteTool: Tool = {
  name: "knowledge_cards.delete",
  description: "Delete a knowledge card by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the knowledge card to delete" },
    },
    required: ["id"],
  },
};

export async function handleKnowledgeCardsDelete(args: { id: string }) {
  await KnowledgeCard.delete(args.id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, message: `Knowledge card ${args.id} deleted` }, null, 2),
      },
    ],
  };
}

