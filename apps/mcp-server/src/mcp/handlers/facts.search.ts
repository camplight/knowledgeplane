import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";

export const factsSearchTool: Tool = {
  name: "facts.search",
  description:
    "Search facts using hybrid search (combines full-text and vector search). Supports pagination with k (limit) and offset parameters. Trashed facts are excluded by default unless include_trashed is true.",
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
        description: "Optional limit for number of results (default: 5)",
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
  k?: number;
  offset?: number;
  include_trashed?: boolean;
}) {
  // Create AI model client for embeddings (needed for hybrid search)
  const client = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    process.env.OPENAI_API_KEY,
  );
  const provider = client.getProvider();

  const hits = await Fact.search({
    query: args.query,
    k: args.k,
    offset: args.offset,
    include_trashed: args.include_trashed,
    use_vector_search: undefined, // Use hybrid search (default)
    embeddingProvider: provider,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ hits }, null, 2),
      },
    ],
  };
}
