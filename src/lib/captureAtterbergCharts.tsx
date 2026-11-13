/**
 * Off-screen chart capture for the Atterberg export.
 *
 * The print sheet shows each record's Liquid Limit flow curve. The chart is a fixed-size SVG
 * that html2canvas can rasterise provided it is in the DOM long enough for React to paint.
 * Mounting every record into the page just for the export caused an expensive, visible
 * re-render flash; this helper renders a single chart at a time into a detached container
 * sitting at -9999px, captures it, and unmounts. Nothing is visible to the user.
 */
import { createRoot } from "react-dom/client";
import type { AtterbergRecord, LiquidLimitTest } from "@/context/TestDataContext";
import LiquidLimitFlowChart from "@/components/soil/LiquidLimitFlowChart";
import html2canvas from "html2canvas";

export interface CapturedAtterbergCharts {
  [recordId: string]: string;
}

export const captureAtterbergRecordChart = async (record: AtterbergRecord): Promise<string | null> => {
  const ll = record.tests.find((t): t is LiquidLimitTest => t.type === "liquidLimit");
  if (!ll) return null;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "560px";
  container.style.height = "380px";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    root.render(<LiquidLimitFlowChart trials={ll.trials} width={560} height={380} variant="print" />);
    // Give the React tree a paint tick — the chart is a flat SVG, but one frame of slack
    // lets web fonts and layout settle before the screenshot.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 150));

    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 4,
      logging: false,
      useCORS: true,
      allowTaint: true,
      imageTimeout: 0,
      windowWidth: 560,
      windowHeight: 380,
    });
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.debug("[OffscreenCapture] LiquidLimit chart capture failed:", error);
    return null;
  } finally {
    try {
      root.unmount();
    } catch {
      // container may already be torn down; safe to ignore
    }
    if (document.body.contains(container)) document.body.removeChild(container);
  }
};

/** Captures every requested record sequentially (no visible re-render). */
export const captureAtterbergCharts = async (records: ReadonlyArray<AtterbergRecord>): Promise<CapturedAtterbergCharts> => {
  const out: CapturedAtterbergCharts = {};
  for (const record of records) {
    const image = await captureAtterbergRecordChart(record);
    if (image) out[`${record.id}-liquidLimit`] = image;
  }
  return out;
};
