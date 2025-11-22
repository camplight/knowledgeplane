import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation } from "@knowledgeplane/db";

export const factRelationsUpdateTool: Tool = {
  name: "fact_relations.update",
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
    },
    required: ["id"],
  },
};

export async function handleFactRelationsUpdate(args: {
  id: string;
  type?: string;
  metadata?: Record<string, any>;
}) {
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

