import { collections } from "../db";
import { triggerWebhook } from "../lib/webhook-trigger";
import { generateQueryEmbedding } from "../lib/vector-search";
import type { AIModelProvider } from "@knowledgeplane/aimodel";

export interface FactInput {
  content: string;
  metadata?: Record<string, string>;
  created_by: string; // User ID
  last_updated_by: string; // User ID
}

export interface FactRecord {
  _key?: string;
  _id?: string;
  id: string;
  content: string;
  metadata: Record<string, string>;
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
    const doc = {
      content: input.content,
      metadata: input.metadata || {},
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
    const docs = inputs.map((input) => ({
      content: input.content,
      metadata: input.metadata || {},
      created_by: input.created_by,
      last_updated_by: input.last_updated_by,
      trashed: false,
      created_at: now,
      updated_at: now,
    }));

    const result = await collections.facts.saveAll(docs, {
      returnNew: true,
    });
    const records = (result as any).saved?.map((doc: any) => this._normalizeRecord(doc.new)) || [];
    
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
      updates.content = input.content;
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

  private static async _fullTextSearch(params: FactSearchParams): Promise<FactSearchResult[]> {
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

    if (isWildcard) {
      aql = `
        FOR fact IN facts
          FILTER (fact.trashed == false || @includeTrashed == true)
          SORT fact.updated_at DESC, fact.created_at DESC
          LIMIT @offset, @limit
          RETURN { fact: fact, score: 1.0 }
      `;
    } else {
      aql = `
        FOR fact IN FULLTEXT(facts, "content", @query)
          FILTER (fact.trashed == false || @includeTrashed == true)
          SORT fact.updated_at DESC, fact.created_at DESC
          LIMIT @offset, @limit
          RETURN { fact: fact, score: BM25(fact) }
      `;
      bindVars.query = params.query;
    }

    const cursor = await collections.facts.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => ({
      ...this._normalizeRecord(r.fact),
      score: r.score || 1.0,
    }));
  }

  private static async _vectorSearch(params: FactSearchParams): Promise<FactSearchResult[]> {
    const limit = params.k || 5;
    const offset = params.offset || 0;
    const includeTrashed = params.include_trashed || false;
    const provider = params.embeddingProvider;

    if (!provider) {
      console.warn("Vector search requires embedding provider. Falling back to full-text search.");
      return this._fullTextSearch(params);
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await generateQueryEmbedding(params.query, provider);
      
      // Use ArangoDB's APPROX_NEAR_COSINE for vector search
      const aql = `
        FOR fact IN facts
          FILTER fact.embedding != null
          FILTER (fact.trashed == false || @includeTrashed == true)
          LET score = APPROX_NEAR_COSINE(fact.embedding, @queryEmbedding)
          SORT score DESC
          LIMIT @offset, @limit
          RETURN { fact: fact, score: score }
      `;

      const bindVars: any = {
        queryEmbedding,
        limit,
        offset,
        includeTrashed,
      };

      const cursor = await collections.facts.database.query(aql, bindVars);
      const results = await cursor.all();

      return results.map((r: any) => ({
        ...this._normalizeRecord(r.fact),
        score: r.score || 0,
      }));
    } catch (error: any) {
      console.error("Vector search error:", error.message);
      // Fall back to full-text search on error
      return this._fullTextSearch(params);
    }
  }

  private static async _hybridSearch(params: FactSearchParams): Promise<FactSearchResult[]> {
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
      const resultMap = new Map<string, { fact: FactRecord; scores: number[] }>();

      // Add full-text results (normalize score to 0-1 range)
      for (const result of fullTextResults) {
        const normalizedScore = Math.min(result.score / 10, 1); // Normalize BM25 score
        resultMap.set(result.id, {
          fact: result,
          scores: [normalizedScore],
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
      const combinedResults: FactSearchResult[] = Array.from(resultMap.values()).map((item) => {
        const avgScore = item.scores.reduce((sum, s) => sum + s, 0) / item.scores.length;
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
    limit: number = 50,
    offset: number = 0,
    includeTrashed: boolean = false,
  ): Promise<FactRecord[]> {
    const aql = `
      FOR fact IN facts
        FILTER (fact.trashed == false || @includeTrashed == true)
        SORT fact.updated_at DESC, fact.created_at DESC
        LIMIT @offset, @limit
        RETURN fact
    `;

    const cursor = await collections.facts.database.query(aql, {
      limit,
      offset,
      includeTrashed,
    });
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async count(includeTrashed: boolean = false): Promise<number> {
    const aql = `
      LET count = LENGTH(
        FOR fact IN facts
          FILTER (fact.trashed == false || @includeTrashed == true)
          RETURN fact
      )
      RETURN count
    `;

    const cursor = await collections.facts.database.query(aql, {
      includeTrashed,
    });
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
    return {
      id: doc._id || `facts/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      content: doc.content,
      metadata: doc.metadata || {},
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
