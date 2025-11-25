import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { File, TeamMember } from "@knowledgeplane/db";

export const filesUpdateTool: Tool = {
  name: "files.update",
  description:
    "Update a file. Only provided fields will be updated. Metadata and fact_ids can be updated.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the file to update",
      },
      metadata: {
        type: "object",
        description: "Updated metadata (key-value pairs)",
        additionalProperties: true,
      },
      fact_ids: {
        type: "array",
        description: "Updated array of fact IDs extracted from this file",
        items: {
          type: "string",
        },
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

export async function handleFilesUpdate(args: {
  id: string;
  metadata?: Record<string, any>;
  fact_ids?: string[];
  team_id?: string;
  user_id?: string;
}) {
  // Get the file first to check its team_id
  const existingFile = await File.findById(args.id);
  if (!existingFile) {
    throw new Error(`File with id ${args.id} not found`);
  }

  // Validate team_id (should be set from context)
  if (!args.team_id) {
    throw new Error("Team ID is required. Team ID should be automatically inferred from authenticated session context.");
  }
  
  if (existingFile.team_id !== args.team_id) {
    throw new Error("File does not belong to the specified team");
  }

  // Validate team membership if user_id is provided
  if (args.user_id) {
    const member = await TeamMember.findByTeamAndUser(existingFile.team_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this team");
    }
  }

  const file = await File.update({
    id: args.id,
    metadata: args.metadata,
    fact_ids: args.fact_ids,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ file }, null, 2),
      },
    ],
  };
}

