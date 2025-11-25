import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { File, TeamMember } from "@knowledgeplane/db";

export const filesGetTool: Tool = {
  name: "files.get",
  description: "Get a file by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the file to retrieve",
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

export async function handleFilesGet(args: { 
  id: string;
  team_id?: string;
  user_id?: string;
}) {
  const file = await File.findById(args.id);

  if (!file) {
    throw new Error(`File with id ${args.id} not found`);
  }

  // Validate team_id (should be set from context)
  if (!args.team_id) {
    throw new Error("Team ID is required. Team ID should be automatically inferred from authenticated session context.");
  }
  
  if (file.team_id !== args.team_id) {
    throw new Error("File does not belong to the specified team");
  }

  // Validate team membership if user_id is provided
  if (args.user_id) {
    const member = await TeamMember.findByTeamAndUser(file.team_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this team");
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ file }, null, 2),
      },
    ],
  };
}

