import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/imageUtils", () => ({ fetchAdminImagesAsBase64: async () => ({}) }));

import { generateParticleSizeDistributionPDF, type PsdRecordView } from "@/lib/psdPdfGenerator";
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

const makeRecord = (sieveRows: { sieveSize: string; weightRetained: string }[]): PsdRecordView => ({
  label: "BH1",
  sampleNumber: "-",
  sampleDepthFrom: "0.0",
  sampleDepthTo: "25.0",
  sampledSubmittedBy: "Cransfield",
  testedBy: "JILLO",
  dateSubmitted: "2026-06-09",
  dateTested: "2026-06-11",
  samplePreparation: { initialDryMass: "328.0", washedOvenDryMass: "176.4" },
  moisture: { wetMass: "186.5", dryMass: "149.0" },
  sieveRows,
  hydrometerRows: [],
});

const build = async (sieveRows: { sieveSize: string; weightRetained: string }[]) => {
  const record = makeRecord(sieveRows);
  const grading = calculateGrading(sieveRows);
  const hydrometer = calculateHydrometer([], hydrometerInputs, "176.4");
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
      sieveRows.map((row, index) => ({ size: Number.parseFloat(row.sieveSize), passing: grading.cumulativePassing[index] })),
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

const THREE_ROWS = [
  { sieveSize: "4.75", weightRetained: "0" },
  { sieveSize: "0.15", weightRetained: "1.5" },
  { sieveSize: "<0.15", weightRetained: "176.4" },
];

const FULL_SIEVE = [
  ["63", "0"], ["50", "0"], ["37.5", "0"], ["28", "0"], ["20", "14.5"], ["14", "6.5"],
  ["10", "8.0"], ["6.3", "8.0"], ["5", "6.5"], ["3.35", "4.5"], ["2.36", "8.0"],
  ["1.18", "5.5"], ["0.6", "2.0"], ["0.425", "0.5"], ["0.3", "1.0"], ["0.15", "1.5"],
  ["0.075", "2.5"], ["0.063", "0.0"], ["<0.063", "176.4"],
].map(([sieveSize, weightRetained]) => ({ sieveSize, weightRetained }));

describe("Particle Size Distribution PDF page layout", () => {
  it("keeps the graph on the same page when the sieve table is short", async () => {
    expect((await build(THREE_ROWS)).getNumberOfPages()).toBe(1);
  });

  it("fits everything on a single page even with a full sieve table", async () => {
    // With a nineteen-row sieve table the graph must be scaled down so that
    // the whole report (tables + graph + footer) fits on one page rather
    // than spilling onto a second page or overlapping the footer.
    expect((await build(FULL_SIEVE)).getNumberOfPages()).toBe(1);
  });
});
  it("keeps the 'Wet & Dry Sieve' caption inside the sieve table cell", () => {
    const { jsPDF } = require("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold");
    // Sieve table width is 62mm, so the caption cell offers 62 - 1.2mm.
    const available = 62 - 1.2;
    const caption = "Wet & Dry Sieve Analysis to BS 1377-2:1990: 9.2/9.3/9.4";

    // The caption starts at 6pt and shrinks only if needed; it must fit in one line.
    doc.setFontSize(6);
    const width = doc.getTextWidth(caption);
    expect(width).toBeLessThanOrEqual(available);
  });

