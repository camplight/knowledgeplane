import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact, TeamMember } from "@knowledgeplane/db";

export const factsUpdateTool: Tool = {
  name: "facts.update",
  description: "Update a fact in the knowledge base. Only provided fields will be updated.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the fact to update" },
      content: { type: "string", description: "The updated content of the fact" },
      metadata: {
        type: "object",
        description: "Updated key-value pairs of metadata",
        additionalProperties: { type: "string" },
      },
      last_updated_by: { type: "string", description: "User ID of the person updating the fact" },
    },
    required: ["id", "last_updated_by"],
  },
};

export async function handleFactsUpdate(args: {
  id: string;
  content?: string;
  metadata?: Record<string, string>;
  last_updated_by: string;
  team_id?: string;
}) {
  // Get the fact first to check its team_id
  const existingFact = await Fact.findById(args.id);
  if (!existingFact) {
    throw new Error(`Fact with id ${args.id} not found`);
  }

  // Validate team_id (should be set from context)
  if (!args.team_id) {
    throw new Error("Team ID is required. Team ID should be automatically inferred from authenticated session context.");
  }
  
  if (existingFact.team_id !== args.team_id) {
    throw new Error("Fact does not belong to the specified team");
  }
  
  // Validate team membership
  const member = await TeamMember.findByTeamAndUser(args.team_id, args.last_updated_by);
  if (!member) {
    throw new Error("You are not a member of this team");
  }

  const fact = await Fact.update({
    id: args.id,
    content: args.content,
    metadata: args.metadata,
    last_updated_by: args.last_updated_by,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ fact }, null, 2),
      },
    ],
  };
}

