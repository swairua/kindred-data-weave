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
  const response = recordId
    ? await updateRecord<{ id: number }>("test_results", recordId, { ...data, project_id: projectId })
    : await createRecord<{ id: number }>("test_results", { ...data, project_id: projectId });
  const savedId = recordId ?? response.data?.id ?? response.id ?? null;
  if (savedId === null) throw new Error("Saving this record returned no ID");
  return savedId;
};

export const clearProctorResults = async (projectId: number) => {
  const response = await listRecords<ProctorResultRow>("test_results", { limit: 5000 });
  const rows = (response.data || []).filter((row) => Number(row.project_id) === projectId && row.test_key === "proctor");
  await Promise.all(rows.map((row) => deleteRecord("test_results", row.id)));
};
