import { collections } from "../db";

export interface FileInput {
  filename: string;
  original_filename: string;
  mime_type: string;
  size: number;
  storage_path: string; // Path where file is stored
  workspace_id: string; // Workspace ID
  uploaded_by: string; // User ID
  created_by: string; // User ID
  last_updated_by: string; // User ID
  metadata?: Record<string, any>;
}

export interface FileRecord {
  _key?: string;
  _id?: string;
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size: number;
  storage_path: string;
  workspace_id: string; // Workspace ID
  uploaded_by: string;
  created_by: string;
  last_updated_by: string;
  deleted_by?: string | null;
  deleted_at?: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  fact_ids: string[]; // Array of fact IDs extracted from this file
}

export interface FileUpdateInput {
  id: string;
  metadata?: Record<string, any>;
  fact_ids?: string[];
  last_updated_by: string;
}

export class File {
  static async create(input: FileInput): Promise<FileRecord> {
    const now = new Date().toISOString();
    const doc = {
      filename: input.filename,
      original_filename: input.original_filename,
      mime_type: input.mime_type,
      size: input.size,
      storage_path: input.storage_path,
      workspace_id: input.workspace_id,
      uploaded_by: input.uploaded_by,
      created_by: input.created_by,
      last_updated_by: input.last_updated_by,
      metadata: input.metadata || {},
      fact_ids: [],
      created_at: now,
      updated_at: now,
    };

    const result = await collections.files.save(doc, { returnNew: true });
    return this._normalizeRecord(result.new!);
  }

  static async update(input: FileUpdateInput): Promise<FileRecord> {
    const updates: any = {
      updated_at: new Date().toISOString(),
      last_updated_by: input.last_updated_by,
    };

    if (input.metadata !== undefined) updates.metadata = input.metadata;
    if (input.fact_ids !== undefined) updates.fact_ids = input.fact_ids;

    const key = this._extractKey(input.id);
    const result = await collections.files.update(key, updates, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`File with id ${input.id} not found`);
    }

    return this._normalizeRecord(result.new!);
  }

  static async delete(id: string, deleted_by: string): Promise<FileRecord> {
    if (!id || id.trim() === "") {
      throw new Error("File ID is required");
    }
    if (!deleted_by || deleted_by.trim() === "") {
      throw new Error("deleted_by is required");
    }

    const key = this._extractKey(id);
    const now = new Date().toISOString();
    try {
      const result = await collections.files.update(
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
        throw new Error(`File with id ${id} not found`);
      }

      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        throw new Error(`File with id ${id} not found`);
      }
      throw error;
    }
  }

  static async findById(id: string): Promise<FileRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.files.document(key);
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

  static async list(
    workspaceId?: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<FileRecord[]> {
    const filters: string[] = [];
    const bindVars: any = { limit, offset };
    
    if (workspaceId) {
      filters.push(`file.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
    }
    
    filters.push(`file.deleted_at == null`);
    const filterClause = filters.length > 0 ? `FILTER ${filters.join(" && ")}` : "";
    const aql = `FOR file IN files ${filterClause} SORT file.created_at DESC LIMIT @offset, @limit RETURN file`;

    const cursor = await collections.files.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findByFactId(factId: string): Promise<FileRecord[]> {
    const aql = `
      FOR file IN files
        FILTER @factId IN file.fact_ids
        FILTER file.deleted_at == null
        RETURN file
    `;

    const cursor = await collections.files.database.query(aql, { factId });
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  // Helper methods
  static _extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): FileRecord {
    return {
      id: doc._id || `files/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      filename: doc.filename,
      original_filename: doc.original_filename,
      mime_type: doc.mime_type,
      size: doc.size,
      storage_path: doc.storage_path,
      workspace_id: doc.workspace_id,
      uploaded_by: doc.uploaded_by,
      created_by: doc.created_by,
      last_updated_by: doc.last_updated_by,
      deleted_by: doc.deleted_by || null,
      deleted_at: doc.deleted_at || null,
      metadata: doc.metadata || {},
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      fact_ids: doc.fact_ids || [],
    };
  }
}

