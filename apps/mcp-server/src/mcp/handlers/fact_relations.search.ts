import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation } from "@knowledgeplane/db";
import { stripEmbeddingsArray } from "./strip-embeddings.js";

export const factRelationsSearchTool: Tool = {
  name: "fact_relations_search",
  description:
    "Search fact relations with filtering. Supports filtering by from_fact, to_fact, and type. Supports pagination.",
  inputSchema: {
    type: "object",
    properties: {
      from_fact: {
        type: "string",
        description: "Filter by source fact ID",
      },
      to_fact: {
        type: "string",
        description: "Filter by target fact ID",
      },
      type: {
        type: "string",
        description: "Filter by relation type",
      },
      limit: {
        type: "number",
        description: "Maximum number of relations to return (default: 50)",
      },
      offset: {
        type: "number",
        description: "Offset for pagination (default: 0)",
      },
    },
  },
};

export async function handleFactRelationsSearch(args: {
  from_fact?: string;
  to_fact?: string;
  type?: string;
  workspace_id?: string;
  limit?: number;
  offset?: number;
}) {
  const relations = await FactRelation.query({
    from_fact: args.from_fact,
    to_fact: args.to_fact,
    type: args.type,
    workspace_id: args.workspace_id,
    limit: args.limit,
    offset: args.offset,
  });
  const sanitizedRelations = stripEmbeddingsArray(relations);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { relations: sanitizedRelations, total: sanitizedRelations.length },
          null,
          2,
        ),
      },
    ],
  };
}

