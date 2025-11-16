import { collections } from "../db";
import { triggerWebhook } from "../lib/webhook-trigger";

export interface CardInput {
  title: string;
  summary: string;
  content: string; // Full consolidated content
  fact_ids: string[]; // Array of fact IDs that were consolidated
  created_by: string;
  last_updated_by: string;
  metadata?: Record<string, any>;
}

export interface CardRecord {
  _key?: string;
  _id?: string;
  id: string;
  title: string;
  summary: string;
  content: string;
  fact_ids: string[];
  created_by: string;
  last_updated_by: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  category_id?: string; // Reference to category
}

export interface CardUpdateInput {
  id: string;
  title?: string;
  summary?: string;
  content?: string;
  fact_ids?: string[];
  last_updated_by: string;
  metadata?: Record<string, any>;
  category_id?: string;
}

export class Card {
  static async create(input: CardInput): Promise<CardRecord> {
    const now = new Date().toISOString();
    const doc = {
      title: input.title,
      summary: input.summary,
      content: input.content,
      fact_ids: input.fact_ids,
      created_by: input.created_by,
      last_updated_by: input.last_updated_by,
      metadata: input.metadata || {},
      created_at: now,
      updated_at: now,
    };

    const result = await collections.cards.save(doc, { returnNew: true });
    const record = this._normalizeRecord(result.new!);
    
    // Trigger webhook
    triggerWebhook("card.created", record).catch((error) => {
      console.error("Failed to trigger card.created webhook:", error);
    });
    
    return record;
  }

  static async update(input: CardUpdateInput): Promise<CardRecord> {
    const updates: any = {
      last_updated_by: input.last_updated_by,
      updated_at: new Date().toISOString(),
    };

    if (input.title !== undefined) updates.title = input.title;
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.content !== undefined) updates.content = input.content;
    if (input.fact_ids !== undefined) updates.fact_ids = input.fact_ids;
    if (input.metadata !== undefined) updates.metadata = input.metadata;
    if (input.category_id !== undefined) updates.category_id = input.category_id;

    const key = this._extractKey(input.id);
    const result = await collections.cards.update(key, updates, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`Card with id ${input.id} not found`);
    }

    const record = this._normalizeRecord(result.new!);
    
    // Trigger webhook
    triggerWebhook("card.updated", record).catch((error) => {
      console.error("Failed to trigger card.updated webhook:", error);
    });
    
    return record;
  }

  static async findById(id: string): Promise<CardRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.cards.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async list(
    limit: number = 50,
    offset: number = 0,
    category_id?: string,
  ): Promise<CardRecord[]> {
    let aql = `FOR card IN cards`;
    const bindVars: any = { limit, offset };
    const filters: string[] = [];

    if (category_id) {
      filters.push(`card.category_id == @categoryId`);
      bindVars.categoryId = category_id;
    }

    if (filters.length > 0) {
      aql += ` FILTER ${filters.join(" && ")}`;
    }

    aql += ` SORT card.updated_at DESC LIMIT @offset, @limit RETURN card`;

    const cursor = await collections.cards.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async queryAQL(aql: string, bindVars?: any): Promise<any[]> {
    const cursor = await collections.cards.database.query(aql, bindVars || {});
    return await cursor.all();
  }

  // Helper methods
  static _extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): CardRecord {
    return {
      id: doc._id || `cards/${doc._key}`,
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
      category_id: doc.category_id,
    };
  }
}

