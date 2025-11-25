import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  KnowledgeCard,
  Fact,
  generateQueryEmbedding,
  cosineSimilarity,
} from "@knowledgeplane/db";
import type { KnowledgeCardRecord } from "@knowledgeplane/db";
import { createAIModelClient } from "@knowledgeplane/aimodel";

function normalizeCardRecord(doc: any): KnowledgeCardRecord {
  return {
    id: doc._id || `knowledge_cards/${doc._key}`,
    _key: doc._key,
    _id: doc._id,
    title: doc.title,
    summary: doc.summary,
    content: doc.content,
    fact_ids: doc.fact_ids || [],
    created_by: doc.created_by,
    last_updated_by: doc.last_updated_by,
    metadata: doc.metadata || {},
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    embedding: doc.embedding,
    embedding_model: doc.embedding_model,
  };
}

export const knowledgeCardsSearchTool: Tool = {
  name: "knowledge_cards.search",
  description:
    "Search knowledge cards using hybrid search (combines full-text and vector search). Supports pagination with k (limit) and offset parameters.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query for hybrid search. Use '*' to search all cards.",
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
        description: "If true, use vector search only; if false, use full-text only; if undefined, use hybrid",
      },
    },
    required: ["query"],
  },
};

interface KnowledgeCardSearchResult {
  card: any;
  score: number;
}

export async function handleKnowledgeCardsSearch(args: {
  query: string;
  team_id?: string;
  k?: number;
  offset?: number;
  use_vector_search?: boolean;
}) {
  const limit = args.k || 5;
  const offset = args.offset || 0;
  const useVectorSearch = args.use_vector_search;
  const isWildcard = args.query === "*";

  // Create AI model client for embeddings (needed for hybrid/vector search)
  const client = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    process.env.OPENAI_API_KEY,
  );
  const provider = client.getProvider();

  // If vector search is explicitly disabled or query is wildcard, use full-text only
  if (useVectorSearch === false || isWildcard) {
    const results = await _fullTextSearch(args.query, args.team_id, limit, offset);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ hits: results }, null, 2),
        },
      ],
    };
  }

  // If vector search is explicitly enabled, use vector search only
  if (useVectorSearch === true) {
    const results = await _vectorSearch(args.query, args.team_id, limit, offset, provider);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ hits: results }, null, 2),
        },
      ],
    };
  }

  // Otherwise, use hybrid search (default)
  const results = await _hybridSearch(args.query, args.team_id, limit, offset, provider);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ hits: results }, null, 2),
      },
    ],
  };
}

async function _fullTextSearch(
  query: string,
  teamId: string | undefined,
  limit: number,
  offset: number,
): Promise<KnowledgeCardSearchResult[]> {
  const { collections } = await import("@knowledgeplane/db");
  const isWildcard = query === "*";

  let aql: string;
  const bindVars: any = {
    limit,
    offset,
  };

  const filters: string[] = [];
  if (teamId) {
    filters.push(`card.team_id == @teamId`);
    bindVars.teamId = teamId;
  }
  const filterClause = filters.length > 0 ? `FILTER ${filters.join(" && ")}` : "";

  if (isWildcard) {
    aql = `
      FOR card IN knowledge_cards
        ${filterClause}
        SORT card.updated_at DESC, card.created_at DESC
        LIMIT @offset, @limit
        RETURN { card: card, score: 1.0 }
    `;
  } else {
    // Try to use FULLTEXT index first
    aql = `
      FOR card IN FULLTEXT(knowledge_cards, "content", @query)
        ${filterClause}
        SORT card.updated_at DESC, card.created_at DESC
        LIMIT @offset, @limit
        RETURN { card: card, score: BM25(card) }
    `;
    bindVars.query = query;
  }

  try {
    const cursor = await collections.knowledge_cards.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => ({
      card: normalizeCardRecord(r.card),
      score: r.score || 1.0,
    }));
  } catch (error: any) {
    // If fulltext index doesn't exist, fall back to LIKE search
    if (error.errorNum === 1571 || error.message?.includes("fulltext index")) {
      console.warn("Fulltext index not found, falling back to LIKE search");

      const fallbackFilters: string[] = [];
      if (teamId) {
        fallbackFilters.push(`card.team_id == @teamId`);
      }
      fallbackFilters.push(`(LOWER(card.title) LIKE LOWER(CONCAT("%", @query, "%"))
             OR LOWER(card.summary) LIKE LOWER(CONCAT("%", @query, "%"))
             OR LOWER(card.content) LIKE LOWER(CONCAT("%", @query, "%")))`);
      const fallbackFilterClause = fallbackFilters.length > 0 ? `FILTER ${fallbackFilters.join(" && ")}` : "";
      
      const fallbackAql = `
        FOR card IN knowledge_cards
          ${fallbackFilterClause}
          SORT card.updated_at DESC, card.created_at DESC
          LIMIT @offset, @limit
          RETURN { card: card, score: 1.0 }
      `;

      const fallbackCursor = await collections.knowledge_cards.database.query(
        fallbackAql,
        bindVars,
      );
      const fallbackResults = await fallbackCursor.all();

      return fallbackResults.map((r: any) => ({
        card: normalizeCardRecord(r.card),
        score: r.score || 1.0,
      }));
    }

    throw error;
  }
}

async function _vectorSearch(
  query: string,
  teamId: string | undefined,
  limit: number,
  offset: number,
  provider: any,
): Promise<KnowledgeCardSearchResult[]> {
  const { collections } = await import("@knowledgeplane/db");

  if (!provider) {
    console.warn(
      "Vector search requires embedding provider. Falling back to full-text search.",
    );
    return _fullTextSearch(query, teamId, limit, offset);
  }

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(query, provider);

    // Get all cards with embeddings and calculate cosine similarity manually
    const filters: string[] = [`card.embedding != null`];
    const bindVars: any = {};
    if (teamId) {
      filters.push(`card.team_id == @teamId`);
      bindVars.teamId = teamId;
    }
    
    const aql = `
      FOR card IN knowledge_cards
        FILTER ${filters.join(" && ")}
        RETURN card
    `;

    const cursor = await collections.knowledge_cards.database.query(aql, bindVars);
    const allCards = await cursor.all();

    // Calculate cosine similarity for each card and sort by score
    const resultsWithScores = allCards
      .map((card: any) => {
        try {
          const score = cosineSimilarity(card.embedding, queryEmbedding);
          return {
            card: normalizeCardRecord(card),
            score,
          };
        } catch (error: any) {
          console.warn(
            `Skipping card ${card._id} due to embedding error:`,
            error.message,
          );
          return null;
        }
      })
      .filter((r: any) => r !== null)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(offset, offset + limit);

    return resultsWithScores;
  } catch (error: any) {
    console.error("Vector search error:", error.message);
    return _fullTextSearch(query, teamId, limit, offset);
  }
}

async function _hybridSearch(
  query: string,
  teamId: string | undefined,
  limit: number,
  offset: number,
  provider: any,
): Promise<KnowledgeCardSearchResult[]> {
  // If no provider, use full-text only
  if (!provider) {
    return _fullTextSearch(query, teamId, limit, offset);
  }

  try {
    // Get results from both full-text and vector search
    const [fullTextResults, vectorResults] = await Promise.all([
      _fullTextSearch(query, teamId, limit * 2, 0), // Get more results to merge
      _vectorSearch(query, teamId, limit * 2, 0, provider),
    ]);

    // Create a map to deduplicate and combine scores
    const resultMap = new Map<
      string,
      { card: any; scores: number[] }
    >();

    // Add full-text results (normalize score to 0-1 range)
    for (const result of fullTextResults) {
      const normalizedScore = Math.min(result.score / 10, 1); // Normalize BM25 score
      resultMap.set(result.card.id, {
        card: result.card,
        scores: [normalizedScore],
      });
    }

    // Add vector results (already normalized 0-1)
    for (const result of vectorResults) {
      const existing = resultMap.get(result.card.id);
      if (existing) {
        existing.scores.push(result.score);
      } else {
        resultMap.set(result.card.id, {
          card: result.card,
          scores: [result.score],
        });
      }
    }

    // Combine scores: average of both scores, weighted equally
    const combinedResults: KnowledgeCardSearchResult[] = Array.from(
      resultMap.values(),
    ).map((item) => {
      const avgScore =
        item.scores.reduce((sum, s) => sum + s, 0) / item.scores.length;
      return {
        card: item.card,
        score: avgScore,
      };
    });

    // Sort by combined score and limit
    combinedResults.sort((a, b) => b.score - a.score);

    return combinedResults.slice(offset, offset + limit);
  } catch (error: any) {
    console.error("Hybrid search error:", error.message);
    return _fullTextSearch(query, teamId, limit, offset);
  }
}

