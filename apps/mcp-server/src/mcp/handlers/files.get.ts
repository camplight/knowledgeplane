import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { File, WorkspaceMember } from "@knowledgeplane/db";

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
      user_id: {
        type: "string",
        description: "User ID for workspace membership validation (optional, inferred from session if authenticated)",
      },
    },
    required: ["id"],
  },
};

export async function handleFilesGet(args: { 
  id: string;
  workspace_id?: string;
  user_id?: string;
}) {
  const file = await File.findById(args.id);

  if (!file) {
    throw new Error(`File with id ${args.id} not found`);
  }

  // Validate workspace_id (should be set from context)
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (file.workspace_id !== args.workspace_id) {
    throw new Error("File does not belong to the specified workspace");
  }

  // Validate workspace membership if user_id is provided
  if (args.user_id) {
    const member = await WorkspaceMember.findByWorkspaceAndUser(file.workspace_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this workspace");
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

