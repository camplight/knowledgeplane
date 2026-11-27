import { AuditEvent, type AuditEventInput } from "@knowledgeplane/db";

export async function recordAudit(input: AuditEventInput): Promise<void> {
  try {
    if (!AuditEvent?.create) {
      return;
    }
    await AuditEvent.create(input);
  } catch (error: any) {
    console.error("Failed to write audit event:", error.message);
  }
}
