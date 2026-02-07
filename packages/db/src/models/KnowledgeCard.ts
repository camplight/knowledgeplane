import { collections } from "../db";
import { triggerWebhook } from "../lib/webhook-trigger";

export interface KnowledgeCardInput {
  title: string;
  summary: string;
  content: string; // Full consolidated content
  fact_ids: string[]; // Array of fact IDs that were consolidated
  workspace_id: string; // Workspace ID
  created_by: string;
  last_updated_by: string;
  created_by_worker?: string;
  last_updated_by_worker?: string;
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
  workspace_id: string; // Workspace ID
  created_by: string;
  last_updated_by: string;
  created_by_worker?: string | null;
  last_updated_by_worker?: string | null;
  deleted_by?: string | null;
  deleted_by_worker?: string | null;
  deleted_at?: string | null;
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
  last_updated_by_worker?: string;
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
      workspace_id: input.workspace_id,
      created_by: input.created_by,
      last_updated_by: input.last_updated_by,
      created_by_worker: input.created_by_worker,
      last_updated_by_worker: input.last_updated_by_worker,
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
    if (input.last_updated_by_worker !== undefined) {
      updates.last_updated_by_worker = input.last_updated_by_worker;
    }

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

  static async delete(
    id: string,
    deleted_by: string,
    deleted_by_worker?: string,
  ): Promise<KnowledgeCardRecord> {
    if (!id || id.trim() === "") {
      throw new Error("KnowledgeCard ID is required");
    }
    if (!deleted_by || deleted_by.trim() === "") {
      throw new Error("deleted_by is required");
    }

    const key = this.extractKey(id);
    try {
      // Get the card before deletion to trigger webhook
      const card = await this.findById(id, true);
      if (!card) {
        throw new Error(`KnowledgeCard with id ${id} not found`);
      }

      const now = new Date().toISOString();
      const result = await collections.knowledge_cards.update(
        key,
        {
          deleted_at: now,
          deleted_by,
          deleted_by_worker,
          last_updated_by: deleted_by,
          last_updated_by_worker: deleted_by_worker,
          updated_at: now,
        },
        { returnNew: true },
      );
      const updated = result?.new ? this._normalizeRecord(result.new) : card;
      
      // Trigger webhook
      triggerWebhook("knowledge_card.deleted", updated).catch((error) => {
        console.error("Failed to trigger knowledge_card.deleted webhook:", error);
      });
      return updated;
    } catch (error: any) {
      if (error.errorNum === 1202) {
        throw new Error(`KnowledgeCard with id ${id} (key: ${key}) not found`);
      }
      throw error;
    }
  }

  static async findById(
    id: string,
    includeDeleted: boolean = false,
  ): Promise<KnowledgeCardRecord | null> {
    const key = this.extractKey(id);
    try {
      const doc = await collections.knowledge_cards.document(key);
      const record = this._normalizeRecord(doc);
      if (!includeDeleted && record.deleted_at) {
        return null;
      }
      return record;
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async list(
    workspaceId?: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<KnowledgeCardRecord[]> {
    // Ensure limit and offset are valid numbers
    const validLimit = Math.max(1, limit || 50);
    const validOffset = Math.max(0, offset || 0);
    
    const filters: string[] = [];
    const bindVars: any = { limit: validLimit, offset: validOffset };
    
    if (workspaceId) {
      filters.push(`card.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
    }
    filters.push(`card.deleted_at == null`);
    
    const filterClause = filters.length > 0 ? `FILTER ${filters.join(" && ")}` : "";
    const aql = `
      FOR card IN knowledge_cards
        ${filterClause}
        SORT card.updated_at DESC
        LIMIT @offset, @limit
        RETURN card
    `;

    const cursor = await collections.knowledge_cards.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async count(workspaceId?: string): Promise<number> {
    const filters: string[] = [];
    const bindVars: any = {};
    
    if (workspaceId) {
      filters.push(`card.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
    }
    filters.push(`card.deleted_at == null`);
    
    const filterClause = filters.length > 0 ? `FILTER ${filters.join(" && ")}` : "";
    const aql = `
      LET count = LENGTH(
        FOR card IN knowledge_cards
          ${filterClause}
          RETURN card
      )
      RETURN count
    `;

    const cursor = await collections.knowledge_cards.database.query(aql, bindVars);
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
      workspace_id: doc.workspace_id,
      created_by: doc.created_by,
      last_updated_by: doc.last_updated_by,
      created_by_worker: doc.created_by_worker || null,
      last_updated_by_worker: doc.last_updated_by_worker || null,
      deleted_by: doc.deleted_by || null,
      deleted_by_worker: doc.deleted_by_worker || null,
      deleted_at: doc.deleted_at || null,
      metadata: doc.metadata || {},
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      embedding: doc.embedding,
      embedding_model: doc.embedding_model,
    };
  }
}

