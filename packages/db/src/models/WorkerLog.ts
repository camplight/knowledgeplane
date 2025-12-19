import { collections } from "../db";

export interface WorkerLogInput {
  worker_name: string;
  task_type: string;
  workspace_id?: string; // Workspace ID (optional, for workspace-specific workers)
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
  status: "success" | "error" | "running";
  message?: string;
  details?: Record<string, any>;
  execution_time_ms?: number;
  items_processed?: number;
  items_created?: number;
  items_updated?: number;
  error?: string;
  created_at: string;
}

export class WorkerLog {
  static async create(input: WorkerLogInput): Promise<WorkerLogRecord> {
    const now = new Date().toISOString();
    const doc = {
      worker_name: input.worker_name,
      task_type: input.task_type,
      workspace_id: input.workspace_id || null,
      status: input.status,
      message: input.message || null,
      details: input.details || {},
      execution_time_ms: input.execution_time_ms || null,
      items_processed: input.items_processed || null,
      items_created: input.items_created || null,
      items_updated: input.items_updated || null,
      error: input.error || null,
      created_at: now,
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

    if (filters.length > 0) {
      aql += ` FILTER ${filters.join(" && ")}`;
    }

    aql += ` SORT log.created_at DESC LIMIT @offset, @limit RETURN log`;

    const cursor = await collections.worker_logs.database.query(aql, bindVars);
    const results = await cursor.all();

    return results.map((r: any) => this._normalizeRecord(r));
  }

  static async count(
    workspaceId?: string,
    worker_name?: string,
    status?: "success" | "error" | "running",
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
      status: doc.status,
      message: doc.message,
      details: doc.details || {},
      execution_time_ms: doc.execution_time_ms,
      items_processed: doc.items_processed,
      items_created: doc.items_created,
      items_updated: doc.items_updated,
      error: doc.error,
      created_at: doc.created_at,
    };
  }
}

