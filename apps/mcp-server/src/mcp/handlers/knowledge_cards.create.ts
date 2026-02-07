import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard } from "@knowledgeplane/db";
import { stripEmbeddings } from "./strip-embeddings.js";

export const knowledgeCardsCreateTool: Tool = {
  name: "knowledge_cards_create",
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
  workspace_id?: string;
  created_by?: string;
  last_updated_by?: string;
  metadata?: Record<string, any>;
}) {
  // Validate that user IDs and workspace_id are provided (should be merged from context by server.ts)
  if (!args.created_by || !args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide created_by and last_updated_by, or authenticate via session.",
    );
  }
  if (!args.workspace_id) {
    throw new Error(
      "Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.",
    );
  }

  const card = await KnowledgeCard.create({
    title: args.title,
    summary: args.summary,
    content: args.content,
    fact_ids: args.fact_ids,
    workspace_id: args.workspace_id,
    created_by: args.created_by,
    last_updated_by: args.last_updated_by,
    metadata: args.metadata,
  });
  const sanitizedCard = stripEmbeddings(card);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ card: sanitizedCard }, null, 2),
      },
    ],
  };
}

