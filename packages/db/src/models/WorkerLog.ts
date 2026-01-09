import { collections } from "../db";

export interface WorkerLogInput {
  worker_name: string;
  task_type: string;
  workspace_id?: string; // Workspace ID (optional, for workspace-specific workers)
  data_source_id?: string; // Data source ID (optional, for data source execution logs)
  status: "success" | "error" | "running";
  message?: string;
  details?: Record<string, any>;
  execution_time_ms?: number;
  items_processed?: number;
  items_created?: number;
  items_updated?: number;
  error?: string;
}

export interface WorkerLogRecord {
  _key?: string;
  _id?: string;
  id: string;
  worker_name: string;
  task_type: string;
  workspace_id?: string; // Workspace ID (optional, for workspace-specific workers)
  data_source_id?: string; // Data source ID (optional, for data source execution logs)
  status: "success" | "error" | "running";
  message?: string;
  details?: Record<string, any>;
  execution_time_ms?: number;
  items_processed?: number;
  items_created?: number;
  items_updated?: number;
  error?: string;
  created_at: string;
  updated_at?: string; // Timestamp when log was last updated (for completed logs)
}

export class WorkerLog {
  static async create(input: WorkerLogInput): Promise<WorkerLogRecord> {
    const now = new Date().toISOString();
    const doc = {
      worker_name: input.worker_name,
      task_type: input.task_type,
      workspace_id: input.workspace_id || null,
      data_source_id: input.data_source_id || null,
      status: input.status,
      message: input.message || null,
      details: input.details || {},
      execution_time_ms: input.execution_time_ms || null,
      items_processed: input.items_processed || null,
      items_created: input.items_created || null,
      items_updated: input.items_updated || null,
      error: input.error || null,
      created_at: now,
      updated_at: now, // Initially same as created_at
    };

    const result = await collections.worker_logs.save(doc, { returnNew: true });
    return this._normalizeRecord(result.new!);
  }

  static async list(
    workspaceId?: string,
    limit: number = 50,
    offset: number = 0,
    worker_name?: string,
    status?: "success" | "error" | "running",
    data_source_id?: string,
  ): Promise<WorkerLogRecord[]> {
    let aql = `FOR log IN worker_logs`;
    const bindVars: any = { limit, offset };
    const filters: string[] = [];

    if (workspaceId) {
      filters.push(`log.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
    }
    if (worker_name) {
      filters.push(`log.worker_name == @workerName`);
      bindVars.workerName = worker_name;
    }
    if (status) {
      filters.push(`log.status == @status`);
      bindVars.status = status;
    }
    if (data_source_id) {
      filters.push(`log.data_source_id == @dataSourceId`);
      bindVars.dataSourceId = data_source_id;
    }

    if (filters.length > 0) {
      aql += ` FILTER ${filters.join(" && ")}`;
    }

    aql += ` SORT log.created_at DESC LIMIT @offset, @limit RETURN log`;

    const cursor = await collections.worker_logs.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async update(
    id: string,
    updates: Partial<WorkerLogInput>,
  ): Promise<WorkerLogRecord> {
    const key = this._extractKey(id);
    const updateDoc: any = {};

    if (updates.status !== undefined) updateDoc.status = updates.status;
    if (updates.message !== undefined) updateDoc.message = updates.message;
    if (updates.details !== undefined) updateDoc.details = updates.details;
    if (updates.execution_time_ms !== undefined)
      updateDoc.execution_time_ms = updates.execution_time_ms;
    if (updates.items_processed !== undefined)
      updateDoc.items_processed = updates.items_processed;
    if (updates.items_created !== undefined)
      updateDoc.items_created = updates.items_created;
    if (updates.items_updated !== undefined)
      updateDoc.items_updated = updates.items_updated;
    if (updates.error !== undefined) updateDoc.error = updates.error;

    // Always update updated_at when log is modified
    updateDoc.updated_at = new Date().toISOString();

    const result = await collections.worker_logs.update(key, updateDoc, {
      returnNew: true,
    });

    if (!result) {
      throw new Error(`WorkerLog with id ${id} not found`);
    }

    return this._normalizeRecord(result.new!);
  }

  static async findById(id: string): Promise<WorkerLogRecord | null> {
    const key = this._extractKey(id);
    const doc = await collections.worker_logs.document(key);
    return doc ? this._normalizeRecord(doc) : null;
  }

  static async findLatestRunning(
    data_source_id: string,
  ): Promise<WorkerLogRecord | null> {
    // Find the latest log regardless of status
    // If the latest log is "running", return it
    // If the latest log is "success" or "error", return null (execution completed)
    const aql = `
      FOR log IN worker_logs
        FILTER log.data_source_id == @dataSourceId
        SORT log.created_at DESC
        LIMIT 1
        RETURN log
    `;

    const cursor = await collections.worker_logs.database.query(aql, {
      dataSourceId: data_source_id,
    });
    const result = await cursor.next();

    if (!result) {
      return null;
    }

    const latestLog = this._normalizeRecord(result);
    
    // Only return if status is "running", otherwise execution has completed
    return latestLog.status === "running" ? latestLog : null;
  }

  static async count(
    workspaceId?: string,
    worker_name?: string,
    status?: "success" | "error" | "running",
    data_source_id?: string,
  ): Promise<number> {
    let aql = `LET count = LENGTH(FOR log IN worker_logs`;
    const bindVars: any = {};
    const filters: string[] = [];

    if (workspaceId) {
      filters.push(`log.workspace_id == @workspaceId`);
      bindVars.workspaceId = workspaceId;
    }
    if (worker_name) {
      filters.push(`log.worker_name == @workerName`);
      bindVars.workerName = worker_name;
    }
    if (status) {
      filters.push(`log.status == @status`);
      bindVars.status = status;
    }
    if (data_source_id) {
      filters.push(`log.data_source_id == @dataSourceId`);
      bindVars.dataSourceId = data_source_id;
    }

    if (filters.length > 0) {
      aql += ` FILTER ${filters.join(" && ")}`;
    }

    aql += ` RETURN log) RETURN count`;

    const cursor = await collections.worker_logs.database.query(aql, bindVars);
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

  static _normalizeRecord(doc: any): WorkerLogRecord {
    return {
      id: doc._id || `worker_logs/${doc._key}`,
      _key: doc._key,
      _id: doc._id,
      worker_name: doc.worker_name,
      task_type: doc.task_type,
      workspace_id: doc.workspace_id,
      data_source_id: doc.data_source_id,
      status: doc.status,
      message: doc.message,
      details: doc.details || {},
      execution_time_ms: doc.execution_time_ms,
      items_processed: doc.items_processed,
      items_created: doc.items_created,
      items_updated: doc.items_updated,
      error: doc.error,
      created_at: doc.created_at,
      updated_at: doc.updated_at || doc.created_at, // Fallback to created_at if not set
    };
  }
}

