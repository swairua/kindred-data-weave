import { useEffect, useRef } from "react";
import { useTestData, TestStatus } from "@/context/TestDataContext";

/**
 * Hook to report test data to the dashboard context.
 * Call in each test component with relevant data.
 */
export const useTestReport = (
  id: string,
  dataPoints: number,
  keyResults: { label: string; value: string }[],
  status?: TestStatus,
) => {
  const { updateTest } = useTestData();
  const prevRef = useRef<string>("");

  useEffect(() => {
    const nextStatus: TestStatus = status ?? (dataPoints === 0 ? "not-started" : "in-progress");

    const key = JSON.stringify({ dataPoints, keyResults, status: nextStatus });
    if (key === prevRef.current) return;
    prevRef.current = key;

    updateTest(id, {
      dataPoints,
      keyResults: keyResults.filter((r) => r.value && r.value !== "—" && r.value !== ""),
      status: nextStatus,
    });
  }, [id, dataPoints, keyResults, status, updateTest]);
};
