import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { combineKnowledgeCards } from "@knowledgeplane/api-core";

export const knowledgeCardsCombineTool: Tool = {
  name: "knowledge_cards_combine",
  description:
    "Combine multiple knowledge cards into a single card. Uses AI to intelligently merge the content and facts.",
  inputSchema: {
    type: "object",
    properties: {
      card_ids: {
        type: "array",
        items: { type: "string" },
        description: "Array of knowledge card IDs to combine",
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
    required: ["card_ids"],
  },
};

export async function handleKnowledgeCardsCombine(args: {
  card_ids: string[];
  created_by?: string;
  last_updated_by?: string;
  workspace_id?: string;
}) {
  if (!args.created_by || !args.last_updated_by) {
    throw new Error(
      "User ID is required. Either provide created_by and last_updated_by, or authenticate via session.",
    );
  }

  if (args.card_ids.length < 2) {
    throw new Error("At least 2 cards are required to combine");
  }

  // Validate workspace_id (should be set from context)
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  const result = await combineKnowledgeCards({
    card_ids: args.card_ids,
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

