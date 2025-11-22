import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation } from "@knowledgeplane/db";

export const factRelationsGetRelatedTool: Tool = {
  name: "fact_relations.get_related",
  description:
    "Get facts related to a given fact via outgoing relations. Returns relations and the related facts. Optionally filter by relation type.",
  inputSchema: {
    type: "object",
    properties: {
      fact_id: {
        type: "string",
        description: "The fact ID to get related facts for",
      },
      relation_type: {
        type: "string",
        description: "Optional filter by relation type",
      },
    },
    required: ["fact_id"],
  },
};

export async function handleFactRelationsGetRelated(args: {
  fact_id: string;
  relation_type?: string;
}) {
  const results = await FactRelation.getRelatedFacts(
    args.fact_id,
    args.relation_type,
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            fact_id: args.fact_id,
            relations: results.map((r) => ({
              relation: r.relation,
              related_fact: r.fact,
            })),
            total: results.length,
          },
          null,
          2,
        ),
      },
    ],
  };
}

