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
    },
    required: ["fact_id"],
  },
};

export async function handleFactRelationsGetRelated(args: {
  fact_id: string;
  relation_type?: string;
  workspace_id?: string;
}) {
  // Get the fact to check its workspace_id
  const fact = await Fact.findById(args.fact_id);
  if (!fact) {
    throw new Error(`Fact with id ${args.fact_id} not found`);
  }

  // Validate workspace_id (should be set from context) - map to workspace_id
  if (!args.workspace_id) {
    throw new Error("Workspace ID is required. Workspace ID should be automatically inferred from authenticated session context.");
  }
  
  if (fact.workspace_id !== args.workspace_id) {
    throw new Error("Fact does not belong to the specified workspace");
  }

  const results = await FactRelation.getRelatedFacts(
    args.fact_id,
    args.relation_type,
  );

  // Filter by workspace_id
  const workspaceId = args.workspace_id;
  const filteredResults = results.filter(
    (r) => r.relation.workspace_id === workspaceId && r.fact.workspace_id === workspaceId,
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

