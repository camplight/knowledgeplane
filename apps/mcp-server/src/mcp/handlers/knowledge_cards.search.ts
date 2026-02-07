import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { searchKnowledgeCards } from "@knowledgeplane/api-core";

export const knowledgeCardsSearchTool: Tool = {
  name: "knowledge_cards_search",
  description:
    "Search knowledge cards using hybrid search (combines full-text and vector search). Supports pagination with k (limit) and offset parameters.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query for hybrid search. Use '*' to search all cards.",
      },
      k: {
        type: "number",
        description: "Optional limit for number of results (default: 5)",
      },
      offset: {
        type: "number",
        description: "Optional offset for pagination (default: 0)",
      },
      use_vector_search: {
        type: "boolean",
        description:
          "If true, use vector search only; if false, use full-text only; if undefined, use hybrid",
      },
    },
    required: ["query"],
  },
};

export async function handleKnowledgeCardsSearch(args: {
  query: string;
  workspace_id?: string;
  k?: number;
  offset?: number;
  use_vector_search?: boolean;
}) {
  const results = await searchKnowledgeCards({
    query: args.query,
    workspace_id: args.workspace_id,
    k: args.k,
    offset: args.offset,
    use_vector_search: args.use_vector_search,
  });
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ hits: results }, null, 2),
      },
    ],
  };
}
