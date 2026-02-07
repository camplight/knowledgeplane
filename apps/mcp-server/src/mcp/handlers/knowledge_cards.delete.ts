import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeCard, WorkspaceMember } from "@knowledgeplane/db";

export const knowledgeCardsDeleteTool: Tool = {
  name: "knowledge_cards_delete",
  description: "Delete a knowledge card by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The ID of the knowledge card to delete" },
      user_id: { type: "string", description: "User ID for workspace membership validation (optional, inferred from session if authenticated)" },
    },
    required: ["id"],
  },
};

export async function handleKnowledgeCardsDelete(args: { 
  id: string;
  workspace_id?: string;
  user_id?: string;
}) {
  // Get the card first to check its workspace_id
  const card = await KnowledgeCard.findById(args.id);
  if (!card) {
    throw new Error(`Knowledge card with id ${args.id} not found`);
  }

  // Validate workspace_id (should be set from context) - map to workspace_id
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (card.workspace_id !== args.workspace_id) {
    throw new Error("Knowledge card does not belong to the specified workspace");
  }

  // Validate workspace membership if user_id is provided
  if (args.user_id) {
    const member = await WorkspaceMember.findByWorkspaceAndUser(card.workspace_id, args.user_id);
    if (!member) {
      throw new Error("You are not a member of this workspace");
    }
  }

  await KnowledgeCard.delete(args.id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, message: `Knowledge card ${args.id} deleted` }, null, 2),
      },
    ],
  };
}

