import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard, TeamMember } from "@knowledgeplane/db";

export const knowledgeCardsDeleteTool: Tool = {
  name: "knowledge_cards.delete",
  description: "Delete a knowledge card by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the knowledge card to delete" },
      team_id: { type: "string", description: "Team ID for validation (optional, inferred from session if authenticated)" },
      user_id: { type: "string", description: "User ID for team membership validation (optional, inferred from session if authenticated)" },
    },
    required: ["id"],
  },
};

export async function handleKnowledgeCardsDelete(args: { 
  id: string;
  team_id?: string;
  user_id?: string;
}) {
  // Get the card first to check its team_id
  const card = await KnowledgeCard.findById(args.id);
  if (!card) {
    throw new Error(`Knowledge card with id ${args.id} not found`);
  }

  // Validate team_id if provided
  if (args.team_id) {
    if (card.team_id !== args.team_id) {
      throw new Error("Knowledge card does not belong to the specified team");
    }
  }

  // Validate team membership if user_id is provided
  if (args.user_id) {
    const member = await TeamMember.findByTeamAndUser(card.team_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this team");
    }
  }

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

