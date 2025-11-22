import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation } from "@knowledgeplane/db";

export const factRelationsCreateTool: Tool = {
  name: "fact_relations.create",
  description:
    "Create a relation between two facts. Relations are typed edges in the knowledge graph.",
  inputSchema: {
    type: "object",
    properties: {
      from_fact: {
        type: "string",
        description: "Source fact ID",
      },
      to_fact: {
        type: "string",
        description: "Target fact ID",
      },
      type: {
        type: "string",
        description:
          "Relation type (e.g., 'references', 'depends_on', 'related_to', 'part_of')",
      },
      metadata: {
        type: "object",
        description: "Additional relation metadata",
        additionalProperties: true,
      },
      created_by: {
        type: "string",
        description:
          "User ID of the creator (optional, inferred from session if authenticated)",
      },
    },
    required: ["from_fact", "to_fact", "type"],
  },
};

export async function handleFactRelationsCreate(args: {
  from_fact: string;
  to_fact: string;
  type: string;
  metadata?: Record<string, any>;
  created_by?: string;
}) {
  // Validate that user ID is provided
  if (!args.created_by) {
    throw new Error(
      "User ID is required. Either provide created_by, or authenticate via session.",
    );
  }

  const relation = await FactRelation.create({
    from_fact: args.from_fact,
    to_fact: args.to_fact,
    type: args.type,
    metadata: args.metadata,
    created_by: args.created_by,
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

