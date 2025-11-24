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
      team_id: { type: "string", description: "Team ID for validation (optional, inferred from session if authenticated)" },
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

  // Validate team_id if provided
  if (args.team_id) {
    if (existingFact.team_id !== args.team_id) {
      throw new Error("Fact does not belong to the specified team");
    }
    // Validate team membership
    const member = await TeamMember.findByTeamAndUser(args.team_id, args.last_updated_by);
    if (!member) {
      throw new Error("You are not a member of this team");
    }
  } else {
    // If team_id not provided, validate membership on the fact's team
    const member = await TeamMember.findByTeamAndUser(existingFact.team_id, args.last_updated_by);
    if (!member) {
      throw new Error("You are not a member of this team");
    }
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

