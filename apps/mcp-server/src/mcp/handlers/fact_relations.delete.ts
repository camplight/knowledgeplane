import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation } from "@knowledgeplane/db";

export const factRelationsDeleteTool: Tool = {
  name: "fact_relations.delete",
  description: "Delete a fact relation by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the relation to delete",
      },
    },
    required: ["id"],
  },
};

export async function handleFactRelationsDelete(args: { id: string }) {
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

