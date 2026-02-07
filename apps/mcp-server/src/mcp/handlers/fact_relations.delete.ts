import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation, WorkspaceMember } from "@knowledgeplane/db";

export const factRelationsDeleteTool: Tool = {
  name: "fact_relations_delete",
  description: "Delete a fact relation by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the relation to delete",
      },
      user_id: {
        type: "string",
        description: "User ID for workspace membership validation (optional, inferred from session if authenticated)",
      },
    },
    required: ["id"],
  },
};

export async function handleFactRelationsDelete(args: { 
  id: string;
  workspace_id?: string;
  user_id?: string;
}) {
  // Get the relation first to check its workspace_id
  const relation = await FactRelation.findById(args.id);
  if (!relation) {
    throw new Error(`FactRelation with id ${args.id} not found`);
  }

  // Validate workspace_id (should be set from context) - map to workspace_id
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (relation.workspace_id !== args.workspace_id) {
    throw new Error("FactRelation does not belong to the specified workspace");
  }

  // Validate workspace membership if user_id is provided
  if (args.user_id) {
    const member = await WorkspaceMember.findByWorkspaceAndUser(relation.workspace_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this workspace");
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

