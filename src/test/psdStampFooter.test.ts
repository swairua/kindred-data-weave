import { describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";

const STAMP_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

vi.mock("@/lib/imageUtils", () => ({ fetchAdminImagesAsBase64: async () => ({ stamp: STAMP_PNG }) }));

import { generateParticleSizeDistributionPDF } from "@/lib/psdPdfGenerator";
import { calculateGrading, calculateHydrometer } from "@/lib/gradingCalculations";
import { mergePsdSeries } from "@/lib/psdChartGeometry";

const hydrometerInputs = {
  dryWeight: "176.4",
  suspensionVolume: "1000",
  sG: "2.65",
  temperature: "20",
  hydrometerType: "152H",
  zeroCorrection: "0",
  meniscusCorrection: "0.1",
  temperatureCorrection: "0",
  kFactor: "",
};

const SIEVE = [
  ["10", "8.0"], ["6.3", "8.0"], ["5", "6.5"], ["3.35", "4.5"], ["2.36", "8.0"],
  ["1.18", "5.5"], ["0.6", "2.0"], ["0.425", "0.5"], ["0.3", "1.0"], ["0.15", "1.5"],
  ["0.075", "2.5"], ["0.063", "0.0"], ["<0.063", "148.4"], ["<0.075", "0"],
].map(([sieveSize, weightRetained]) => ({ sieveSize, weightRetained }));

const HYDRO = ["0.25", "0.5", "1", "2", "4", "8", "15", "30", "60", "120", "240", "480", "1440"]
  .map((time) => ({ time, actualHydrometer: "48" }));

/** Raw content-stream text of the document: inflate FlateDecode streams, pass the rest through. */
const pageContent = (doc: { output: (type: "arraybuffer") => ArrayBuffer }): string => {
  const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  const parts: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw)) !== null) {
    try {
      parts.push(inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"));
    } catch {
      parts.push(match[1]);
    }
  }
  return parts.join("\n");
};

const build = async () => {
  const record = {
    label: "BH1",
    sampleNumber: "BH01",
    sampleDepthFrom: "0.0",
    sampleDepthTo: "25.0",
    sampledSubmittedBy: "Cransfield",
    testedBy: "JILLO",
    dateSubmitted: "2026-06-09",
    dateTested: "2026-06-11",
    samplePreparation: { initialDryMass: "328.0", washedOvenDryMass: "176.4" },
    moisture: { wetMass: "186.5", dryMass: "149.0" },
    sieveRows: SIEVE,
    hydrometerRows: HYDRO,
  };
  const grading = calculateGrading(SIEVE);
  const hydrometer = calculateHydrometer(HYDRO, hydrometerInputs, "176.4");
  return generateParticleSizeDistributionPDF({
    projectName: "KIRIAINI AHP",
    clientName: "SDHUD",
    date: "2026-06-11",
    dateTested: "2026-06-11",
    dateReported: "2026-06-13",
    testedBy: "JILLO",
    checkedBy: "",
    labOrganization: "Cransfield Materials Testing Center",
    record,
    grading,
    hydrometer,
    hydrometerInputs,
    series: mergePsdSeries(
      SIEVE.map((row, index) => ({ size: Number.parseFloat(row.sieveSize), passing: grading.cumulativePassing[index] })),
      hydrometer.results.map((result) => ({ size: result.particleDiameter, passing: result.finesByHydrometer })),
    ),
    chartImage: null,
    gravelPercentage: 22.8,
    sandPercentage: 5.3,
    finesPercentage: 71.9,
    uscsSymbol: "MH",
    uscsDescription: "GRAVELLY ELASTIC SILT",
    aashtoGroup: "A-7-5",
    groupIndex: 3,
    skipDownload: true,
  });
};

describe("PSD footer with a configured stamp", () => {
  it("embeds the stamp image on the sheet", async () => {
    const doc = await build();
    expect(doc.getNumberOfPages()).toBe(1);
    expect(pageContent(doc)).toMatch(/\/I\d+ Do/);
  });

  it("anchors the footer at the fixed page foot and keeps the stamp on-page", async () => {
    // The footer anchor no longer moves with the stamp: the report closes above
    // it and the stamp straddles the footer's right edge, still inside the
    // sheet. PDF y runs bottom-up, so the footer baseline sits low on the page.
    const doc = await build();
    const content = pageContent(doc);
    const footer = /(-?[\d.]+) (-?[\d.]+) Td\s+\(Tested by:\)/.exec(content);
    expect(footer).not.toBeNull();
    const footerY = Number(footer?.[2]);
    expect(footerY).toBeLessThan(80);
    expect(footerY).toBeGreaterThan(30);

    const stamp = /(-?[\d.]+) 0 0 (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm\s*\/I\d+ Do/.exec(content);
    expect(stamp).not.toBeNull();
    const [, , height, , bottom] = stamp as RegExpExecArray;
    expect(Number(bottom)).toBeGreaterThanOrEqual(0);
    expect(Number(bottom) + Number(height)).toBeLessThanOrEqual(792);
  });
});
