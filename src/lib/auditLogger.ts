/**
 * Audit Logger Utility
 *
 * Wraps CRUD operations from api.ts to automatically generate full-text
 * action descriptions stored in the audit_log table's `action` column (TEXT).
 *
 * Usage:
 *   import { loggedCreateRecord, loggedUpdateRecord, loggedDeleteRecord } from "@/lib/auditLogger";
 *   await loggedCreateRecord("projects", { name: "KANDARA", client_name: "Acme" });
 */

import { createRecord, updateRecord, deleteRecord, readRecord, listRecords } from "./api";

export interface AuditLogEntry {
  id?: number;
  company_id?: number;
  user_id?: number;
  action: string;
  entity_type?: string;
  entity_id?: number;
  changes?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  user_name?: string;
  created_at?: string;
}

/**
 * Generate a full-text action description for a CRUD operation.
 */
export function generateActionDescription(
  operation: "create" | "update" | "delete" | "read",
  table: string,
  id?: string | number,
  changes?: Record<string, unknown>
): string {
  const tableName = table.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  switch (operation) {
    case "create":
      return `Created new ${tableName} record${id !== undefined ? ` (ID: ${id})` : ""}`;
    case "update": {
      const changedFields = changes ? Object.keys(changes).join(", ") : "fields";
      return `Updated ${tableName} record${id !== undefined ? ` (ID: ${id})` : ""}${changedFields ? ` — changed: ${changedFields}` : ""}`;
    }
    case "delete":
      return `Deleted ${tableName} record${id !== undefined ? ` (ID: ${id})` : ""}`;
    case "read":
      return `Read ${tableName} record${id !== undefined ? ` (ID: ${id})` : ""}`;
    default:
      return `${operation} on ${tableName}${id !== undefined ? ` (ID: ${id})` : ""}`;
  }
}

/**
 * Logged version of createRecord that auto-generates audit action text.
 */
export async function loggedCreateRecord<T>(
  table: string,
  data: Record<string, unknown>
): Promise<ReturnType<typeof createRecord<T>>> {
  const result = await createRecord<T>(table, data);
  const id = (result as { id?: number }).id ?? (result as { data?: { id?: number } }).data?.id;
  const action = generateActionDescription("create", table, id ?? undefined, data);

  // Fire-and-forget audit log (non-blocking)
  try {
    await createRecord("audit_log", {
      action,
      entity_type: table,
      entity_id: id ?? null,
      changes: data,
      user_name: (data as Record<string, unknown>).user_name ?? null,
    });
  } catch {
    // Audit logging is non-blocking; failures are silently ignored
  }

  return result;
}

/**
 * Logged version of updateRecord that auto-generates audit action text.
 */
export async function loggedUpdateRecord<T>(
  table: string,
  id: string | number,
  data: Record<string, unknown>
): Promise<ReturnType<typeof updateRecord<T>>> {
  const result = await updateRecord<T>(table, id, data);
  const action = generateActionDescription("update", table, id, data);

  try {
    await createRecord("audit_log", {
      action,
      entity_type: table,
      entity_id: Number(id),
      changes: data,
      user_name: (data as Record<string, unknown>).user_name ?? null,
    });
  } catch {
    // Non-blocking
  }

  return result;
}

/**
 * Logged version of deleteRecord that auto-generates audit action text.
 */
export async function loggedDeleteRecord<T>(
  table: string,
  id: string | number
): Promise<ReturnType<typeof deleteRecord<T>>> {
  const result = await deleteRecord<T>(table, id);
  const action = generateActionDescription("delete", table, id);

  try {
    await createRecord("audit_log", {
      action,
      entity_type: table,
      entity_id: Number(id),
      changes: { deleted_id: id },
    });
  } catch {
    // Non-blocking
  }

  return result;
}

/**
 * Fetch audit log entries from the backend.
 */
export async function fetchAuditLog(
  limit: number = 50,
  offset: number = 0
): Promise<AuditLogEntry[]> {
  try {
    const response = await listRecords<AuditLogEntry>("audit_log", {
      limit,
      offset,
      orderBy: "created_at",
      direction: "DESC",
    });
    return response.data || [];
  } catch {
    return [];
  }
}
