import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact, TeamMember } from "@knowledgeplane/db";

export const factsTrashTool: Tool = {
  name: "facts.trash",
  description: "Mark a fact as trashed. Trashed facts are excluded from search results by default.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the fact to trash" },
      last_updated_by: { type: "string", description: "User ID of the person trashing the fact" },
    },
    required: ["id", "last_updated_by"],
  },
};

export async function handleFactsTrash(args: {
  id: string;
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

  const fact = await Fact.trash(args.id, args.last_updated_by);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ fact }, null, 2),
      },
    ],
  };
}

