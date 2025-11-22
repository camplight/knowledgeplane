import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation } from "@knowledgeplane/db";

export const factRelationsGetTool: Tool = {
  name: "fact_relations.get",
  description: "Get a fact relation by ID",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the relation to retrieve",
      },
    },
    required: ["id"],
  },
};

export async function handleFactRelationsGet(args: { id: string }) {
  const relation = await FactRelation.findById(args.id);

  if (!relation) {
    throw new Error(`FactRelation with id ${args.id} not found`);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ relation }, null, 2),
      },
    ],
  };
}

