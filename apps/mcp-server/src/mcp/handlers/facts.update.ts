import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact, WorkspaceMember } from "@knowledgeplane/db";

export const factsUpdateTool: Tool = {
  name: "facts_update",
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

