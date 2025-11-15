import { collections } from "../db.js";
import { triggerWebhook } from "../lib/webhook-trigger.js";

export interface FactInput {
  content: string;
  metadata?: Record<string, string>;
  created_by: string; // User ID
  last_updated_by: string; // User ID
  knowledge_context?: string;
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
  knowledge_context: string;
  trashed: boolean;
}

export interface FactSearchResult extends FactRecord {
  score: number;
}

export interface FactSearchParams {
  query: string;
  knowledge_context?: string;
  k?: number;
  offset?: number;
  include_trashed?: boolean;
}

export interface FactUpdateInput {
  id: string;
  content?: string;
  metadata?: Record<string, string>;
  last_updated_by: string; // User ID
  knowledge_context?: string;
}

export class Fact {
  static async write(input: FactInput): Promise<FactRecord> {
    const now = new Date().toISOString();
    const doc = {
      content: input.content,
      metadata: input.metadata || {},
      created_by: input.created_by,
      last_updated_by: input.last_updated_by,
      knowledge_context: input.knowledge_context || "",
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
      knowledge_context: input.knowledge_context || "",
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
    if (input.knowledge_context !== undefined) {
      updates.knowledge_context = input.knowledge_context;
    }

    const key = this._extractKey(input.id);
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
    const key = this._extractKey(id);
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
          FILTER (@knowledgeContext == null || fact.knowledge_context == @knowledgeContext)
          SORT fact.updated_at DESC, fact.created_at DESC
          LIMIT @offset, @limit
          RETURN { fact: fact, score: 1.0 }
      `;
      bindVars.knowledgeContext = params.knowledge_context || null;
    } else {
      aql = `
        FOR fact IN FULLTEXT(facts, "content", @query)
          FILTER (fact.trashed == false || @includeTrashed == true)
          FILTER (@knowledgeContext == null || fact.knowledge_context == @knowledgeContext)
          SORT fact.updated_at DESC, fact.created_at DESC
          LIMIT @offset, @limit
          RETURN { fact: fact, score: BM25(fact) }
      `;
      bindVars.query = params.query;
      bindVars.knowledgeContext = params.knowledge_context || null;
    }

    const cursor = await collections.facts.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => ({
      ...this._normalizeRecord(r.fact),
      score: r.score || 1.0,
    }));
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

  static async listKnowledgeContexts(
    includeTrashed: boolean = false,
  ): Promise<string[]> {
    const aql = `
      FOR fact IN facts
        FILTER (fact.trashed == false || @includeTrashed == true)
        FILTER fact.knowledge_context != null && fact.knowledge_context != ""
        COLLECT knowledge_context = fact.knowledge_context
        SORT knowledge_context
        RETURN knowledge_context
    `;

    const cursor = await collections.facts.database.query(aql, {
      includeTrashed,
    });
    const results = await cursor.all();

    return results;
  }

  static async findById(id: string): Promise<FactRecord | null> {
    const key = this._extractKey(id);
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
  static _extractKey(id: string): string {
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
      knowledge_context: doc.knowledge_context || "",
      trashed: doc.trashed || false,
    };
  }
}
