import { collections, ensureInitialized } from "../db";
import { triggerWebhook } from "../lib/webhook-trigger";
import { generateQueryEmbedding, cosineSimilarity } from "../lib/vector-search";
import type { AIModelProvider } from "@knowledgeplane/aimodel";

export interface FactInput {
  content: string;
  metadata?: Record<string, string>;
  workspace_id: string; // Workspace ID
  created_by: string; // User ID
  last_updated_by: string; // User ID
}

export interface FactRecord {
  _key?: string;
  _id?: string;
  id: string;
  content: string;
  metadata: Record<string, string>;
  workspace_id: string; // Workspace ID
  created_at: string;
  updated_at: string;
  created_by: string;
  last_updated_by: string;
  deleted_by?: string | null;
  deleted_at?: string | null;
  trashed: boolean;
  embedding?: number[]; // Vector embedding for semantic search
  embedding_model?: string; // Model used to generate embedding
}

export interface FactSearchResult extends FactRecord {
  score: number;
}

export interface FactSearchParams {
  query: string;
  workspace_id?: string; // Workspace ID for filtering
  k?: number;
  offset?: number;
  include_trashed?: boolean;
  use_vector_search?: boolean; // If true, use vector search; if false, use full-text; if undefined, use hybrid
  embeddingProvider?: AIModelProvider; // Optional provider for generating query embeddings
  embeddingModel?: string; // Optional embedding model name (provider-specific)
}

export interface FactUpdateInput {
  id: string;
  content?: string;
  metadata?: Record<string, string>;
  last_updated_by: string; // User ID
}

export class Fact {
  static async write(input: FactInput): Promise<FactRecord> {
    const now = new Date().toISOString();
    
    // Ensure content is always a string
    let content: string;
    if (typeof input.content === "string") {
      content = input.content;
    } else if (typeof input.content === "object" && input.content !== null) {
      // If content is an object, try to extract string content or stringify
      content = typeof (input.content as any).content === "string"
        ? (input.content as any).content
        : JSON.stringify(input.content);
    } else {
      content = String(input.content || "");
    }
    
    // Initialize with zero vector placeholder so vector index can be created
    // Worker will update with real embedding later
    // Zero vector won't match cosine queries (cos(0, x) = 0 for any x)
    const EMBEDDING_DIMENSION = 1536;  // text-embedding-3-small
    const zeroEmbedding = new Array(EMBEDDING_DIMENSION).fill(0);

    const doc = {
      content,
      metadata: input.metadata || {},
      workspace_id: input.workspace_id,
      created_by: input.created_by,
      last_updated_by: input.last_updated_by,
      trashed: false,
      created_at: now,
      updated_at: now,
      embedding: zeroEmbedding,  // Placeholder for vector index compatibility
      embedding_model: null,     // null indicates placeholder, not real embedding
    };

    console.log("[DEBUG] Fact.write - About to save doc:", {
      contentLength: content.length,
      metadataKeys: Object.keys(input.metadata || {}),
      workspace_id: input.workspace_id,
    });

    let result;
    try {
      result = await collections.facts.save(doc, { returnNew: true });
      console.log("[DEBUG] Fact.write - Successfully saved fact");
    } catch (error: any) {
      console.error("[DEBUG] Fact.write - FAILED to save fact:", {
        error: error.message,
        errorNum: error.errorNum,
        errorCode: error.code,
        doc: JSON.stringify(doc).substring(0, 200),
      });
      throw error;
    }

    const record = this._normalizeRecord(result.new!);

    // Trigger webhook
    triggerWebhook("fact.created", record).catch((error) => {
      console.error("Failed to trigger fact.created webhook:", error);
    });

    return record;
  }

  static async bulkWrite(inputs: FactInput[]): Promise<FactRecord[]> {
    if (inputs.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    // Initialize with zero vector placeholder so vector index can be created
    const EMBEDDING_DIMENSION = 1536;
    const zeroEmbedding = new Array(EMBEDDING_DIMENSION).fill(0);

    const docs = inputs.map((input) => {
      // Ensure content is always a string
      let content: string;
      if (typeof input.content === "string") {
        content = input.content;
      } else if (typeof input.content === "object" && input.content !== null) {
        // If content is an object, try to extract string content or stringify
        content = typeof (input.content as any).content === "string"
          ? (input.content as any).content
          : JSON.stringify(input.content);
      } else {
        content = String(input.content || "");
      }

      return {
        content,
        metadata: input.metadata || {},
        workspace_id: input.workspace_id,
        created_by: input.created_by,
        last_updated_by: input.last_updated_by,
        trashed: false,
        created_at: now,
        updated_at: now,
        embedding: zeroEmbedding,  // Placeholder for vector index compatibility
        embedding_model: null,     // null indicates placeholder, not real embedding
      };
    });

    const result = await collections.facts.saveAll(docs, {
      returnNew: true,
    });
    const records =
      (result as any).saved?.map((doc: any) =>
        this._normalizeRecord(doc.new),
      ) || [];

    // Trigger webhooks for each fact
    for (const record of records) {
      triggerWebhook("fact.created", record).catch((error) => {
        console.error("Failed to trigger fact.created webhook:", error);
      });
    }

    return records;
  }

  static async update(input: FactUpdateInput): Promise<FactRecord> {
    const updates: any = {
      last_updated_by: input.last_updated_by,
      updated_at: new Date().toISOString(),
    };

    if (input.content !== undefined) {
      // Ensure content is always a string
      if (typeof input.content === "string") {
        updates.content = input.content;
      } else if (typeof input.content === "object" && input.content !== null) {
        // If content is an object, try to extract string content or stringify
        updates.content = typeof (input.content as any).content === "string"
          ? (input.content as any).content
          : JSON.stringify(input.content);
      } else {
        updates.content = String(input.content || "");
      }
    }
    if (input.metadata !== undefined) {
      updates.metadata = input.metadata;
    }

    const key = this.extractKey(input.id);
    const result = await collections.facts.update(key, updates, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`Fact with id ${input.id} not found`);
    }

    const record = this._normalizeRecord(result.new!);

    // Trigger webhook
    triggerWebhook("fact.updated", record).catch((error) => {
      console.error("Failed to trigger fact.updated webhook:", error);
    });

    return record;
  }

  static async trash(
    id: string,
    last_updated_by: string,
  ): Promise<FactRecord> {
    const key = this.extractKey(id);
    const now = new Date().toISOString();
    const result = await collections.facts.update(
      key,
      {
        trashed: true,
        last_updated_by,
        deleted_at: now,
        deleted_by: last_updated_by,
        updated_at: now,
      },
      { returnNew: true },
    );

    if (!result) {
      throw new Error(`Fact with id ${id} not found`);
    }

    const record = this._normalizeRecord(result.new!);

    // Trigger webhook
    triggerWebhook("fact.trashed", record).catch((error) => {
      console.error("Failed to trigger fact.trashed webhook:", error);
    });

    return record;
  }

  static async search(params: FactSearchParams): Promise<FactSearchResult[]> {
    // Ensure database is initialized
    await ensureInitialized();

    const limit = params.k || 5;
    const offset = params.offset || 0;
    const includeTrashed = params.include_trashed || false;
    const useVectorSearch = params.use_vector_search;

    const isWildcard = params.query === "*";

    // If vector search is explicitly disabled or query is wildcard, use full-text only
    if (useVectorSearch === false || isWildcard) {
      return this._fullTextSearch(params);
    }

    // If vector search is explicitly enabled, use vector search only
    if (useVectorSearch === true) {
      return this._vectorSearch(params);
    }

    // Otherwise, use hybrid search (default)
    return this._hybridSearch(params);
  }

  private static async _fullTextSearch(
    params: FactSearchParams,
  ): Promise<FactSearchResult[]> {
    const limit = params.k || 5;
    const offset = params.offset || 0;
    const includeTrashed = params.include_trashed || false;
    const isWildcard = params.query === "*";

    const bindVars: any = {
      limit,
      offset,
      includeTrashed,
    };

    if (isWildcard) {
      // Wildcard query - return all facts sorted by date
      const filters: string[] = [];
      if (params.workspace_id) {
        filters.push(`fact.workspace_id == @workspaceId`);
        bindVars.workspaceId = params.workspace_id;
      }
      filters.push(`(fact.trashed == false || @includeTrashed == true)`);
      const filterClause = filters.length > 0 ? `FILTER ${filters.join(" && ")}` : "";

      const aql = `
        FOR fact IN facts
          ${filterClause}
          SORT fact.updated_at DESC, fact.created_at DESC
          LIMIT @offset, @limit
          RETURN { fact: fact, score: 1.0 }
      `;

      const cursor = await collections.facts.database.query(aql, bindVars);
      const results = await cursor.all();

      return results.map((r: any) => ({
        ...this._normalizeRecord(r.fact),
        score: r.score || 1.0,
      }));
    }

    // Try ArangoSearch view with BM25 first (proper ranking)
    try {
      return await this._bm25Search(params);
    } catch (error: any) {
      console.warn("BM25 search failed, falling back to FULLTEXT:", error.message);
    }

    // Fallback to deprecated FULLTEXT() - no ranking but still works
    try {
      return await this._legacyFulltextSearch(params);
    } catch (error: any) {
      console.warn("FULLTEXT index not available, falling back to LIKE search:", error.message);
    }

    // Final fallback: LIKE search (slowest, but always works)
    return this._likeSearch(params);
  }

  /**
   * BM25 search using ArangoSearch view (proper relevance ranking).
   * Uses the facts_search_view created in db.ts init().
   */
  private static async _bm25Search(
    params: FactSearchParams,
  ): Promise<FactSearchResult[]> {
    const limit = params.k || 5;
    const offset = params.offset || 0;
    const includeTrashed = params.include_trashed || false;

    const bindVars: any = {
      query: params.query,
      limit: limit + offset,
      includeTrashed,
    };

    // Build SEARCH and FILTER clauses
    // Use TOKENS() for general keyword search (not PHRASE which is for exact matches)
    const postFilters: string[] = [`(fact.trashed == false || @includeTrashed == true)`];

    if (params.workspace_id) {
      postFilters.push(`fact.workspace_id == @workspaceId`);
      bindVars.workspaceId = params.workspace_id;
    }

    // Use ArangoSearch view with BM25 scoring
    // TOKENS(@query, "text_en") tokenizes the query using the text_en analyzer
    // fact.content IN TOKENS(...) matches any token
    const aql = `
      FOR fact IN facts_search_view
        SEARCH ANALYZER(fact.content IN TOKENS(@query, "text_en"), "text_en")
        FILTER ${postFilters.join(" && ")}
        LET bm25_score = BM25(fact, 1.2, 0.75)
        SORT bm25_score DESC
        LIMIT @limit
        RETURN { fact: fact, score: bm25_score }
    `;

    const searchStartTime = Date.now();
    const cursor = await collections.facts.database.query(aql, bindVars);
    const results = await cursor.all();
    const searchTime = Date.now() - searchStartTime;

    const finalResults = results.slice(offset).map((r: any) => ({
      ...this._normalizeRecord(r.fact),
      score: r.score || 0,
    }));

    console.log(`[BENCHMARK] BM25 search (ArangoSearch view):`, {
      query: params.query.substring(0, 50) + '...',
      results_returned: finalResults.length,
      timing_ms: searchTime,
      top_score: finalResults[0]?.score || 0,
    });

    return finalResults;
  }

  /**
   * Legacy FULLTEXT search (deprecated in ArangoDB 3.10+).
   * Falls back to this if ArangoSearch view doesn't exist.
   */
  private static async _legacyFulltextSearch(
    params: FactSearchParams,
  ): Promise<FactSearchResult[]> {
    const limit = params.k || 5;
    const offset = params.offset || 0;
    const includeTrashed = params.include_trashed || false;

    const bindVars: any = {
      query: params.query,
      limit,
      offset,
      includeTrashed,
    };

    const filters: string[] = [];
    if (params.workspace_id) {
      filters.push(`fact.workspace_id == @workspaceId`);
      bindVars.workspaceId = params.workspace_id;
    }
    filters.push(`(fact.trashed == false || @includeTrashed == true)`);
    const filterClause = `FILTER ${filters.join(" && ")}`;

    // Note: FULLTEXT() orders by relevance but doesn't expose score
    const aql = `
      FOR fact IN FULLTEXT(facts, "content", @query)
        ${filterClause}
        LIMIT @offset, @limit
        RETURN { fact: fact, score: 1.0 }
    `;

    const cursor = await collections.facts.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => ({
      ...this._normalizeRecord(r.fact),
      score: r.score || 1.0,
    }));
  }

  /**
   * LIKE search fallback (slowest, but always works).
   * Used when neither ArangoSearch view nor FULLTEXT index is available.
   */
  private static async _likeSearch(
    params: FactSearchParams,
  ): Promise<FactSearchResult[]> {
    const limit = params.k || 5;
    const offset = params.offset || 0;
    const includeTrashed = params.include_trashed || false;

    const bindVars: any = {
      query: params.query,
      limit,
      offset,
      includeTrashed,
    };

    const filters: string[] = [];
    if (params.workspace_id) {
      filters.push(`fact.workspace_id == @workspaceId`);
      bindVars.workspaceId = params.workspace_id;
    }
    filters.push(`(fact.trashed == false || @includeTrashed == true)`);
    filters.push(`LOWER(fact.content) LIKE LOWER(CONCAT("%", @query, "%"))`);

    const aql = `
      FOR fact IN facts
        FILTER ${filters.join(" && ")}
        SORT fact.updated_at DESC, fact.created_at DESC
        LIMIT @offset, @limit
        RETURN { fact: fact, score: 1.0 }
    `;

    const cursor = await collections.facts.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => ({
      ...this._normalizeRecord(r.fact),
      score: r.score || 1.0,
    }));
  }

  private static async _vectorSearch(
    params: FactSearchParams,
  ): Promise<FactSearchResult[]> {
    const limit = params.k || 5;
    const offset = params.offset || 0;
    const includeTrashed = params.include_trashed || false;
    const provider = params.embeddingProvider;

    if (!provider) {
      console.warn(
        "Vector search requires embedding provider. Falling back to full-text search.",
      );
      return this._fullTextSearch(params);
    }

    try {
      const searchStartTime = Date.now();

      // Generate embedding for the query
      const queryEmbedding = await generateQueryEmbedding(
        params.query,
        provider,
        params.embeddingModel,
      );
      const embeddingTime = Date.now() - searchStartTime;

      // Build filter conditions
      // Filter out placeholder embeddings (embedding_model: null means not yet generated)
      const filters: string[] = [
        `fact.embedding_model != null`,  // Exclude placeholder zero vectors
        `(fact.trashed == false || @includeTrashed == true)`,
      ];
      const bindVars: any = {
        includeTrashed,
        queryEmbedding,
        limit: limit + offset,
      };

      if (params.workspace_id) {
        filters.push(`fact.workspace_id == @workspaceId`);
        bindVars.workspaceId = params.workspace_id;
      }

      // Use ArangoDB's native APPROX_NEAR_COSINE for O(log n) vector search
      // CRITICAL: Two-phase approach to ensure vector index is actually used
      // Phase 1: Get nearest candidates via index (NO filters - filters prevent index usage)
      // Phase 2: Apply filters in application code
      //
      // Why? ArangoDB vector index can only be used when APPROX_NEAR_COSINE is computed
      // BEFORE any FILTER clauses. Pre-filters force a full collection scan.
      const candidateLimit = (limit + offset) * 3; // Get 3x candidates to account for filtering

      // Dynamically determine nProbe to match nLists for full cluster coverage
      // nLists is calculated as: min(max(16, docCount), 100) at index creation
      // We replicate that calculation here to ensure nProbe = nLists
      const nListsQuery = `
        LET count = LENGTH(FOR f IN facts FILTER f.embedding != null RETURN 1)
        RETURN MIN([MAX([16, MIN([count, 100])]), 100])
      `;
      const nListsCursor = await collections.facts.database.query(nListsQuery);
      const nProbe = (await nListsCursor.next()) || 16;

      // Use dynamic nProbe to search ALL clusters for maximum recall
      // This ensures freshly inserted documents are found immediately
      // Trade-off: slightly slower but much more accurate for real-time search
      const phase1Aql = `
        FOR fact IN facts
          OPTIONS { indexHint: "idx_fact_embedding_vector", forceIndexHint: true }
          LET score = APPROX_NEAR_COSINE(fact.embedding, @queryEmbedding, { nProbe: @nProbe })
          SORT score DESC
          LIMIT @candidateLimit
          RETURN { fact: fact, score: score }
      `;

      const queryStartTime = Date.now();
      const cursor = await collections.facts.database.query(phase1Aql, {
        queryEmbedding,
        candidateLimit,
        nProbe,
      });
      const candidates = await cursor.all();
      const queryTime = Date.now() - queryStartTime;

      // Phase 2: Apply filters in application code
      const filterStartTime = Date.now();
      const filteredResults = candidates.filter((r: any) => {
        const fact = r.fact;
        // Filter out placeholder embeddings (embedding_model: null)
        if (fact.embedding_model === null || fact.embedding_model === undefined) {
          return false;
        }
        // Filter by workspace if specified
        if (params.workspace_id && fact.workspace_id !== params.workspace_id) {
          return false;
        }
        // Filter trashed
        if (fact.trashed && !includeTrashed) {
          return false;
        }
        return true;
      });
      const filterTime = Date.now() - filterStartTime;

      const resultsWithScores = filteredResults
        .slice(offset, offset + limit)
        .map((r: any) => ({
          fact: this._normalizeRecord(r.fact),
          score: r.score,
        }));

      const totalTime = Date.now() - searchStartTime;

      console.log(`[BENCHMARK] Vector search (APPROX_NEAR_COSINE, two-phase):`, {
        query: params.query.substring(0, 50) + '...',
        workspace_id: params.workspace_id,
        nProbe: nProbe,  // Dynamic nProbe = nLists for full coverage
        candidates_from_index: candidates.length,
        after_filtering: filteredResults.length,
        results_returned: resultsWithScores.length,
        timing_ms: {
          embedding_generation: embeddingTime,
          db_query_phase1: queryTime,
          filter_phase2: filterTime,
          total: totalTime,
        },
        top_score: resultsWithScores[0]?.score || 0,
        index_used: 'idx_fact_embedding_vector (two-phase)',
      });

      return resultsWithScores.map((r: any) => ({
        ...r.fact,
        score: r.score || 0,
      }));
    } catch (error: any) {
      // APPROX_NEAR_COSINE failed (no vector index yet or other issue)
      // Fall back to JS cosine - this is O(n) but works without index
      // Once vector index is created, this fallback won't be needed
      console.warn("APPROX_NEAR_COSINE failed, using JS cosine fallback:", error.message);
      return this._fallbackVectorSearch(params, provider, offset, limit, includeTrashed);
    }
  }

  /**
   * Fallback vector search using JS cosine similarity (O(n) complexity).
   * Used when APPROX_NEAR_COSINE is not available (e.g., no vector index).
   */
  private static async _fallbackVectorSearch(
    params: FactSearchParams,
    provider: any,
    offset: number,
    limit: number,
    includeTrashed: boolean,
  ): Promise<FactSearchResult[]> {
    const searchStartTime = Date.now();

    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(params.query, provider);
    const embeddingTime = Date.now() - searchStartTime;

    // Get all facts with REAL embeddings (O(n) approach)
    // Filter out placeholder zero vectors by checking embedding_model != null
    const filters: string[] = [
      `fact.embedding != null`,
      `fact.embedding_model != null`,  // Exclude placeholder zero vectors
      `(fact.trashed == false || @includeTrashed == true)`,
    ];
    const bindVars: any = { includeTrashed };

    if (params.workspace_id) {
      filters.push(`fact.workspace_id == @workspaceId`);
      bindVars.workspaceId = params.workspace_id;
    }

    const aql = `
      FOR fact IN facts
        FILTER ${filters.join(" && ")}
        RETURN fact
    `;

    const queryStartTime = Date.now();
    const cursor = await collections.facts.database.query(aql, bindVars);
    const allFacts = await cursor.all();
    const queryTime = Date.now() - queryStartTime;

    // Calculate cosine similarity for each fact and sort by score
    const scoreStartTime = Date.now();
    const resultsWithScores = allFacts
      .map((fact: any) => {
        try {
          const score = cosineSimilarity(fact.embedding, queryEmbedding);
          return { fact: this._normalizeRecord(fact), score };
        } catch (error: any) {
          console.warn(`Skipping fact ${fact._id} due to embedding error:`, error.message);
          return null;
        }
      })
      .filter((r: any) => r !== null)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(offset, offset + limit);
    const scoreTime = Date.now() - scoreStartTime;
    const totalTime = Date.now() - searchStartTime;

    console.log(`[BENCHMARK] Vector search (JS fallback - O(n)):`, {
      query: params.query.substring(0, 50) + '...',
      workspace_id: params.workspace_id,
      facts_scanned: allFacts.length,
      results_returned: resultsWithScores.length,
      timing_ms: {
        embedding_generation: embeddingTime,
        db_query: queryTime,
        similarity_calculation: scoreTime,
        total: totalTime,
      },
      top_score: resultsWithScores[0]?.score || 0,
    });

    return resultsWithScores.map((r: any) => ({
      ...r.fact,
      score: r.score || 0,
    }));
  }

  private static async _hybridSearch(
    params: FactSearchParams,
  ): Promise<FactSearchResult[]> {
    const limit = params.k || 5;
    const provider = params.embeddingProvider;

    // If no provider, use full-text only
    if (!provider) {
      return this._fullTextSearch(params);
    }

    try {
      // Get results from both full-text and vector search
      const [fullTextResults, vectorResults] = await Promise.all([
        this._fullTextSearch({ ...params, k: limit * 2 }), // Get more results to merge
        this._vectorSearch({ ...params, k: limit * 2 }),
      ]);

      // Create a map to deduplicate and combine scores
      const resultMap = new Map<
        string,
        { fact: FactRecord; bm25Score: number | null; vectorScore: number | null }
      >();

      // Add full-text results
      // BM25 scores are unbounded (0 to ~20+), normalize to 0-1 using: score / (score + 1)
      for (const result of fullTextResults) {
        const normalizedBM25 = result.score / (result.score + 1);
        resultMap.set(result.id, {
          fact: result,
          bm25Score: normalizedBM25,
          vectorScore: null,
        });
      }

      // Add vector results (already normalized 0-1)
      for (const result of vectorResults) {
        const existing = resultMap.get(result.id);
        if (existing) {
          existing.vectorScore = result.score;
        } else {
          resultMap.set(result.id, {
            fact: result,
            bm25Score: null,
            vectorScore: result.score,
          });
        }
      }

      // Combine scores: weighted average of BM25 and vector scores
      // If only one score exists, use it; otherwise average them
      const combinedResults: FactSearchResult[] = Array.from(
        resultMap.values(),
      ).map((item) => {
        let combinedScore: number;
        if (item.bm25Score !== null && item.vectorScore !== null) {
          // Both scores exist - average them (equal weight)
          combinedScore = (item.bm25Score + item.vectorScore) / 2;
        } else if (item.bm25Score !== null) {
          // Only BM25 score
          combinedScore = item.bm25Score * 0.8; // Slight penalty for single-source
        } else if (item.vectorScore !== null) {
          // Only vector score
          combinedScore = item.vectorScore * 0.8; // Slight penalty for single-source
        } else {
          combinedScore = 0;
        }
        return {
          ...item.fact,
          score: combinedScore,
        };
      });

      // Sort by combined score and limit
      combinedResults.sort((a, b) => b.score - a.score);

      const offset = params.offset || 0;
      return combinedResults.slice(offset, offset + limit);
    } catch (error: any) {
      console.error("Hybrid search error:", error.message);
      // Fall back to full-text search on error
      return this._fullTextSearch(params);
    }
  }

  static async list(
    workspaceId?: string,
    limit: number = 50,
    offset: number = 0,
    includeTrashed: boolean = false,
  ): Promise<FactRecord[]> {
    // Ensure limit and offset are valid numbers
    const validLimit = Math.max(1, limit || 50);
    const validOffset = Math.max(0, offset || 0);
    
    const filters: string[] = [`(fact.trashed == false || @includeTrashed == true)`];
    const bindVars: any = {
      limit: validLimit,
      offset: validOffset,
      includeTrashed,
    };
    
    if (workspaceId) {
      filters.push(`fact.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
    }
    
    const aql = `
      FOR fact IN facts
        FILTER ${filters.join(" && ")}
        SORT fact.updated_at DESC, fact.created_at DESC
        LIMIT @offset, @limit
        RETURN fact
    `;

    const cursor = await collections.facts.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async count(workspaceId?: string, includeTrashed: boolean = false): Promise<number> {
    const filters: string[] = [`(fact.trashed == false || @includeTrashed == true)`];
    const bindVars: any = {
      includeTrashed,
    };
    
    if (workspaceId) {
      filters.push(`fact.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
    }
    
    const aql = `
      LET count = LENGTH(
        FOR fact IN facts
          FILTER ${filters.join(" && ")}
          RETURN fact
      )
      RETURN count
    `;

    const cursor = await collections.facts.database.query(aql, bindVars);
    const result = await cursor.next();

    return result || 0;
  }

  static async findById(id: string): Promise<FactRecord | null> {
    const key = this.extractKey(id);
    try {
      const doc = await collections.facts.document(key);
      const record = this._normalizeRecord(doc);
      if (record.trashed || record.deleted_at) {
        return null;
      }
      return record;
    } catch (error: any) {
      if (error.errorNum === 1202) {
        // Document not found
        return null;
      }
      throw error;
    }
  }

  static async queryAQL(aql: string, bindVars?: any): Promise<any[]> {
    const cursor = await collections.facts.database.query(aql, bindVars || {});
    return await cursor.all();
  }

  // Helper methods
  static extractKey(id: string): string {
    // Handle both _key format and _id format
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): FactRecord {
    if (!doc) {
      throw new Error("Cannot normalize null or undefined fact document");
    }
    
    // Ensure content is always a string, even if stored as an object
    let content: string;
    if (typeof doc.content === "string") {
      content = doc.content;
    } else if (typeof doc.content === "object" && doc.content !== null) {
      // If content is an object, try to extract string content or stringify
      content = typeof doc.content.content === "string"
        ? doc.content.content
        : JSON.stringify(doc.content);
    } else {
      content = String(doc.content || "");
    }
    
    return {
      id: doc._id || `facts/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      content, // Always a string
      metadata: doc.metadata || {},
      workspace_id: doc.workspace_id,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      created_by: doc.created_by,
      last_updated_by: doc.last_updated_by,
      deleted_by: doc.deleted_by || null,
      deleted_at: doc.deleted_at || null,
      trashed: doc.trashed || false,
      embedding: doc.embedding,
      embedding_model: doc.embedding_model,
    };
  }
}
