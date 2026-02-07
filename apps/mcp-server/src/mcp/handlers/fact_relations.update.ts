import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation, WorkspaceMember } from "@knowledgeplane/db";

export const factRelationsUpdateTool: Tool = {
  name: "fact_relations_update",
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
      user_id: {
        type: "string",
        description: "User ID for workspace membership validation (optional, inferred from session if authenticated)",
      },
    },
    required: ["id"],
  },
};

export async function handleFactRelationsUpdate(args: {
  id: string;
  type?: string;
  metadata?: Record<string, any>;
  workspace_id?: string;
  user_id?: string;
}) {
  // Get the relation first to check its workspace_id
  const existingRelation = await FactRelation.findById(args.id);
  if (!existingRelation) {
    throw new Error(`FactRelation with id ${args.id} not found`);
  }

  // Validate workspace_id (should be set from context) - map to workspace_id
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (existingRelation.workspace_id !== args.workspace_id) {
    throw new Error("FactRelation does not belong to the specified workspace");
  }

  // Validate workspace membership if user_id is provided
  if (args.user_id) {
    const member = await WorkspaceMember.findByWorkspaceAndUser(existingRelation.workspace_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this workspace");
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

