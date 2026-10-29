import { createRecord, listRecords, updateRecord } from "@/lib/api";

export interface CBRResultRow {
  id: number;
  project_id: number;
  test_key: string;
  payload_json?: unknown;
}

export const loadCBRResult = async (projectId: number) => {
  const response = await listRecords<CBRResultRow>("test_results", { limit: 5000, orderBy: "updated_at", direction: "DESC" });
  return (response.data || []).find((row) => Number(row.project_id) === projectId && row.test_key === "cbr") ?? null;
};

export const saveCBRResult = async (projectId: number, recordId: number | null, data: Record<string, unknown>) => {
  const payload = { ...data, project_id: projectId };
  if (recordId) {
    const response = await updateRecord<{ id: number }>("test_results", recordId, payload);
    return response.data?.id ?? recordId;
  }
  const response = await createRecord<{ id: number }>("test_results", payload);
  const savedId = response.data?.id ?? response.id ?? null;
  if (savedId === null) throw new Error("Saving this record returned no ID");
  return savedId;
};
