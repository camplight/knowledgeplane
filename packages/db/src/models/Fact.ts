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
    
    const doc = {
      content,
      metadata: input.metadata || {},
      workspace_id: input.workspace_id,
      created_by: input.created_by,
      last_updated_by: input.last_updated_by,
      trashed: false,
      created_at: now,
      updated_at: now,
    };

    const result = await collections.facts.save(doc, { returnNew: true });
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

  static async trash(id: string, last_updated_by: string): Promise<FactRecord> {
    const key = this.extractKey(id);
    const result = await collections.facts.update(
      key,
      {
        trashed: true,
        last_updated_by,
        updated_at: new Date().toISOString(),
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

    let aql: string;
    const bindVars: any = {
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
    const filterClause = filters.length > 0 ? `FILTER ${filters.join(" && ")}` : "";

    if (isWildcard) {
      aql = `
        FOR fact IN facts
          ${filterClause}
          SORT fact.updated_at DESC, fact.created_at DESC
          LIMIT @offset, @limit
          RETURN { fact: fact, score: 1.0 }
      `;
    } else {
      // Try to use FULLTEXT index first
      // Note: BM25() only works with ArangoSearch views, not FULLTEXT()
      // FULLTEXT() already orders results by relevance, so we use score 1.0
      aql = `
        FOR fact IN FULLTEXT(facts, "content", @query)
          ${filterClause}
          SORT fact.updated_at DESC, fact.created_at DESC
          LIMIT @offset, @limit
          RETURN { fact: fact, score: 1.0 }
      `;
      bindVars.query = params.query;
    }

    try {
      const cursor = await collections.facts.database.query(aql, bindVars);
      const results = await cursor.all();

      return results.map((r: any) => ({
        ...this._normalizeRecord(r.fact),
        score: r.score || 1.0,
      }));
    } catch (error: any) {
      // If fulltext index doesn't exist, fall back to LIKE search
      if (
        error.errorNum === 1571 ||
        error.message?.includes("fulltext index")
      ) {
        console.warn("Fulltext index not found, falling back to LIKE search");

        // Fallback to LIKE search (case-insensitive)
        const fallbackFilters: string[] = [];
        if (params.workspace_id) {
          fallbackFilters.push(`fact.workspace_id == @workspaceId`);
        }
        fallbackFilters.push(`(fact.trashed == false || @includeTrashed == true)`);
        fallbackFilters.push(`LOWER(fact.content) LIKE LOWER(CONCAT("%", @query, "%"))`);
        const fallbackFilterClause = fallbackFilters.length > 0 ? `FILTER ${fallbackFilters.join(" && ")}` : "";
        
        const fallbackAql = `
          FOR fact IN facts
            ${fallbackFilterClause}
            SORT fact.updated_at DESC, fact.created_at DESC
            LIMIT @offset, @limit
            RETURN { fact: fact, score: 1.0 }
        `;

        const fallbackCursor = await collections.facts.database.query(
          fallbackAql,
          bindVars,
        );
        const fallbackResults = await fallbackCursor.all();

        return fallbackResults.map((r: any) => ({
          ...this._normalizeRecord(r.fact),
          score: r.score || 1.0,
        }));
      }

      // Re-throw other errors
      throw error;
    }
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
      // Generate embedding for the query
      const queryEmbedding = await generateQueryEmbedding(
        params.query,
        provider,
      );

      // Get all facts with embeddings and calculate cosine similarity manually
      // This approach works with any ArangoDB version and doesn't require APPROX_NEAR_COSINE
      const filters: string[] = [`fact.embedding != null`, `(fact.trashed == false || @includeTrashed == true)`];
      const bindVars: any = {
        includeTrashed,
      };
      
      if (params.workspace_id) {
        filters.push(`fact.workspace_id == @workspaceId`);
        bindVars.workspaceId = params.workspace_id;
      }
      
      const aql = `
        FOR fact IN facts
          FILTER ${filters.join(" && ")}
          RETURN fact
      `;

      const cursor = await collections.facts.database.query(aql, bindVars);
      const allFacts = await cursor.all();

      // Calculate cosine similarity for each fact and sort by score
      const resultsWithScores = allFacts
        .map((fact: any) => {
          try {
            const score = cosineSimilarity(fact.embedding, queryEmbedding);
            return {
              fact: this._normalizeRecord(fact),
              score,
            };
          } catch (error: any) {
            // Skip facts with invalid embeddings
            console.warn(
              `Skipping fact ${fact._id} due to embedding error:`,
              error.message,
            );
            return null;
          }
        })
        .filter((r: any) => r !== null)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(offset, offset + limit);

      return resultsWithScores.map((r: any) => ({
        ...r.fact,
        score: r.score || 0,
      }));
    } catch (error: any) {
      console.error("Vector search error:", error.message);
      // Fall back to full-text search on error
      return this._fullTextSearch(params);
    }
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
        { fact: FactRecord; scores: number[] }
      >();

      // Add full-text results (use score as-is since FULLTEXT doesn't provide BM25 scores)
      for (const result of fullTextResults) {
        resultMap.set(result.id, {
          fact: result,
          scores: [result.score],
        });
      }

      // Add vector results (already normalized 0-1)
      for (const result of vectorResults) {
        const existing = resultMap.get(result.id);
        if (existing) {
          existing.scores.push(result.score);
        } else {
          resultMap.set(result.id, {
            fact: result,
            scores: [result.score],
          });
        }
      }

      // Combine scores: average of both scores, weighted equally
      const combinedResults: FactSearchResult[] = Array.from(
        resultMap.values(),
      ).map((item) => {
        const avgScore =
          item.scores.reduce((sum, s) => sum + s, 0) / item.scores.length;
        return {
          ...item.fact,
          score: avgScore,
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
      return this._normalizeRecord(doc);
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
      trashed: doc.trashed || false,
      embedding: doc.embedding,
      embedding_model: doc.embedding_model,
    };
  }
}
