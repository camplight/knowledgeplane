import { collections } from "../db";
import { triggerWebhook } from "../lib/webhook-trigger";

export interface KnowledgeCardInput {
  title: string;
  summary: string;
  content: string; // Full consolidated content
  fact_ids: string[]; // Array of fact IDs that were consolidated
  created_by: string;
  last_updated_by: string;
  metadata?: Record<string, any>;
}

export interface KnowledgeCardRecord {
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
  embedding?: number[]; // Vector embedding for semantic search (based on title + summary + content)
  embedding_model?: string; // Model used to generate embedding
}

export interface KnowledgeCardUpdateInput {
  id: string;
  title?: string;
  summary?: string;
  content?: string;
  fact_ids?: string[];
  last_updated_by: string;
  metadata?: Record<string, any>;
}

export class KnowledgeCard {
  static async create(input: KnowledgeCardInput): Promise<KnowledgeCardRecord> {
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

    const result = await collections.knowledge_cards.save(doc, { returnNew: true });
    const record = this._normalizeRecord(result.new!);
    
    // Trigger webhook
    triggerWebhook("knowledge_card.created", record).catch((error) => {
      console.error("Failed to trigger knowledge_card.created webhook:", error);
    });
    
    return record;
  }

  static async update(input: KnowledgeCardUpdateInput): Promise<KnowledgeCardRecord> {
    const updates: any = {
      last_updated_by: input.last_updated_by,
      updated_at: new Date().toISOString(),
    };

    if (input.title !== undefined) updates.title = input.title;
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.content !== undefined) updates.content = input.content;
    if (input.fact_ids !== undefined) updates.fact_ids = input.fact_ids;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    const key = this.extractKey(input.id);
    const result = await collections.knowledge_cards.update(key, updates, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`KnowledgeCard with id ${input.id} not found`);
    }

    const record = this._normalizeRecord(result.new!);
    
    // Trigger webhook
    triggerWebhook("knowledge_card.updated", record).catch((error) => {
      console.error("Failed to trigger knowledge_card.updated webhook:", error);
    });
    
    return record;
  }

  static async delete(id: string): Promise<void> {
    if (!id || id.trim() === "") {
      throw new Error("KnowledgeCard ID is required");
    }

    const key = this.extractKey(id);
    try {
      // Get the card before deletion to trigger webhook
      const card = await this.findById(id);
      if (!card) {
        throw new Error(`KnowledgeCard with id ${id} not found`);
      }

      await collections.knowledge_cards.remove(key);
      
      // Trigger webhook
      triggerWebhook("knowledge_card.deleted", card).catch((error) => {
        console.error("Failed to trigger knowledge_card.deleted webhook:", error);
      });
    } catch (error: any) {
      if (error.errorNum === 1202) {
        throw new Error(`KnowledgeCard with id ${id} (key: ${key}) not found`);
      }
      throw error;
    }
  }

  static async findById(id: string): Promise<KnowledgeCardRecord | null> {
    const key = this.extractKey(id);
    try {
      const doc = await collections.knowledge_cards.document(key);
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
  ): Promise<KnowledgeCardRecord[]> {
    const aql = `
      FOR card IN knowledge_cards
        SORT card.updated_at DESC
        LIMIT @offset, @limit
        RETURN card
    `;
    const bindVars: any = { limit, offset };

    const cursor = await collections.knowledge_cards.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async count(): Promise<number> {
    const aql = `
      LET count = LENGTH(
        FOR card IN knowledge_cards
          RETURN card
      )
      RETURN count
    `;

    const cursor = await collections.knowledge_cards.database.query(aql);
    const result = await cursor.next();
    return result || 0;
  }

  static async queryAQL(aql: string, bindVars?: any): Promise<any[]> {
    const cursor = await collections.knowledge_cards.database.query(aql, bindVars || {});
    return await cursor.all();
  }

  // Helper methods
  static extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): KnowledgeCardRecord {
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
}

