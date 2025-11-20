import { collections, knowledgeGraph } from "../db";
import { Fact } from "./Fact";

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

  static async update(
    id: string,
    updates: { type?: string; metadata?: Record<string, any> },
  ): Promise<FactRelationRecord> {
    // Validate ID format - should be fact_relations/_key or just _key
    if (!id || id.trim() === "") {
      throw new Error("Relation ID is required");
    }

    // Check if ID looks like a fact ID (facts/...) instead of relation ID
    if (id.startsWith("facts/")) {
      throw new Error(
        `Invalid relation ID format: ${id}. Expected fact_relations/_key format, but got a fact ID.`,
      );
    }

    const key = this.extractKey(id);
    const updateDoc: any = {};
    if (updates.type !== undefined) {
      updateDoc.type = updates.type;
    }
    if (updates.metadata !== undefined) {
      updateDoc.metadata = updates.metadata;
    }

    try {
      const result = await collections.relations.update(key, updateDoc, {
        returnNew: true,
      });
      if (!result) {
        throw new Error(`FactRelation with id ${id} (key: ${key}) not found`);
      }
      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        throw new Error(`FactRelation with id ${id} (key: ${key}) not found`);
      }
      throw error;
    }
  }

  static async delete(id: string): Promise<void> {
    // Validate ID format - should be fact_relations/_key or just _key
    if (!id || id.trim() === "") {
      throw new Error("Relation ID is required");
    }

    // Check if ID looks like a fact ID (facts/...) instead of relation ID
    if (id.startsWith("facts/")) {
      throw new Error(
        `Invalid relation ID format: ${id}. Expected fact_relations/_key format, but got a fact ID.`,
      );
    }

    const key = this.extractKey(id);
    try {
      await collections.relations.remove(key);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        throw new Error(`FactRelation with id ${id} (key: ${key}) not found`);
      }
      throw error;
    }
  }

  static async query(
    params: FactRelationQueryParams,
  ): Promise<FactRelationRecord[]> {
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
    // Traverse using edge collection and explicitly fetch the fact document
    let aql = `
      FOR relation IN relations
        FILTER relation._from == @factId
        ${relationType ? "FILTER relation.type == @type" : ""}
        LET fact = DOCUMENT(relation._to)
        FILTER fact != null AND fact.content != null
        RETURN { relation: relation, fact: fact }
    `;

    const bindVars: any = { factId: factIdNormalized };
    if (relationType) {
      bindVars.type = relationType;
    }

    const cursor = await collections.relations.database.query(aql, bindVars);
    const results = await cursor.all();

    // Debug: log raw results to see what we're getting
    if (results.length > 0) {
      console.log("getRelatedFacts raw results:", results.length, results[0]);
    }

    const validResults = results
      .filter((r: any) => {
        // Validate that we have both relation and fact
        if (!r.fact || !r.relation) {
          console.warn("Missing fact or relation in getRelatedFacts:", {
            fact: !!r.fact,
            relation: !!r.relation,
          });
          return false;
        }

        // Check if fact is actually a relation document (has _from/_to but no content)
        const factId = r.fact._id || "";
        const hasContent = r.fact.content !== undefined;
        const hasFromTo =
          r.fact._from !== undefined || r.fact._to !== undefined;
        const hasType = r.fact.type !== undefined;

        // If it looks like a relation document (has _from/_to but no content), filter it out
        if (hasFromTo && !hasContent && hasType) {
          console.warn(
            "Filtering out relation document masquerading as fact in getRelatedFacts:",
            {
              factId,
              fact: r.fact,
              relationId: r.relation._id || r.relation._key,
            },
          );
          return false;
        }

        // Check for invalid relation IDs
        if (
          factId.startsWith("relations/") ||
          factId.startsWith("fact_relations/")
        ) {
          console.warn(
            "Filtering out document with relation ID format in getRelatedFacts:",
            {
              factId,
              fact: r.fact,
              relationId: r.relation._id || r.relation._key,
            },
          );
          return false;
        }

        // Allow all other documents (they should be facts from the graph traversal)
        return true;
      })
      .map((r: any) => {
        try {
          // Ensure fact has content before normalizing
          if (!r.fact.content && r.fact.content !== "") {
            console.warn("Fact missing content in getRelatedFacts:", {
              factId: r.fact._id || r.fact._key,
              fact: r.fact,
            });
          }
          const normalizedFact = Fact._normalizeRecord(r.fact);
          return {
            relation: this._normalizeRecord(r.relation),
            fact: normalizedFact,
          };
        } catch (error) {
          console.error(
            "Error normalizing fact in getRelatedFacts:",
            error,
            r.fact,
          );
          return null;
        }
      })
      .filter(
        (item): item is { relation: FactRelationRecord; fact: any } =>
          item !== null,
      );

    return validResults;
  }

  static async getIncomingRelations(
    factId: string,
    relationType?: string,
  ): Promise<{ relation: FactRelationRecord; fact: any }[]> {
    const factIdNormalized = this._normalizeFactId(factId);
    // Traverse using edge collection and explicitly fetch the fact document
    let aql = `
      FOR relation IN relations
        FILTER relation._to == @factId
        ${relationType ? "FILTER relation.type == @type" : ""}
        LET fact = DOCUMENT(relation._from)
        FILTER fact != null AND fact.content != null
        RETURN { relation: relation, fact: fact }
    `;

    const bindVars: any = { factId: factIdNormalized };
    if (relationType) {
      bindVars.type = relationType;
    }

    const cursor = await collections.relations.database.query(aql, bindVars);
    const results = await cursor.all();

    // Debug: log raw results to see what we're getting
    if (results.length > 0) {
      console.log(
        "getIncomingRelations raw results:",
        results.length,
        results[0],
      );
    }

    const validResults = results
      .filter((r: any) => {
        // Validate that we have both relation and fact
        if (!r.fact || !r.relation) {
          console.warn("Missing fact or relation in getIncomingRelations:", {
            fact: !!r.fact,
            relation: !!r.relation,
          });
          return false;
        }

        // Check if fact is actually a relation document (has _from/_to but no content)
        const factId = r.fact._id || "";
        const hasContent = r.fact.content !== undefined;
        const hasFromTo =
          r.fact._from !== undefined || r.fact._to !== undefined;
        const hasType = r.fact.type !== undefined;

        // If it looks like a relation document (has _from/_to but no content), filter it out
        if (hasFromTo && !hasContent && hasType) {
          console.warn(
            "Filtering out relation document masquerading as fact in getIncomingRelations:",
            {
              factId,
              fact: r.fact,
              relationId: r.relation._id || r.relation._key,
            },
          );
          return false;
        }

        // Check for invalid relation IDs
        if (
          factId.startsWith("relations/") ||
          factId.startsWith("fact_relations/")
        ) {
          console.warn(
            "Filtering out document with relation ID format in getIncomingRelations:",
            {
              factId,
              fact: r.fact,
              relationId: r.relation._id || r.relation._key,
            },
          );
          return false;
        }

        // Allow all other documents (they should be facts from the graph traversal)
        return true;
      })
      .map((r: any) => {
        try {
          // Ensure fact has content before normalizing
          if (!r.fact.content && r.fact.content !== "") {
            console.warn("Fact missing content in getIncomingRelations:", {
              factId: r.fact._id || r.fact._key,
              fact: r.fact,
            });
          }
          const normalizedFact = Fact._normalizeRecord(r.fact);
          return {
            relation: this._normalizeRecord(r.relation),
            fact: normalizedFact,
          };
        } catch (error) {
          console.error(
            "Error normalizing fact in getIncomingRelations:",
            error,
            r.fact,
          );
          return null;
        }
      })
      .filter(
        (item): item is { relation: FactRelationRecord; fact: any } =>
          item !== null,
      );

    return validResults;
  }

  static async count(): Promise<number> {
    const aql = `
      LET count = LENGTH(
        FOR relation IN relations
          RETURN relation
      )
      RETURN count
    `;

    const cursor = await collections.relations.database.query(aql);
    const result = await cursor.next();
    return result || 0;
  }

  static async queryAQL(aql: string, bindVars?: any): Promise<any[]> {
    const cursor = await collections.relations.database.query(
      aql,
      bindVars || {},
    );
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
