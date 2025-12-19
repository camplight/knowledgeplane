import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact, WorkspaceMember } from "@knowledgeplane/db";

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
  workspace_id?: string;
}) {
  // Get the fact first to check its workspace_id
  const existingFact = await Fact.findById(args.id);
  if (!existingFact) {
    throw new Error(`Fact with id ${args.id} not found`);
  }

  // Validate workspace_id (should be set from context)
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (existingFact.workspace_id !== args.workspace_id) {
    throw new Error("Fact does not belong to the specified workspace");
  }
  
  // Validate workspace membership
  const member = await WorkspaceMember.findByWorkspaceAndUser(args.workspace_id, args.last_updated_by);
  if (!member) {
    throw new Error("You are not a member of this workspace");
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

