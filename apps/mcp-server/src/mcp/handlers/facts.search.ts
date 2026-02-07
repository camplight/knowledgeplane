import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { searchFacts } from "@knowledgeplane/api-core";

export const factsSearchTool: Tool = {
  name: "facts_search",
  description:
    "Search facts using hybrid search (combines full-text and vector search). Supports pagination with k (limit) and offset parameters. Trashed facts are excluded by default unless include_trashed is true. Results are optimized for AI context: content is truncated to 500 characters, embeddings are excluded, and maximum 20 results are returned per request.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query for hybrid search. Use '*' to search all facts.",
      },
      k: {
        type: "number",
        description:
          "Optional limit for number of results (default: 5, max: 20). Results are optimized to prevent context window issues.",
      },
      offset: {
        type: "number",
        description: "Optional offset for pagination (default: 0)",
      },
      include_trashed: {
        type: "boolean",
        description:
          "If true, includes trashed facts in search results (default: false)",
      },
    },
    required: ["query"],
  },
};

export async function handleFactsSearch(args: {
  query: string;
  workspace_id?: string;
  k?: number;
  offset?: number;
  include_trashed?: boolean;
}) {
  const results = await searchFacts({
    query: args.query,
    workspace_id: args.workspace_id,
    k: args.k,
    offset: args.offset,
    include_trashed: args.include_trashed,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ...results,
            note:
              results.note ??
              (results.hits.some((h) => h.content_truncated)
                ? "Some facts have truncated content. Use facts_update to retrieve full content if needed."
                : undefined),
          },
          null,
          2,
        ),
      },
    ],
  };
}
