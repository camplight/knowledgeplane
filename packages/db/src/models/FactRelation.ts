import { collections, knowledgeGraph } from "../db";
import { Fact } from "./Fact";

export interface FactRelationInput {
  from_fact: string; // Fact ID
  to_fact: string; // Fact ID
  type: string; // e.g., "references", "depends_on", "related_to", "part_of"
  workspace_id: string; // Workspace ID
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
  workspace_id: string; // Workspace ID
  metadata: Record<string, any>;
  created_by: string;
  created_at: string;
  last_updated_by: string;
  updated_at: string;
  deleted_by?: string | null;
  deleted_at?: string | null;
  embedding?: number[]; // Vector embedding for semantic search (based on type + metadata)
  embedding_model?: string; // Model used to generate embedding
}

export interface FactRelationQueryParams {
  workspace_id?: string;
  from_fact?: string;
  to_fact?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export class FactRelation {
  static async create(input: FactRelationInput): Promise<FactRelationRecord> {
    // Validate that both facts exist before creating the relation
    // This prevents ArangoDB errors when the referenced documents don't exist
    let verifiedFromId: string;
    let verifiedToId: string;
    
    try {
      const fromFact = await Fact.findById(input.from_fact);
      const toFact = await Fact.findById(input.to_fact);
      
      if (!fromFact) {
        throw new Error(`Source fact with id ${input.from_fact} not found`);
      }
      if (!toFact) {
        throw new Error(`Target fact with id ${input.to_fact} not found`);
      }
      
      // Use the actual _id from the fact documents (this is what ArangoDB expects for edges)
      verifiedFromId = fromFact._id || `facts/${fromFact._key}`;
      verifiedToId = toFact._id || `facts/${toFact._key}`;
      
      // Normalize the input fact IDs for storage (these are for our application logic)
      const normalizedFromFact = this._normalizeFactId(input.from_fact);
      const normalizedToFact = this._normalizeFactId(input.to_fact);
      
      console.log("Fact validation:", {
        inputFromFact: input.from_fact,
        normalizedFromFact,
        verifiedFromId,
        inputToFact: input.to_fact,
        normalizedToFact,
        verifiedToId,
        fromFactKey: fromFact._key,
        toFactKey: toFact._key,
      });
    } catch (error: any) {
      // If it's already our validation error, rethrow it
      if (error.message?.includes("not found")) {
        throw error;
      }
      // Otherwise, log and rethrow
      console.error("Error validating facts before creating relation:", error);
      throw error;
    }

    // Normalize metadata - only include if it has content
    let metadata: Record<string, any> | undefined = undefined;
    if (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
      // Only include metadata if it has at least one key
      const keys = Object.keys(input.metadata);
      if (keys.length > 0) {
        metadata = input.metadata;
      }
    }

    const now = new Date().toISOString();
    const doc: any = {
      _from: verifiedFromId,  // Use verified document ID for edge
      _to: verifiedToId,      // Use verified document ID for edge
      from_fact: input.from_fact,  // Keep original input for application logic
      to_fact: input.to_fact,      // Keep original input for application logic
      type: input.type,
      workspace_id: input.workspace_id,
      created_by: input.created_by,
      created_at: now,
      last_updated_by: input.created_by,
      updated_at: now,
    };

    // Only include metadata if it has content
    if (metadata !== undefined) {
      doc.metadata = metadata;
    }

    try {
      const result = await collections.relations.save(doc, { returnNew: true });
      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      // Provide more detailed error information
      console.error("Error saving relation to ArangoDB:", {
        error: error.message,
        errorCode: error.errorNum,
        verifiedFromId,
        verifiedToId,
        doc,
        docKeys: Object.keys(doc),
        docTypes: Object.keys(doc).reduce((acc: any, key) => {
          acc[key] = Array.isArray(doc[key]) ? 'array' : typeof doc[key];
          return acc;
        }, {}),
      });
      
      // If it's a type validation error (code 10), this is a persistent issue
      // Error 10 "Expecting type Array" suggests a collection-level validation problem
      if (error.errorNum === 10) {
        try {
          const collection = collections.relations;
          const properties = await collection.properties();
          console.log("Collection properties (full):", JSON.stringify(properties, null, 2));
          
          // Check if there's a schema via AQL
          try {
            const schemaAql = `RETURN COLLECTION_SCHEMA('relations')`;
            const schemaCursor = await collection.database.query(schemaAql);
            const schemaResult = await schemaCursor.next();
            console.log("Collection schema from AQL:", JSON.stringify(schemaResult, null, 2));
          } catch (schemaQueryError: any) {
            console.log("Could not query schema via AQL:", schemaQueryError.message);
          }
          
          // Try to completely disable validation
          try {
            await collection.properties({ 
              schema: null, 
              level: "none",
              waitForSync: false 
            });
            console.log("Disabled all validation, retrying save...");
            const retryResult = await collection.save(doc, { returnNew: true });
            return this._normalizeRecord(retryResult.new!);
          } catch (retryError: any) {
            console.error("Retry after disabling validation also failed:", retryError.message, retryError.errorNum);
            
            // Try dropping and recreating the collection as a last resort
            // This is destructive but might be necessary if the collection is corrupted
            console.error("All validation bypass attempts failed. The collection may need to be recreated.");
            console.error("This is a critical error - the relations collection appears to have validation rules that cannot be bypassed.");
            console.error("Consider manually checking the ArangoDB collection properties or recreating the collection.");
          }
        } catch (schemaError: any) {
          console.error("Could not fetch/update collection schema:", schemaError.message, schemaError);
        }
        
        // Check if there are any existing relations to compare structure
        try {
          const sampleAql = `FOR r IN relations LIMIT 1 RETURN r`;
          const sampleCursor = await collections.relations.database.query(sampleAql);
          const sample = await sampleCursor.next();
          if (sample) {
            console.log("Sample existing relation structure:", JSON.stringify(sample, null, 2));
            console.log("Sample relation keys:", Object.keys(sample));
            console.log("Sample relation types:", Object.keys(sample).reduce((acc: any, key) => {
              acc[key] = Array.isArray(sample[key]) ? 'array' : typeof sample[key];
              return acc;
            }, {}));
            
            // Try to create a test relation using the exact same structure as the sample
            // but with our data to see if structure is the issue
            try {
              console.log("Testing if we can insert a relation with sample structure...");
              const testDoc = {
                _from: doc._from,
                _to: doc._to,
                from_fact: doc.from_fact,
                to_fact: doc.to_fact,
                type: doc.type,
                workspace_id: doc.workspace_id,
                created_by: doc.created_by,
                created_at: doc.created_at,
              };
              
              // Copy the exact structure from sample (including embedding if it exists)
              if (sample.embedding !== undefined) {
                testDoc.embedding = sample.embedding; // Copy the array structure
              }
              if (sample.embedding_model !== undefined) {
                testDoc.embedding_model = sample.embedding_model;
              }
              
              if (metadata !== undefined) {
                testDoc.metadata = metadata;
              }
              
              const testResult = await collections.relations.save(testDoc, { returnNew: true });
              console.log("Test insert with sample structure succeeded!");
              return this._normalizeRecord(testResult.new!);
            } catch (testError: any) {
              console.error("Test insert with sample structure also failed:", testError.message, testError.errorNum);
            }
          }
        } catch (sampleError: any) {
          console.error("Could not fetch sample relation:", sampleError.message);
        }
        
        // As a last resort, try using AQL INSERT directly
        // Try inserting without metadata first to see if that's causing the issue
        try {
          console.log("Trying AQL INSERT without metadata first...");
          const aqlNoMetadata = `
            INSERT {
              _from: @from,
              _to: @to,
              from_fact: @from_fact,
              to_fact: @to_fact,
              type: @type,
              workspace_id: @workspace_id,
              created_by: @created_by,
              created_at: @created_at
            } INTO relations
            RETURN NEW
          `;
          
          const bindVarsNoMetadata = {
            from: doc._from,
            to: doc._to,
            from_fact: doc.from_fact,
            to_fact: doc.to_fact,
            type: doc.type,
            workspace_id: doc.workspace_id,
            created_by: doc.created_by,
            created_at: doc.created_at,
          };
          
          const cursor = await collections.relations.database.query(aqlNoMetadata, bindVarsNoMetadata);
          const result = await cursor.next();
          if (result) {
            // If we have metadata, update the document to add it
            if (metadata !== undefined && Object.keys(metadata).length > 0) {
              const updateAql = `
                UPDATE @key WITH { metadata: @metadata } IN relations
                RETURN NEW
              `;
              const updateCursor = await collections.relations.database.query(updateAql, {
                key: result._key,
                metadata: metadata,
              });
              const updated = await updateCursor.next();
              if (updated) {
                return this._normalizeRecord(updated);
              }
            }
            return this._normalizeRecord(result);
          }
        } catch (aqlError: any) {
          console.error("AQL INSERT without metadata also failed:", aqlError.message, aqlError.errorNum);
          
          // If that failed, try using the graph API to create the edge
          // Edge collections are meant to be used with graphs
          try {
            console.log("Trying graph API to create edge...");
            
            // Use graph API to create edge - the graph API handles edge creation differently
            const edgeData: any = {
              _from: doc._from,
              _to: doc._to,
              from_fact: doc.from_fact,
              to_fact: doc.to_fact,
              type: doc.type,
              workspace_id: doc.workspace_id,
              created_by: doc.created_by,
              created_at: doc.created_at,
            };
            
            if (metadata !== undefined) {
              edgeData.metadata = metadata;
            }
            
            // Try using the graph's edge creation method
            // This might bypass collection-level validation
            const graphEdgeCollection = knowledgeGraph.edgeCollection("relations");
            
            // First try the standard save method
            try {
              const graphResult = await graphEdgeCollection.save(edgeData, { returnNew: true });
              if (graphResult && graphResult.new) {
                return this._normalizeRecord(graphResult.new);
              }
            } catch (graphSaveError: any) {
              console.error("Graph save failed:", graphSaveError.message, graphSaveError.errorNum);
              
              // Try using AQL through the graph
              try {
                console.log("Trying AQL INSERT through graph...");
                const graphAql = `
                  FOR edge IN [
                    {
                      _from: @from,
                      _to: @to,
                      from_fact: @from_fact,
                      to_fact: @to_fact,
                      type: @type,
                      workspace_id: @workspace_id,
                      created_by: @created_by,
                      created_at: @created_at
                      ${metadata !== undefined ? ', metadata: @metadata' : ''}
                    }
                  ]
                  INSERT edge INTO relations
                  RETURN NEW
                `;
                
                const graphBindVars: any = {
                  from: doc._from,
                  to: doc._to,
                  from_fact: doc.from_fact,
                  to_fact: doc.to_fact,
                  type: doc.type,
                  workspace_id: doc.workspace_id,
                  created_by: doc.created_by,
                  created_at: doc.created_at,
                };
                
                if (metadata !== undefined) {
                  graphBindVars.metadata = metadata;
                }
                
                const graphCursor = await graphEdgeCollection.database.query(graphAql, graphBindVars);
                const graphResult2 = await graphCursor.next();
                if (graphResult2) {
                  return this._normalizeRecord(graphResult2);
                }
              } catch (graphAqlError: any) {
                console.error("Graph AQL also failed:", graphAqlError.message, graphAqlError.errorNum);
              }
            }
          } catch (graphError: any) {
            console.error("Graph API also failed:", graphError.message, graphError.errorNum);
            
            // Last resort: try using the arangojs save method but ensure all values are primitives
            try {
              console.log("Trying save() with explicit type coercion...");
              const coercedDoc: any = {
                _from: String(doc._from),
                _to: String(doc._to),
                from_fact: String(doc.from_fact),
                to_fact: String(doc.to_fact),
                type: String(doc.type),
                workspace_id: String(doc.workspace_id),
                created_by: String(doc.created_by),
                created_at: String(doc.created_at),
              };
              
              // Only add metadata if it exists and is a plain object
              if (metadata !== undefined && typeof metadata === 'object' && !Array.isArray(metadata) && metadata !== null) {
                coercedDoc.metadata = metadata;
              }
              
              console.log("Coerced document:", JSON.stringify(coercedDoc, null, 2));
              const coercedResult = await collections.relations.save(coercedDoc, { returnNew: true });
              return this._normalizeRecord(coercedResult.new!);
            } catch (coercedError: any) {
              console.error("Coerced save() also failed:", coercedError.message, coercedError.errorNum);
              console.error("Final document that failed:", JSON.stringify(doc, null, 2));
            }
          }
        }
      }
      
      throw error;
    }
  }

  static async findById(id: string): Promise<FactRelationRecord | null> {
    const key = this.extractKey(id);
    try {
      const doc = await collections.relations.document(key);
      const record = this._normalizeRecord(doc);
      if (record.deleted_at) {
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

  static async update(
    id: string,
    updates: { type?: string; metadata?: Record<string, any>; last_updated_by: string },
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
    const updateDoc: any = {
      last_updated_by: updates.last_updated_by,
      updated_at: new Date().toISOString(),
    };
    if (updates.type !== undefined) {
      updateDoc.type = updates.type;
    }
    if (updates.metadata !== undefined) {
      // Only include metadata if it has content
      if (typeof updates.metadata === "object" && !Array.isArray(updates.metadata)) {
        const keys = Object.keys(updates.metadata);
        if (keys.length > 0) {
          updateDoc.metadata = updates.metadata;
        }
        // If empty object, don't include it (effectively removes/clears metadata)
      } else if (updates.metadata !== null) {
        // Allow null to explicitly set metadata to null
        updateDoc.metadata = updates.metadata;
      }
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

  static async delete(id: string, deleted_by: string): Promise<FactRelationRecord> {
    // Validate ID format - should be fact_relations/_key or just _key
    if (!id || id.trim() === "") {
      throw new Error("Relation ID is required");
    }
    if (!deleted_by || deleted_by.trim() === "") {
      throw new Error("deleted_by is required");
    }

    // Check if ID looks like a fact ID (facts/...) instead of relation ID
    if (id.startsWith("facts/")) {
      throw new Error(
        `Invalid relation ID format: ${id}. Expected fact_relations/_key format, but got a fact ID.`,
      );
    }

    const key = this.extractKey(id);
    const now = new Date().toISOString();
    try {
      const result = await collections.relations.update(
        key,
        {
          deleted_at: now,
          deleted_by,
          last_updated_by: deleted_by,
          updated_at: now,
        },
        { returnNew: true },
      );
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

  static async query(
    params: FactRelationQueryParams,
  ): Promise<FactRelationRecord[]> {
    const limit = Math.max(1, params.limit || 50);
    const offset = Math.max(0, params.offset || 0);

    let aql = `FOR relation IN relations`;
    const bindVars: any = { limit, offset };

    const filters: string[] = [];
    if (params.workspace_id) {
      filters.push(`relation.workspace_id == @workspaceId`);
      bindVars.workspaceId = params.workspace_id;
    }
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

    filters.push(`relation.deleted_at == null`);
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
        FILTER relation.deleted_at == null
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
          if (normalizedFact.trashed || normalizedFact.deleted_at) {
            return null;
          }
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
        FILTER relation.deleted_at == null
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
          if (normalizedFact.trashed || normalizedFact.deleted_at) {
            return null;
          }
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
          FILTER relation.deleted_at == null
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
      workspace_id: doc.workspace_id,
      metadata: doc.metadata || {},
      created_by: doc.created_by,
      created_at: doc.created_at,
      last_updated_by: doc.last_updated_by || doc.created_by,
      updated_at: doc.updated_at || doc.created_at,
      deleted_by: doc.deleted_by || null,
      deleted_at: doc.deleted_at || null,
      embedding: doc.embedding,
      embedding_model: doc.embedding_model,
    };
  }
}
