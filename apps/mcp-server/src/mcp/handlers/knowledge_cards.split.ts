import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { splitKnowledgeCard } from "@knowledgeplane/api-core";

export const knowledgeCardsSplitTool: Tool = {
  name: "knowledge_cards_split",
  description:
    "Split a knowledge card into multiple cards. Uses AI to intelligently divide the content and facts into separate cards.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the knowledge card to split",
      },
      num_cards: {
        type: "number",
        description: "Number of cards to split into (default: 2)",
      },
      created_by: {
        type: "string",
        description: "User ID of the creator (optional, inferred from session if authenticated)",
      },
      last_updated_by: {
        type: "string",
        description: "User ID of the last updater (optional, inferred from session if authenticated)",
      },
    },
    required: ["id"],
  },
};

export async function handleKnowledgeCardsSplit(args: {
  id: string;
  num_cards?: number;
  created_by?: string;
  last_updated_by?: string;
  workspace_id?: string;
}) {
  if (!args.created_by || !args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide created_by and last_updated_by, or authenticate via session.",
    );
  }

  // Validate workspace_id (should be set from context)
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  const result = await splitKnowledgeCard({
    id: args.id,
    num_cards: args.num_cards,
    created_by: args.created_by,
    last_updated_by: args.last_updated_by,
    workspace_id: args.workspace_id,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

