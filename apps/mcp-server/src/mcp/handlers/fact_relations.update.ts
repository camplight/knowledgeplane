import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation, TeamMember } from "@knowledgeplane/db";

export const factRelationsUpdateTool: Tool = {
  name: "fact_relations.update",
  description:
    "Update a fact relation. Only provided fields will be updated. Type and metadata can be updated.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the relation to update",
      },
      type: {
        type: "string",
        description: "Updated relation type",
      },
      metadata: {
        type: "object",
        description: "Updated metadata (key-value pairs)",
        additionalProperties: true,
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

export async function handleFactRelationsUpdate(args: {
  id: string;
  type?: string;
  metadata?: Record<string, any>;
  team_id?: string;
  user_id?: string;
}) {
  // Get the relation first to check its team_id
  const existingRelation = await FactRelation.findById(args.id);
  if (!existingRelation) {
    throw new Error(`FactRelation with id ${args.id} not found`);
  }

  // Validate team_id if provided
  if (args.team_id) {
    if (existingRelation.team_id !== args.team_id) {
      throw new Error("FactRelation does not belong to the specified team");
    }
  }

  // Validate team membership if user_id is provided
  if (args.user_id) {
    const member = await TeamMember.findByTeamAndUser(existingRelation.team_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this team");
    }
  }

  const relation = await FactRelation.update(args.id, {
    type: args.type,
    metadata: args.metadata,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ relation }, null, 2),
      },
    ],
  };
}

