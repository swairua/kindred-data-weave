import html2canvas from "html2canvas";

interface CaptureChartOptions {
  scale?: number;
  quality?: number;
  backgroundColor?: string;
}

/**
 * Captures a chart element as a base64 image string
 * @param elementId - The DOM element ID containing the chart
 * @param options - Optional configuration for the capture
 * @returns Base64 data URL of the captured chart image
 */
export const captureChartAsBase64 = async (
  elementId: string,
  options: CaptureChartOptions = {}
): Promise<string> => {
  const {
    scale = 2,
    quality = 0.95,
    backgroundColor = "#ffffff",
  } = options;

  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Chart element with ID "${elementId}" not found`);
    return "";
  }

  try {
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor,
      logging: false,
      useCORS: true,
      allowTaint: true,
    });

    return canvas.toDataURL("image/png", quality);
  } catch (error) {
    console.error(`Failed to capture chart "${elementId}":`, error);
    return "";
  }
};

/**
 * Captures multiple charts from an element
 * @param elementIds - Array of element IDs to capture
 * @param options - Optional configuration for the capture
 * @returns Object with element ID as key and base64 image as value
 */
export const captureMultipleCharts = async (
  elementIds: string[],
  options: CaptureChartOptions = {}
): Promise<{ [key: string]: string }> => {
  const results: { [key: string]: string } = {};

  for (const id of elementIds) {
    const base64 = await captureChartAsBase64(id, options);
    if (base64) {
      results[id] = base64;
    }
  }

  return results;
};

/**
 * Waits for chart to be rendered before capturing
 * Useful when charts are loaded asynchronously
 * @param elementId - The DOM element ID containing the chart
 * @param maxWaitTime - Maximum time to wait in milliseconds (default 5000)
 */
export const waitAndCaptureChart = async (
  elementId: string,
  maxWaitTime: number = 5000,
  options: CaptureChartOptions = {}
): Promise<string> => {
  const startTime = Date.now();
  const checkInterval = 100;

  return new Promise((resolve) => {
    const checkElement = () => {
      const element = document.getElementById(elementId);
      if (element && element.offsetHeight > 0) {
        // Element is rendered, capture it
        captureChartAsBase64(elementId, options).then(resolve);
      } else if (Date.now() - startTime < maxWaitTime) {
        // Keep waiting
        setTimeout(checkElement, checkInterval);
      } else {
        // Timeout reached, return empty string
        console.warn(`Timeout waiting for chart element "${elementId}"`);
        resolve("");
      }
    };

    checkElement();
  });
};
