import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/imageUtils", () => ({ fetchAdminImagesAsBase64: async () => ({}) }));

import { generateMoistureDensityPDF, type McRecordView, type MoistureDensityPdfOptions } from "@/lib/mcPdfGenerator";
import {
  airVoidsCurve,
  calculateProctor,
  calculateProctorPoint,
  createProctorRows,
  sampleCompactionCurve,
  zeroAirVoidsCurve,
  type ProctorRow,
} from "@/lib/proctorRecords";

/** Container weighings from the printed sheet, which peak at 37.9 % moisture content. */
const CONTAINER_WEIGHINGS: [number, number][] = [
  [204.4, 155.3],
  [169.0, 126.4],
  [201.0, 148.0],
  [201.2, 145.9],
  [204.1, 145.9],
  [256.3, 180.6],
];

/** Six completed points whose measured densities rise then fall around the optimum. */
const makeRows = (count = 6): ProctorRow[] => createProctorRows().slice(0, count).map((_, index) => {
  const [wet, dry] = CONTAINER_WEIGHINGS[index % CONTAINER_WEIGHINGS.length];
  return {
    moistureAdded: String(50 * index),
    // Mould mass rises with the water added, as on the sheet.
    mouldWetMass: String(3050 + index * 60),
    mouldTare: "3050",
    containerNumber: String(index + 1),
    containerWetMass: wet.toFixed(1),
    containerDryMass: dry.toFixed(1),
    containerTare: "-",
  };
});

const makeRecord = (rows: ProctorRow[]): McRecordView => ({
  label: "BH 1",
  sampleNumber: "-",
  sampleDepthFrom: "0.0",
  sampleDepthTo: "25.0",
  sampledSubmittedBy: "CRANSFIELD",
  dateSubmitted: "2026-06-10",
  dateTested: "2026-06-13",
  mouldVolume: "1000",
  specificGravity: "2.70",
  rows,
});

const build = (rows: ProctorRow[], overrides: Partial<MoistureDensityPdfOptions> = {}) => {
  const record = makeRecord(rows);
  const summary = calculateProctor(rows, record.mouldVolume);
  const measured = rows
    .map((row) => calculateProctorPoint(row, record.mouldVolume))
    .filter((point): point is typeof point & { moistureContent: number; dryDensity: number } =>
      point.moistureContent !== null && point.dryDensity !== null)
    .map((point) => ({ moisture: point.moistureContent, dryDensity: point.dryDensity }));
  // An empty record has no range to sample the curves over.
  const range: [number, number] = measured.length
    ? [measured[0].moisture, measured[measured.length - 1].moisture]
    : [0, 1];

  return generateMoistureDensityPDF({
    projectName: "KIRIAINI AHP",
    clientName: "SDHUD",
    date: "2026-06-13",
    dateTested: "2026-06-13",
    dateReported: "2026-06-14",
    testedBy: "CRANSFIELD",
    checkedBy: "",
    labOrganization: "Cransfield Materials Testing Center",
    method: "standard",
    record,
    summary,
    points: measured,
    fitted: summary.curve ? sampleCompactionCurve(summary.curve, range) : [],
    voidLines: [
      { percent: 0, points: zeroAirVoidsCurve(2.7, range) },
      { percent: 5, points: airVoidsCurve(5, 2.7, range) },
      { percent: 10, points: airVoidsCurve(10, 2.7, range) },
    ],
    chartImage: null,
    skipDownload: true,
    ...overrides,
  });
};

describe("Density/Moisture Content PDF page layout", () => {
  it("keeps the graph on the sheet with a full six point record", async () => {
    expect((await build(makeRows(6))).getNumberOfPages()).toBe(1);
  });

  it("starts a new page for the graph rather than overprinting a long results block", async () => {
    // Each warning is printed as its own row under the results. Enough of them push the
    // graph past the footer, and it must move to its own page instead of overlapping.
    const rows = makeRows(6);
    const summary = calculateProctor(rows, "1000");
    const doc = await build(rows, {
      summary: { ...summary, warnings: Array.from({ length: 24 }, (_, index) => `Warning number ${index + 1}`) },
    });

    expect(doc.getNumberOfPages()).toBe(2);
  });

  it("produces a document even with no readings entered", async () => {
    const doc = await build([]);
    const output = doc.output("arraybuffer") as ArrayBuffer;

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(output.byteLength).toBeGreaterThan(1000);
  });
});