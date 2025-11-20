import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard } from "@knowledgeplane/db";

export const knowledgeCardsUpdateTool: Tool = {
  name: "knowledge_cards.update",
  description: "Update a knowledge card. Only provided fields will be updated.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the knowledge card to update" },
      title: { type: "string", description: "Updated title of the knowledge card" },
      summary: { type: "string", description: "Updated summary of the knowledge card" },
      content: { type: "string", description: "Updated content of the knowledge card" },
      fact_ids: {
        type: "array",
        items: { type: "string" },
        description: "Updated array of fact IDs",
      },
      metadata: {
        type: "object",
        description: "Updated key-value pairs of metadata",
        additionalProperties: true,
      },
      last_updated_by: {
        type: "string",
        description: "User ID of the person updating the card (optional, inferred from session if authenticated)",
      },
    },
    required: ["id"],
  },
};

export async function handleKnowledgeCardsUpdate(args: {
  id: string;
  title?: string;
  summary?: string;
  content?: string;
  fact_ids?: string[];
  metadata?: Record<string, any>;
  last_updated_by?: string;
}) {
  if (!args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide last_updated_by, or authenticate via session.",
    );
  }

  const card = await KnowledgeCard.update({
    id: args.id,
    title: args.title,
    summary: args.summary,
    content: args.content,
    fact_ids: args.fact_ids,
    metadata: args.metadata,
    last_updated_by: args.last_updated_by,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ card }, null, 2),
      },
    ],
  };
}

