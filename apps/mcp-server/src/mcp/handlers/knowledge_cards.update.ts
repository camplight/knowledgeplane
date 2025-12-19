import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard, WorkspaceMember } from "@knowledgeplane/db";

export const knowledgeCardsUpdateTool: Tool = {
  name: "knowledge_cards.update",
  description: "Update a knowledge card. Only provided fields will be updated.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the knowledge card to update",
      },
      title: {
        type: "string",
        description: "Updated title of the knowledge card",
      },
      summary: {
        type: "string",
        description: "Updated summary of the knowledge card",
      },
      content: {
        type: "string",
        description: "Updated content of the knowledge card",
      },
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
        description:
          "User ID of the person updating the card (optional, inferred from session if authenticated)",
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
  workspace_id?: string;
}) {
  if (!args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide last_updated_by, or authenticate via session.",
    );
  }

  // Get the card first to check its workspace_id
  const existingCard = await KnowledgeCard.findById(args.id);
  if (!existingCard) {
    throw new Error(`Knowledge card with id ${args.id} not found`);
  }

  // Validate workspace_id (should be set from context) - map to workspace_id
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (existingCard.workspace_id !== args.workspace_id) {
    throw new Error("Knowledge card does not belong to the specified workspace");
  }
  
  // Validate workspace membership
  const member = await WorkspaceMember.findByWorkspaceAndUser(
    args.workspace_id,
    args.last_updated_by,
  );
  if (!member) {
    throw new Error("You are not a member of this workspace");
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
