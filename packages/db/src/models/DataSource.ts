import { collections } from "../db";

export interface DataSourceInput {
  name: string;
  workspace_id: string;
  description?: string;
  schedule: string; // Cron expression or interval (e.g., "0 */6 * * *" or "every 6 hours")
  definition_file_id: string; // Reference to File record containing .md or .zip
  enabled: boolean;
  created_by: string;
  last_run_at?: string;
  next_run_at?: string;
  metadata?: Record<string, any>;
  secrets?: Record<string, string>; // Key-value pairs for secrets
}

export interface DataSourceRecord {
  _key?: string;
  _id?: string;
  id: string;
  name: string;
  workspace_id: string;
  description?: string;
  schedule: string;
  definition_file_id: string;
  enabled: boolean;
  created_by: string;
  last_run_at?: string;
  next_run_at?: string;
  metadata: Record<string, any>;
  secrets: Record<string, string>; // Key-value pairs for secrets
  created_at: string;
  updated_at: string;
}

export interface DataSourceUpdateInput {
  name?: string;
  description?: string;
  schedule?: string;
  definition_file_id?: string;
  enabled?: boolean;
  last_run_at?: string;
  next_run_at?: string;
  metadata?: Record<string, any>;
  secrets?: Record<string, string>; // Key-value pairs for secrets
}

export class DataSource {
  static async create(input: DataSourceInput): Promise<DataSourceRecord> {
    const now = new Date().toISOString();
    const doc = {
      name: input.name,
      workspace_id: input.workspace_id,
      description: input.description || null,
      schedule: input.schedule,
      definition_file_id: input.definition_file_id,
      enabled: input.enabled !== undefined ? input.enabled : true,
      created_by: input.created_by,
      last_run_at: input.last_run_at || null,
      next_run_at: input.next_run_at || null,
      metadata: input.metadata || {},
      secrets: input.secrets || {},
      created_at: now,
      updated_at: now,
    };

    const result = await collections.data_sources.save(doc, { returnNew: true });
    return this._normalizeRecord(result.new!);
  }

  static async update(
    id: string,
    input: DataSourceUpdateInput,
  ): Promise<DataSourceRecord> {
    const key = this._extractKey(id);
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.schedule !== undefined) updates.schedule = input.schedule;
    if (input.definition_file_id !== undefined)
      updates.definition_file_id = input.definition_file_id;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.last_run_at !== undefined) updates.last_run_at = input.last_run_at;
    if (input.next_run_at !== undefined) updates.next_run_at = input.next_run_at;
    if (input.metadata !== undefined) updates.metadata = input.metadata;
    if (input.secrets !== undefined) updates.secrets = input.secrets;

    const result = await collections.data_sources.update(key, updates, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`DataSource with id ${id} not found`);
    }

    return this._normalizeRecord(result.new!);
  }

  static async findById(id: string): Promise<DataSourceRecord | null> {
    const key = this._extractKey(id);
    try {
      const doc = await collections.data_sources.document(key);
      return this._normalizeRecord(doc);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        return null;
      }
      throw error;
    }
  }

  static async list(
    workspaceId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<DataSourceRecord[]> {
    const aql = `
      FOR ds IN data_sources
        FILTER ds.workspace_id == @workspaceId
        SORT ds.created_at DESC
        LIMIT @offset, @limit
        RETURN ds
    `;

    const cursor = await collections.data_sources.database.query(aql, {
      workspaceId,
      limit,
      offset,
    });
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findByWorkspace(
    workspaceId: string,
  ): Promise<DataSourceRecord[]> {
    const aql = `
      FOR ds IN data_sources
        FILTER ds.workspace_id == @workspaceId
        SORT ds.created_at DESC
        RETURN ds
    `;

    const cursor = await collections.data_sources.database.query(aql, {
      workspaceId,
    });
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async findEnabledForExecution(): Promise<DataSourceRecord[]> {
    const now = new Date().toISOString();
    // Include enabled data sources that are due, OR disabled data sources that were manually triggered (next_run_at is set and in the past)
    const aql = `
      FOR ds IN data_sources
        FILTER (ds.enabled == true AND (ds.next_run_at == null OR ds.next_run_at <= @now))
           OR (ds.enabled == false AND ds.next_run_at != null AND ds.next_run_at <= @now)
        RETURN ds
    `;

    const cursor = await collections.data_sources.database.query(aql, { now });
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async delete(id: string): Promise<void> {
    if (!id || id.trim() === "") {
      throw new Error("DataSource ID is required");
    }

    const key = this._extractKey(id);
    try {
      // Get the data source before deletion to verify it exists
      const dataSource = await this.findById(id);
      if (!dataSource) {
        throw new Error(`DataSource with id ${id} not found`);
      }

      await collections.data_sources.remove(key);
    } catch (error: any) {
      if (error.errorNum === 1202) {
        throw new Error(`DataSource with id ${id} (key: ${key}) not found`);
      }
      throw error;
    }
  }

  static async count(workspaceId?: string): Promise<number> {
    let aql = `LET count = LENGTH(FOR ds IN data_sources`;
    const bindVars: any = {};

    if (workspaceId) {
      aql += ` FILTER ds.workspace_id == @workspaceId`;
      bindVars.workspaceId = workspaceId;
    }

    aql += ` RETURN ds) RETURN count`;

    const cursor = await collections.data_sources.database.query(aql, bindVars);
    const result = await cursor.next();

    return result || 0;
  }

  // Helper methods
  static _extractKey(id: string): string {
    if (id.includes("/")) {
      return id.split("/")[1];
    }
    return id;
  }

  static _normalizeRecord(doc: any): DataSourceRecord {
    return {
      id: doc._id || `data_sources/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      name: doc.name,
      workspace_id: doc.workspace_id,
      description: doc.description,
      schedule: doc.schedule,
      definition_file_id: doc.definition_file_id,
      enabled: doc.enabled !== undefined ? doc.enabled : true,
      created_by: doc.created_by,
      last_run_at: doc.last_run_at,
      next_run_at: doc.next_run_at,
      metadata: doc.metadata || {},
      secrets: doc.secrets || {},
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }
}

