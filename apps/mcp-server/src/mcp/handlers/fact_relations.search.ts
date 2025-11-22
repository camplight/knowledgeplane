import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation } from "@knowledgeplane/db";

export const factRelationsSearchTool: Tool = {
  name: "fact_relations.search",
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
  limit?: number;
  offset?: number;
}) {
  const relations = await FactRelation.query({
    from_fact: args.from_fact,
    to_fact: args.to_fact,
    type: args.type,
    limit: args.limit,
    offset: args.offset,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ relations, total: relations.length }, null, 2),
      },
    ],
  };
}

