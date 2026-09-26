import { createRecord, deleteRecord, listRecords, updateRecord } from "@/lib/api";

export interface ProctorResultRow {
  id: number;
  project_id: number;
  test_key: string;
  payload_json?: unknown;
}

export const loadProctorResult = async (projectId: number) => {
  const response = await listRecords<ProctorResultRow>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" });
  return (response.data || []).find((row) => Number(row.project_id) === projectId && row.test_key === "proctor") ?? null;
};

export const saveProctorResult = async (projectId: number, recordId: number | null, data: Record<string, unknown>) => {
  const payload = { ...data, project_id: projectId };
  if (recordId) {
    const response = await updateRecord<{ id: number }>("test_results", recordId, payload);
    const updatedId = response.data?.id ?? recordId;
    if (updatedId === null) throw new Error("Saving this record returned no ID");
    return updatedId;
  }
  try {
    const response = await createRecord<{ id: number }>("test_results", payload);
    const savedId = response.data?.id ?? response.id ?? null;
    if (savedId === null) throw new Error("Saving this record returned no ID");
    return savedId;
  } catch (createError) {
    // A unique index on (project_id, test_key) rejects a second row for this project, so fall back
    // to updating the row that already exists rather than surfacing a hard error.
    const existing = await loadProctorResult(projectId);
    if (!existing) throw createError;
    const response = await updateRecord<{ id: number }>("test_results", existing.id, payload);
    return response.data?.id ?? existing.id;
  }
};

export const clearProctorResults = async (projectId: number) => {
  const response = await listRecords<ProctorResultRow>("test_results", { limit: 5000 });
  const rows = (response.data || []).filter((row) => Number(row.project_id) === projectId && row.test_key === "proctor");
  await Promise.all(rows.map((row) => deleteRecord("test_results", row.id)));
};
