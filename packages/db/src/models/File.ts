import { collections } from "../db";

export interface FileInput {
  filename: string;
  original_filename: string;
  mime_type: string;
  size: number;
  storage_path: string; // Path where file is stored
  uploaded_by: string; // User ID
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
  uploaded_by: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  fact_ids: string[]; // Array of fact IDs extracted from this file
}

export interface FileUpdateInput {
  id: string;
  metadata?: Record<string, any>;
  fact_ids?: string[];
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
      uploaded_by: input.uploaded_by,
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

  static async findById(id: string): Promise<FileRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.files.document(key);
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
  ): Promise<FileRecord[]> {
    let aql = `FOR file IN files`;
    const bindVars: any = { limit, offset };

    aql += ` SORT file.created_at DESC LIMIT @offset, @limit RETURN file`;

    const cursor = await collections.files.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findByFactId(factId: string): Promise<FileRecord[]> {
    const aql = `
      FOR file IN files
        FILTER @factId IN file.fact_ids
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
      uploaded_by: doc.uploaded_by,
      metadata: doc.metadata || {},
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      fact_ids: doc.fact_ids || [],
    };
  }
}

