import { useEffect, useRef } from "react";
import { useTestData, TestStatus } from "@/context/TestDataContext";

/**
 * Hook to report test data to the dashboard context.
 * Call in each test component with relevant data.
 *
 * @param id - Test identifier
 * @param dataPoints - Number of valid/complete data points
 * @param keyResults - Summary results to display
 * @param status - Optional explicit status override
 * @param startedDataPoints - Optional count of started (but not necessarily complete) data points
 */
export const useTestReport = (
  id: string,
  dataPoints: number,
  keyResults: { label: string; value: string }[],
  status?: TestStatus,
  startedDataPoints?: number,
) => {
  const { updateTest } = useTestData();
  const prevRef = useRef<string>("");

  useEffect(() => {
    // Determine status: use explicit status if provided, otherwise derive from data points
    // Show "in-progress" if any trials have been started OR any valid data exists
    const hasStartedData = startedDataPoints !== undefined && startedDataPoints > 0;
    const hasValidData = dataPoints > 0;
    const nextStatus: TestStatus = status ?? (hasStartedData || hasValidData ? "in-progress" : "not-started");

    const key = JSON.stringify({ dataPoints, keyResults, status: nextStatus });
    if (key === prevRef.current) return;
    prevRef.current = key;

    updateTest(id, {
      dataPoints,
      keyResults: keyResults.filter((r) => r.value && r.value !== "—" && r.value !== ""),
      status: nextStatus,
    });
  }, [id, dataPoints, keyResults, status, startedDataPoints, updateTest]);
};
