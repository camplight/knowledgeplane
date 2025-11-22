import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation } from "@knowledgeplane/db";

export const factRelationsGetIncomingTool: Tool = {
  name: "fact_relations.get_incoming",
  description:
    "Get facts that have relations pointing to a given fact (incoming relations). Returns relations and the source facts. Optionally filter by relation type.",
  inputSchema: {
    type: "object",
    properties: {
      fact_id: {
        type: "string",
        description: "The fact ID to get incoming relations for",
      },
      relation_type: {
        type: "string",
        description: "Optional filter by relation type",
      },
    },
    required: ["fact_id"],
  },
};

export async function handleFactRelationsGetIncoming(args: {
  fact_id: string;
  relation_type?: string;
}) {
  const results = await FactRelation.getIncomingRelations(
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
              source_fact: r.fact,
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

