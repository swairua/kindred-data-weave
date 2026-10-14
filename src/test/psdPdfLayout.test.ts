import { describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";
import { jsPDF } from "jspdf";

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

const makeRecord = (
  sieveRows: { sieveSize: string; weightRetained: string }[],
  hydrometerRows: { time: string; actualHydrometer: string }[] = [],
): PsdRecordView => ({
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
  hydrometerRows,
});

const build = async (
  sieveRows: { sieveSize: string; weightRetained: string }[],
  hydrometerRows: { time: string; actualHydrometer: string }[] = [],
) => {
  const record = makeRecord(sieveRows, hydrometerRows);
  const grading = calculateGrading(sieveRows);
  const hydrometer = calculateHydrometer(hydrometerRows, hydrometerInputs, "176.4");
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

const THREE_ROWS = [
  { sieveSize: "4.75", weightRetained: "0" },
  { sieveSize: "0.15", weightRetained: "1.5" },
  { sieveSize: "<0.15", weightRetained: "176.4" },
];

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

const FULL_SIEVE = [
  ["63", "0"], ["50", "0"], ["37.5", "0"], ["28", "0"], ["20", "14.5"], ["14", "6.5"],
  ["10", "8.0"], ["6.3", "8.0"], ["5", "6.5"], ["3.35", "4.5"], ["2.36", "8.0"],
  ["1.18", "5.5"], ["0.6", "2.0"], ["0.425", "0.5"], ["0.3", "1.0"], ["0.15", "1.5"],
  ["0.075", "2.5"], ["0.063", "0.0"], ["<0.063", "176.4"],
].map(([sieveSize, weightRetained]) => ({ sieveSize, weightRetained }));

const DENSE_SIEVE = [
  ["75", "0"], ["63", "0"], ["50", "0"], ["37.5", "0"], ["28", "0"], ["20", "14.5"],
  ["14", "6.5"], ["10", "8.0"], ["6.3", "8.0"], ["5", "6.5"], ["4.75 (No. 4)", "4.5"],
  ["3.35", "4.5"], ["2.36", "8.0"], ["2.00 (No. 10)", "5.5"], ["1.18", "5.5"],
  ["0.6", "2.0"], ["0.425", "0.5"], ["0.3", "1.0"], ["0.15", "1.5"],
  ["0.075", "2.5"], ["0.063", "0.0"], ["<0.063", "148.4"], ["<0.075", "0"],
].map(([sieveSize, weightRetained]) => ({ sieveSize, weightRetained }));

const FULL_HYDROMETER = ["0.25", "0.5", "1", "2", "4", "8", "15", "30", "60", "120", "240", "480", "1440"]
  .map((time) => ({ time, actualHydrometer: "48" }));

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

  it("fits everything on a single page with a full sieve and hydrometer stack", async () => {
    // The densest real record: twenty-three sieve rows plus thirteen hydrometer
    // readings, the combination the KIRIAINI stack produces plus the <0.075 pan.
    expect((await build(DENSE_SIEVE, FULL_HYDROMETER)).getNumberOfPages()).toBe(1);
  });

  it("keeps the 'Wet & Dry Sieve' caption inside the sieve table cell", () => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    doc.setFont("helvetica", "bold");
    // Sieve table width is 69.5mm, so the caption cell offers 69.5 - 1.2mm.
    const available = 69.5 - 1.2;
    const caption = "Wet & Dry Sieve Analysis to BS 1377 2:1990: 9.2/9.3/9.4";

    // The caption starts at 6.6pt and shrinks only if needed; it must fit in one line.
    doc.setFontSize(6.6);
    const width = doc.getTextWidth(caption);
    expect(width).toBeLessThanOrEqual(available);
  });

  it("prints the two-line reference title and no Generated stamp", async () => {
    const doc = await build(FULL_SIEVE);
    const content = pageContent(doc);
    expect(content).toContain("PARTICLE SIZE DISTRIBUTION");
    expect(content).toContain("BS 1377");
    expect(content).not.toContain("Generated:");
  });

  it("dashes a missing hydrometer reading instead of leaving a blank rule", async () => {
    // Regression against an old export whose 0.50 min Actual HR cell printed
    // a blank rule while its Adjusted cell was filled: the first text element
    // after the 0.50 time label is that row's Actual HR cell.
    const blanked = FULL_HYDROMETER.map((row) =>
      row.time === "0.5" ? { ...row, actualHydrometer: "" } : row,
    );
    const doc = await build(FULL_SIEVE, blanked);
    const content = pageContent(doc);
    const actual = /\(0\.50\)[^(]*\(([^)]*)\)/.exec(content);
    expect(actual?.[1]).toBe("-");
  });

  it("draws the vector graph with selectable axis labels", async () => {
    // The PDF export always draws the native curve (the on-screen capture is
    // Excel-only now), so the axis labels must be real text in the stream.
    const doc = await build(FULL_SIEVE, FULL_HYDROMETER);
    const content = pageContent(doc);
    expect(content).toContain("Passing");
    expect(content).toContain("0.001");
  });

  it("sits the footer low enough to leave no idle band at the page foot", async () => {
    // The old 36.8 mm reserve (sized for the stamp) stranded ~31 mm of empty
    // page below the footer; without a stamp the footer drops, freeing room
    // for the graph. PDF y runs bottom-up, so a lower footer reads smaller.
    const doc = await build(FULL_SIEVE, FULL_HYDROMETER);
    const content = pageContent(doc);
    const footer = /(-?[\d.]+) (-?[\d.]+) Td\s+\(Tested by:\)/.exec(content);
    expect(footer).not.toBeNull();
    expect(Number(footer?.[2])).toBeLessThan(80);
  });

  it("shrinks graph labels when an extreme stack compresses the graph", async () => {
    // Forty sieve rows force the fit loop past the graph's natural height, so
    // the block draws compressed (vScale < 1). The decade ticks must shrink
    // with the geometry instead of colliding with the fraction bands below.
    const crowded = [
      ...DENSE_SIEVE,
      ...Array.from({ length: 17 }, () => ({ sieveSize: "<0.075", weightRetained: "" })),
    ];
    const doc = await build(crowded, FULL_HYDROMETER);
    expect(doc.getNumberOfPages()).toBe(1);

    const tickSize = (content: string): number | null => {
      const match = /\/F\w+ ([\d.]+) Tf[^(]*\(0\.001\)/.exec(content);
      return match ? Number(match[1]) : null;
    };
    const compressed = tickSize(pageContent(doc));
    expect(compressed).not.toBeNull();
    // Uncompressed the 5.4-unit tick prints at ~6.2 pt; compression must pull
    // it below 6 pt or the labels overflow their squeezed slots.
    expect(compressed as number).toBeLessThan(6.0);

    const roomy = await build(THREE_ROWS, FULL_HYDROMETER);
    const roomySize = tickSize(pageContent(roomy));
    expect(Number(roomySize)).toBeGreaterThan(compressed as number);
  });

  it("keeps the fraction names clear of the band-bottom rule", async () => {
    // The band-bottom rule once struck through the SILT/SAND/GRAVEL labels:
    // the rule is the ~403 pt horizontal stroke just below the names, and the
    // names must sit above it with real clearance, not kiss it.
    const doc = await build(FULL_SIEVE, FULL_HYDROMETER);
    const content = pageContent(doc);
    const names = /(-?[\d.]+) (-?[\d.]+) Td\s+\(SILT FRACTION\)/.exec(content);
    expect(names).not.toBeNull();
    const namesY = Number(names?.[2]);
    const rules: Array<{ y: number; len: number }> = [];
    const ruleRe = /(-?[\d.]+) (-?[\d.]+) m\s+(-?[\d.]+) (-?[\d.]+) l/g;
    let rule: RegExpExecArray | null;
    while ((rule = ruleRe.exec(content)) !== null) {
      const len = Math.abs(Number(rule[3]) - Number(rule[1]));
      if (len > 395 && len < 412) rules.push({ y: Number(rule[2]), len });
    }
    const below = rules.filter((entry) => entry.y < namesY).sort((a, b) => b.y - a.y);
    expect(below.length).toBeGreaterThan(0);
    expect(namesY - below[0].y).toBeGreaterThanOrEqual(1.5);
  });
});
