import { collections } from "../db";

export interface AuditEventInput {
  action: string;
  actor_id?: string;
  workspace_id?: string;
  object_id?: string;
  tool?: string;
  detail?: Record<string, string | number | boolean | null>;
}

export class AuditEvent {
  static async create(input: AuditEventInput): Promise<void> {
    await collections.audit_events.save({
      action: input.action,
      actor_id: input.actor_id || null,
      workspace_id: input.workspace_id || null,
      object_id: input.object_id || null,
      tool: input.tool || null,
      detail: input.detail || {},
      created_at: new Date().toISOString(),
    });
  }
}
