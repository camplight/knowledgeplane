import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation, TeamMember } from "@knowledgeplane/db";

export const factRelationsDeleteTool: Tool = {
  name: "fact_relations.delete",
  description: "Delete a fact relation by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the relation to delete",
      },
      team_id: {
        type: "string",
        description: "Team ID for validation (optional, inferred from session if authenticated)",
      },
      user_id: {
        type: "string",
        description: "User ID for team membership validation (optional, inferred from session if authenticated)",
      },
    },
    required: ["id"],
  },
};

export async function handleFactRelationsDelete(args: { 
  id: string;
  team_id?: string;
  user_id?: string;
}) {
  // Get the relation first to check its team_id
  const relation = await FactRelation.findById(args.id);
  if (!relation) {
    throw new Error(`FactRelation with id ${args.id} not found`);
  }

  // Validate team_id (should be set from context)
  if (!args.team_id) {
    throw new Error("Team ID is required. Team ID should be automatically inferred from authenticated session context.");
  }
  
  if (relation.team_id !== args.team_id) {
    throw new Error("FactRelation does not belong to the specified team");
  }

  // Validate team membership if user_id is provided
  if (args.user_id) {
    const member = await TeamMember.findByTeamAndUser(relation.team_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this team");
    }
  }

  await FactRelation.delete(args.id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, id: args.id }, null, 2),
      },
    ],
  };
}

