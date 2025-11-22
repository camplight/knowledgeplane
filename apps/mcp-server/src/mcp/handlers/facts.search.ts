import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Fact } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";

export const factsSearchTool: Tool = {
  name: "facts.search",
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

  // Limit k to prevent context window issues (max 20 results)
  const limit = Math.min(args.k || 5, 20);
  const maxContentLength = 500; // Truncate content to 500 chars to save tokens

  const hits = await Fact.search({
    query: args.query,
    k: limit,
    offset: args.offset,
    include_trashed: args.include_trashed,
    use_vector_search: undefined, // Use hybrid search (default)
    embeddingProvider: provider,
  });

  // Optimize response: remove unnecessary fields and truncate long content
  const optimizedHits = hits.map((hit) => {
    const { embedding, embedding_model, _key, _id, ...rest } = hit;
    const content =
      rest.content.length > maxContentLength
        ? rest.content.substring(0, maxContentLength) + "..."
        : rest.content;
    return {
      ...rest,
      content,
      // Indicate if content was truncated
      content_truncated: hit.content.length > maxContentLength,
    };
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            hits: optimizedHits,
            total_returned: optimizedHits.length,
            limit_used: limit,
            note: optimizedHits.some((h) => h.content_truncated)
              ? "Some facts have truncated content. Use facts.update to retrieve full content if needed."
              : undefined,
          },
          null,
          2,
        ),
      },
    ],
  };
}
