/**
 * Utility to wait for print document to be fully ready before printing.
 * Monitors:
 * - All images in the print sheet for load completion
 * - Chart rendering (SVG/canvas with non-zero dimensions)
 * - DOM stabilization (no changes for 300ms)
 */

export async function waitForPrintDocumentReady(
  recordId: string,
  timeoutMs = 5000
): Promise<void> {
  const startTime = performance.now();

  // Helper to log with timing
  const log = (stage: string) => {
    const elapsed = (performance.now() - startTime).toFixed(0);
    console.log(`[Print Ready] ${stage} (${elapsed}ms)`);
  };

  return new Promise((resolve) => {
    let timeoutHandle: NodeJS.Timeout | null = null;
    let mutationObserver: MutationObserver | null = null;
    let domStabilityTimeoutHandle: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (mutationObserver) mutationObserver.disconnect();
      if (domStabilityTimeoutHandle) clearTimeout(domStabilityTimeoutHandle);
    };

    const finish = (reason: string) => {
      cleanup();
      log(`Ready: ${reason}`);
      resolve();
    };

    // Timeout protection - resolve after max wait time
    timeoutHandle = setTimeout(() => {
      finish("Timeout reached, proceeding anyway");
    }, timeoutMs);

    // Find the print sheet element for this record
    const printSheetElement = document.querySelector(
      `[data-atterberg-record-id="${recordId}"] [data-print-sheet-content]`
    ) as HTMLElement | null;

    if (!printSheetElement) {
      finish("Print sheet element not found");
      return;
    }

    log("Print sheet element found");

    // Wait for all images to load
    const waitForImages = (): Promise<void> => {
      const images = printSheetElement.querySelectorAll("img") as NodeListOf<HTMLImageElement>;
      const imagePromises = Array.from(images).map((img) => {
        return new Promise<void>((imgResolve) => {
          if (img.complete) {
            imgResolve();
          } else {
            img.onload = () => imgResolve();
            img.onerror = () => imgResolve(); // Resolve even on error to not block
          }
        });
      });

      return Promise.all(imagePromises).then(() => {
        if (imagePromises.length > 0) {
          log(`All images loaded (${imagePromises.length} images)`);
        }
      });
    };

    // Wait for chart to be rendered (has dimensions)
    const waitForChart = (): Promise<void> => {
      return new Promise<void>((chartResolve) => {
        const checkChart = () => {
          // Look for chart container (usually SVG or canvas)
          const chartContainer = printSheetElement.querySelector(".chart-container, [class*=chart]") as HTMLElement | null;
          const svgChart = printSheetElement.querySelector("svg") as SVGElement | null;

          if (svgChart && svgChart.getBoundingClientRect().width > 0) {
            log("Chart rendered (SVG with dimensions)");
            chartResolve();
          } else if (chartContainer && chartContainer.offsetWidth > 0) {
            log("Chart container has dimensions");
            chartResolve();
          } else {
            // Check again after a short delay
            setTimeout(checkChart, 100);
          }
        };

        // Give the chart a moment to render
        setTimeout(checkChart, 50);
      });
    };

    // Wait for DOM stabilization (no changes for 300ms)
    const waitForDOMStability = (): Promise<void> => {
      return new Promise<void>((stabResolve) => {
        let mutationCount = 0;
        const STABILITY_DELAY = 300;

        const resetStabilityTimer = () => {
          if (domStabilityTimeoutHandle) clearTimeout(domStabilityTimeoutHandle);
          domStabilityTimeoutHandle = setTimeout(() => {
            mutationObserver?.disconnect();
            log(`DOM stable after ${mutationCount} mutations`);
            stabResolve();
          }, STABILITY_DELAY);
        };

        mutationObserver = new MutationObserver(() => {
          mutationCount++;
          resetStabilityTimer();
        });

        mutationObserver.observe(printSheetElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });

        // Start the stability timer
        resetStabilityTimer();
      });
    };

    // Run all checks in parallel, racing for completion
    Promise.all([
      waitForImages(),
      waitForChart(),
      waitForDOMStability(),
    ])
      .then(() => {
        finish("All readiness checks passed");
      })
      .catch((err) => {
        console.error("[Print Ready] Error during readiness checks:", err);
        finish("Error during readiness checks");
      });
  });
}
