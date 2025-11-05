import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact } from "@knowledgeplane/db";

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
}) {
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

