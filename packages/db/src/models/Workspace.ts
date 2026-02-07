import { collections } from "../db";
import crypto from "crypto";

export interface WorkspaceRecord {
  _key?: string;
  _id?: string;
  id: string;
  name: string;
  slug: string; // URL-friendly workspace identifier
  description?: string;
  created_by: string; // User ID of the creator
  rest_api_key?: string;
  rest_api_key_created_by?: string;
  rest_api_key_created_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInput {
  name: string;
  description?: string;
  created_by: string; // User ID of the creator
}

export class Workspace {
  static async create(input: WorkspaceInput): Promise<WorkspaceRecord> {
    // Generate slug from name
    const slug = this._generateSlug(input.name);

    // Check if slug already exists
    const existing = await this.findBySlug(slug);
    if (existing) {
      // Append random suffix if slug exists
      const uniqueSlug = `${slug}-${Math.random().toString(36).substring(2, 8)}`;
      return this._createWithSlug(input, uniqueSlug);
    }

    return this._createWithSlug(input, slug);
  }

  private static async _createWithSlug(
    input: WorkspaceInput,
    slug: string,
  ): Promise<WorkspaceRecord> {
    const now = new Date().toISOString();
    const doc = {
      name: input.name,
      slug,
      description: input.description || null,
      created_by: input.created_by,
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await collections.workspaces.save(doc, { returnNew: true });
      return this._normalizeRecord(result.new!);
    } catch (error: any) {
      throw error;
    }
  }

  static async findById(id: string): Promise<WorkspaceRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.workspaces.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const aql = `
      FOR workspace IN workspaces
        FILTER workspace.slug == @slug
        LIMIT 1
        RETURN workspace
    `;

    const cursor = await collections.workspaces.database.query(aql, { slug });
    const results = await cursor.all();

    if (!results || results.length === 0) {
      return null;
    }

    return this._normalizeRecord(results[0]);
  }

  static async findByRestApiKey(apiKey: string): Promise<WorkspaceRecord | null> {
    const aql = `
      FOR workspace IN workspaces
        FILTER workspace.rest_api_key == @apiKey
        LIMIT 1
        RETURN workspace
    `;

    const cursor = await collections.workspaces.database.query(aql, { apiKey });
    const results = await cursor.all();

    if (!results || results.length === 0) {
      return null;
    }

    return this._normalizeRecord(results[0]);
  }

  static async list(
    limit: number = 50,
    offset: number = 0,
  ): Promise<WorkspaceRecord[]> {
    const aql = `
      FOR workspace IN workspaces
        SORT workspace.created_at DESC
        LIMIT @offset, @limit
        RETURN workspace
    `;

    const cursor = await collections.workspaces.database.query(aql, {
      limit,
      offset,
    });
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findByUserId(userId: string): Promise<WorkspaceRecord[]> {
    const aql = `
      FOR member IN workspace_members
        FILTER member.user_id == @userId
        LET workspace = DOCUMENT(member.workspace_id)
        RETURN workspace
    `;

    const cursor = await collections.workspace_members.database.query(aql, {
      userId,
    });
    const results = await cursor.all();

    if (!results) {
      return [];
    }

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async update(
    id: string,
    updates: Partial<
      Pick<
        WorkspaceRecord,
        | "name"
        | "description"
        | "rest_api_key"
        | "rest_api_key_created_by"
        | "rest_api_key_created_at"
      >
    >,
  ): Promise<WorkspaceRecord> {
    const key = this._extractKey(id);
    const updateDoc: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) {
      updateDoc.name = updates.name;
      // Regenerate slug if name changes
      updateDoc.slug = this._generateSlug(updates.name);
    }
    if (updates.description !== undefined) {
      updateDoc.description = updates.description;
    }
    if (updates.rest_api_key !== undefined) {
      updateDoc.rest_api_key = updates.rest_api_key;
    }
    if (updates.rest_api_key_created_by !== undefined) {
      updateDoc.rest_api_key_created_by = updates.rest_api_key_created_by;
    }
    if (updates.rest_api_key_created_at !== undefined) {
      updateDoc.rest_api_key_created_at = updates.rest_api_key_created_at;
    }

    const result = await collections.workspaces.update(key, updateDoc, {
      returnNew: true,
    });
    return this._normalizeRecord(result.new!);
  }

  static async delete(id: string): Promise<void> {
    const key = this._extractKey(id);
    try {
      await collections.workspaces.remove(key);
    } catch (error: any) {
      if (error.errorNum !== 1202) {
        throw error;
      }
    }
  }

  static async count(): Promise<number> {
    const aql = `
      LET count = LENGTH(FOR workspace IN workspaces RETURN workspace)
      RETURN count
    `;

    const cursor = await collections.workspaces.database.query(aql);
    const result = await cursor.next();

    return result || 0;
  }

  static async generateRestApiKey(
    id: string,
    createdBy: string,
  ): Promise<string> {
    const apiKey = `kpw_${crypto.randomBytes(32).toString("base64url")}`;
    await this.update(id, {
      rest_api_key: apiKey,
      rest_api_key_created_by: createdBy,
      rest_api_key_created_at: new Date().toISOString(),
    });
    return apiKey;
  }

  static async removeRestApiKey(id: string): Promise<void> {
    await this.update(id, {
      rest_api_key: undefined,
      rest_api_key_created_by: undefined,
      rest_api_key_created_at: undefined,
    });
  }

  // Helper methods
  static _extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-"); // Replace multiple hyphens with single hyphen
  }

  static _normalizeRecord(doc: any): WorkspaceRecord {
    return {
      id: doc._id || `workspaces/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      name: doc.name,
      slug: doc.slug,
      description: doc.description,
      created_by: doc.created_by,
      rest_api_key: doc.rest_api_key,
      rest_api_key_created_by: doc.rest_api_key_created_by,
      rest_api_key_created_at: doc.rest_api_key_created_at,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }
}

