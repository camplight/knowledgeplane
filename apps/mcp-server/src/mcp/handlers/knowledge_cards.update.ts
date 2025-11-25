import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard, TeamMember } from "@knowledgeplane/db";

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
      team_id: {
        type: "string",
        description:
          "Team ID for validation (optional, inferred from session if authenticated)",
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
  team_id?: string;
}) {
  if (!args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide last_updated_by, or authenticate via session.",
    );
  }

  // Get the card first to check its team_id
  const existingCard = await KnowledgeCard.findById(args.id);
  if (!existingCard) {
    throw new Error(`Knowledge card with id ${args.id} not found`);
  }

  // Validate team_id (should be set from context)
  if (!args.team_id) {
    throw new Error("Team ID is required. Team ID should be automatically inferred from authenticated session context.");
  }
  
  if (existingCard.team_id !== args.team_id) {
    throw new Error("Knowledge card does not belong to the specified team");
  }
  
  // Validate team membership
  const member = await TeamMember.findByTeamAndUser(
    args.team_id,
    args.last_updated_by,
  );
  if (!member) {
    throw new Error("You are not a member of this team");
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
