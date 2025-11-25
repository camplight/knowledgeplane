import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation, Fact } from "@knowledgeplane/db";

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
      team_id: {
        type: "string",
        description: "Team ID for filtering (optional, inferred from session if authenticated)",
      },
    },
    required: ["fact_id"],
  },
};

export async function handleFactRelationsGetRelated(args: {
  fact_id: string;
  relation_type?: string;
  team_id?: string;
}) {
  // Get the fact to check its team_id
  const fact = await Fact.findById(args.fact_id);
  if (!fact) {
    throw new Error(`Fact with id ${args.fact_id} not found`);
  }

  // Validate team_id (should be set from context)
  if (!args.team_id) {
    throw new Error("Team ID is required. Team ID should be automatically inferred from authenticated session context.");
  }
  
  if (fact.team_id !== args.team_id) {
    throw new Error("Fact does not belong to the specified team");
  }

  const results = await FactRelation.getRelatedFacts(
    args.fact_id,
    args.relation_type,
  );

  // Filter by team_id
  const teamId = args.team_id;
  const filteredResults = results.filter(
    (r) => r.relation.team_id === teamId && r.fact.team_id === teamId,
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            fact_id: args.fact_id,
            relations: filteredResults.map((r) => ({
              relation: r.relation,
              related_fact: r.fact,
            })),
            total: filteredResults.length,
          },
          null,
          2,
        ),
      },
    ],
  };
}

