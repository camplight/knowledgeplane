import { collections, knowledgeGraph } from "../db";

export interface FactRelationInput {
  from_fact: string; // Fact ID
  to_fact: string; // Fact ID
  type: string; // e.g., "references", "depends_on", "related_to", "part_of"
  metadata?: Record<string, any>;
  created_by: string; // User ID
}

export interface FactRelationRecord {
  _key?: string;
  _id?: string;
  id: string;
  _from: string; // Fact document ID
  _to: string; // Fact document ID
  from_fact: string; // Fact ID (normalized)
  to_fact: string; // Fact ID (normalized)
  type: string;
  metadata: Record<string, any>;
  created_by: string;
  created_at: string;
  embedding?: number[]; // Vector embedding for semantic search (based on type + metadata)
  embedding_model?: string; // Model used to generate embedding
}

export interface FactRelationQueryParams {
  from_fact?: string;
  to_fact?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export class FactRelation {
  static async create(input: FactRelationInput): Promise<FactRelationRecord> {
    // Ensure fact IDs are in the correct format
    const fromId = this._normalizeFactId(input.from_fact);
    const toId = this._normalizeFactId(input.to_fact);

    const doc = {
      _from: fromId,
      _to: toId,
      from_fact: input.from_fact,
      to_fact: input.to_fact,
      type: input.type,
      metadata: input.metadata || {},
      created_by: input.created_by,
      created_at: new Date().toISOString(),
    };

    const result = await collections.relations.save(doc, { returnNew: true });
    return this._normalizeRecord(result.new!);
  }

  static async findById(id: string): Promise<FactRelationRecord | null> {
    const key = this.extractKey(id);
    try {
      const doc = await collections.relations.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async query(params: FactRelationQueryParams): Promise<FactRelationRecord[]> {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    let aql = `FOR relation IN relations`;
    const bindVars: any = { limit, offset };

    const filters: string[] = [];
    if (params.from_fact) {
      filters.push(`relation.from_fact == @fromFact`);
      bindVars.fromFact = params.from_fact;
    }
    if (params.to_fact) {
      filters.push(`relation.to_fact == @toFact`);
      bindVars.toFact = params.to_fact;
    }
    if (params.type) {
      filters.push(`relation.type == @type`);
      bindVars.type = params.type;
    }

    if (filters.length > 0) {
      aql += ` FILTER ${filters.join(" && ")}`;
    }

    aql += ` SORT relation.created_at DESC LIMIT @offset, @limit RETURN relation`;

    const cursor = await collections.relations.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async getRelatedFacts(
    factId: string,
    relationType?: string,
  ): Promise<{ relation: FactRelationRecord; fact: any }[]> {
    const factIdNormalized = this._normalizeFactId(factId);
    let aql = `
      FOR relation, fact IN 1..1 OUTBOUND @factId relations
        ${relationType ? "FILTER relation.type == @type" : ""}
        RETURN { relation: relation, fact: fact }
    `;

    const bindVars: any = { factId: factIdNormalized };
    if (relationType) {
      bindVars.type = relationType;
    }

    const cursor = await collections.relations.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => ({
      relation: this._normalizeRecord(r.relation),
      fact: r.fact,
    }));
  }

  static async getIncomingRelations(
    factId: string,
    relationType?: string,
  ): Promise<{ relation: FactRelationRecord; fact: any }[]> {
    const factIdNormalized = this._normalizeFactId(factId);
    let aql = `
      FOR relation, fact IN 1..1 INBOUND @factId relations
        ${relationType ? "FILTER relation.type == @type" : ""}
        RETURN { relation: relation, fact: fact }
    `;

    const bindVars: any = { factId: factIdNormalized };
    if (relationType) {
      bindVars.type = relationType;
    }

    const cursor = await collections.relations.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => ({
      relation: this._normalizeRecord(r.relation),
      fact: r.fact,
    }));
  }

  static async queryAQL(aql: string, bindVars?: any): Promise<any[]> {
    const cursor = await collections.relations.database.query(aql, bindVars || {});
    return await cursor.all();
  }

  // Helper methods
  static extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeFactId(factId: string): string {
    // Ensure fact ID is in format "facts/_key"
    if (factId.startsWith("facts/")) {
      return factId;
    }
    return `facts/${factId}`;
  }

  static _normalizeRecord(doc: any): FactRelationRecord {
    return {
      id: doc._id || `fact_relations/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      _from: doc._from,
      _to: doc._to,
      from_fact: doc.from_fact,
      to_fact: doc.to_fact,
      type: doc.type,
      metadata: doc.metadata || {},
      created_by: doc.created_by,
      created_at: doc.created_at,
      embedding: doc.embedding,
      embedding_model: doc.embedding_model,
    };
  }
}

