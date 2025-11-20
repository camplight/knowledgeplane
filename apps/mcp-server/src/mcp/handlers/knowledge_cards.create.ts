import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard } from "@knowledgeplane/db";

export const knowledgeCardsCreateTool: Tool = {
  name: "knowledge_cards.create",
  description: "Create a new knowledge card with title, summary, content, and associated fact IDs",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Title of the knowledge card" },
      summary: { type: "string", description: "Brief summary of the knowledge card" },
      content: { type: "string", description: "Full content of the knowledge card" },
      fact_ids: {
        type: "array",
        items: { type: "string" },
        description: "Array of fact IDs that are consolidated into this card",
      },
      created_by: {
        type: "string",
        description: "User ID of the creator (optional, inferred from session if authenticated)",
      },
      last_updated_by: {
        type: "string",
        description: "User ID of the last updater (optional, inferred from session if authenticated)",
      },
      metadata: {
        type: "object",
        description: "Key-value pairs of metadata",
        additionalProperties: true,
      },
    },
    required: ["title", "summary", "content", "fact_ids"],
  },
};

export async function handleKnowledgeCardsCreate(args: {
  title: string;
  summary: string;
  content: string;
  fact_ids: string[];
  created_by?: string;
  last_updated_by?: string;
  metadata?: Record<string, any>;
}) {
  // Validate that user IDs are provided (either from args or should be inferred from context)
  if (!args.created_by || !args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide created_by and last_updated_by, or authenticate via session.",
    );
  }

  const card = await KnowledgeCard.create({
    title: args.title,
    summary: args.summary,
    content: args.content,
    fact_ids: args.fact_ids,
    created_by: args.created_by,
    last_updated_by: args.last_updated_by,
    metadata: args.metadata,
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

