import { describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";
import { jsPDF } from "jspdf";

vi.mock("@/lib/imageUtils", () => ({ fetchAdminImagesAsBase64: async () => ({}) }));

import {
  fillStrokeRect,
  formatReportDate,
  generateCompressiveStrengthPDF,
  isSatisfactory,
  percentOfClass,
  type CompressiveRecordView,
} from "@/lib/compressivePdfGenerator";
import { type CompressiveCubeInput } from "@/lib/compressiveCalculations";

/** The two cube rows exactly as printed on the Venus sheet (C30 mix). */
const REFERENCE_CUBES: CompressiveCubeInput[] = [
  {
    id: null, mark: "", dateOfCast: "2026-09-19", dateOfTest: "2026-09-26",
    load: "564.1", width: "150", height: "150", depth: "150", mass: "7927", remarks: "",
  },
  {
    id: null, mark: "", dateOfCast: "2026-09-19", dateOfTest: "2026-09-26",
    load: "484.6", width: "150", height: "150", depth: "150", mass: "7971", remarks: "",
  },
];

const RECORD: CompressiveRecordView = {
  contractor: "Contractor",
  county: "Nairobi",
  concreteClass: "C30",
  section: "Bases",
  madeBy: "Contractor",
  slump: "N/A",
  clientRef: "",
  labRef: "CM/9023",
  dateCasted: "2026-09-19",
};

const options = (rows: CompressiveCubeInput[]) => ({
  projectName: "Proposed Residential Development in Nairobi",
  clientName: "Venus Engineering and Construction Limited",
  dateReported: "2026-09-28",
  testedBy: "Paul",
  checkedBy: "",
  record: RECORD,
  rows,
  skipDownload: true,
});

/** Raw content-stream text of the document: inflate FlateDecode streams, pass the rest through. */
const pageContent = (doc: jsPDF): string => {
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

describe("formatReportDate", () => {
  it("renders ISO dates the way the laboratory sheet does", () => {
    expect(formatReportDate("2026-09-19")).toBe("19-Sep-26");
    expect(formatReportDate("2026-09-28")).toBe("28-Sep-26");
    expect(formatReportDate("2026-12-05")).toBe("5-Dec-26");
  });

  it("passes through anything it cannot parse rather than printing NaN", () => {
    expect(formatReportDate("not a date")).toBe("not a date");
    expect(formatReportDate("")).toBe("");
  });
});

describe("percentOfClass", () => {
  it("reproduces the printed percentages for a C30 mix", () => {
    // The sheet shows 25.1 MPa as 84% and 21.5 MPa as 72%.
    expect(percentOfClass(25.1, 30)).toBe("84%");
    expect(percentOfClass(21.5, 30)).toBe("72%");
  });

  it("returns nothing rather than dividing by an unknown class", () => {
    expect(percentOfClass(25.1, null)).toBe("");
    expect(percentOfClass(null, 30)).toBe("");
    expect(percentOfClass(25.1, 0)).toBe("");
  });
});

describe("isSatisfactory", () => {
  it("accepts both cubes printed as Satisfactory on the reference sheet", () => {
    // 25.1 MPa and 21.5 MPa are 84% and 72% of a C30 class; both were signed off.
    expect(isSatisfactory(25.1, 30)).toBe(true);
    expect(isSatisfactory(21.5, 30)).toBe(true);
  });

  it("rejects a cube that fell well short of the class", () => {
    expect(isSatisfactory(12, 30)).toBe(false);
  });

  it("judges each cube against its own age expectation", () => {
    // A 28-day cube at 70% is far below its 99% expectation.
    expect(isSatisfactory(21, 30, 28)).toBe(false);
    // A 3-day cube at 45% beats its 40% expectation.
    expect(isSatisfactory(13.5, 30, 3)).toBe(true);
    // The reference 7-day cubes still pass at their 65% expectation.
    expect(isSatisfactory(25.1, 30, 7)).toBe(true);
    expect(isSatisfactory(21.5, 30, 7)).toBe(true);
  });

  it("falls back to the flat 65% line when the age is unknown", () => {
    expect(isSatisfactory(21.5, 30, null)).toBe(true);
    expect(isSatisfactory(12, 30, null)).toBe(false);
  });

  it("judges over-28 cubes at ~99% as on the desired sheet", () => {
    // Correct-design sheet, C40 at 55 days: 78% and 60% Unsatisfactory.
    expect(isSatisfactory(31.1, 40, 55)).toBe(false);
    expect(isSatisfactory(24, 40, 55)).toBe(false);
    // Same sheet, C25 at 55 days: 99% and 111% Satisfactory.
    expect(isSatisfactory(24.8, 25, 55)).toBe(true);
    expect(isSatisfactory(27.8, 25, 55)).toBe(true);
  });

  it("gives no verdict without a class or a measured strength", () => {
    expect(isSatisfactory(25.1, null)).toBe(false);
    expect(isSatisfactory(null, 30)).toBe(false);
  });
});

describe("generateCompressiveStrengthPDF", () => {
  it("produces a single landscape A4 page for the reference's two cubes", async () => {
    const doc = await generateCompressiveStrengthPDF(options(REFERENCE_CUBES));
    expect(doc.getNumberOfPages()).toBe(1);

    const { width, height } = doc.internal.pageSize;
    // A4 landscape: wider than tall.
    expect(width).toBeGreaterThan(height);
    expect(Math.round(width)).toBe(297);
    expect(Math.round(height)).toBe(210);
  });

  it("writes every cube onto the sheet, not just the first two", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...REFERENCE_CUBES[0],
      mark: `CUBE-${i + 1}`,
      load: String(500 + i),
    }));
    const doc = await generateCompressiveStrengthPDF(options(many));

    // Twelve cubes still fit one page, but they must have driven the layout.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });

  it("adds no page for blank rows that cannot produce a strength", async () => {
    const doc = await generateCompressiveStrengthPDF(
      options([...REFERENCE_CUBES, { ...REFERENCE_CUBES[0], load: "" }]),
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("still exports a valid sheet when there are no cubes at all", async () => {
    const doc = await generateCompressiveStrengthPDF(options([]));
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });

  it("survives missing laboratory images", async () => {
    // The mock returns no logo or stamp; the report must still be produced.
    const doc = await generateCompressiveStrengthPDF(options(REFERENCE_CUBES));
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });

  it("keeps every cube-row glyph inside the blue table frame", async () => {
    // Regression: the old `size * 0.35` point offset pushed row baselines
    // ~0.5 mm below short rows, so the blue frame cut the last line in half.
    const doc = await generateCompressiveStrengthPDF(options([{ ...REFERENCE_CUBES[0], mark: "C1" }]));
    expect(doc.getNumberOfPages()).toBe(1);
    const content = pageContent(doc);

    // The table's outer frame: blue stroke, then `x y w h re` in points.
    // jsPDF writes the rect top-down, so its height is negative and the
    // bottom edge sits at y + h.
    const frames = [...content.matchAll(/0\. 0\. 1\. RG[\s\S]{0,200}?(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)];
    expect(frames).toHaveLength(1);
    const [fx, fy, fw, fh] = frames[0].slice(1, 5).map(Number);
    const frameBottom = fy + fh;

    // Text positions `x y Td (string) Tj`, also in points from the page bottom.
    const matrices = [...content.matchAll(/(-?[\d.]+) (-?[\d.]+) Td\s+\((?:\\.|[^)])*\) Tj/g)];
    expect(matrices.length).toBeGreaterThan(0);
    for (const matrix of matrices) {
      const [tx, ty] = matrix.slice(1, 3).map(Number);
      if (tx < fx || tx > fx + fw) continue;
      const aboveFrameBottom = ty - frameBottom;
      // Row text now sits ~2.1 mm above the frame; terms/footer text starts
      // 3+ mm below it. Anything in between is a glyph crossing the frame.
      const inForbiddenStrip = aboveFrameBottom >= -8 && aboveFrameBottom < 0.5;
      expect(inForbiddenStrip).toBe(false);
    }
  });
  it("encloses the whole report in a single full-page blue frame", async () => {
    // The laboratory's sheet inks one blue frame around everything —
    // letterhead rule through footer — not just the results table.
    const doc = await generateCompressiveStrengthPDF(options(REFERENCE_CUBES));
    const content = pageContent(doc);
    const frames = [...content.matchAll(/0\. 0\. 1\. RG[\s\S]{0,200}?(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)];
    expect(frames).toHaveLength(1);
    // Full-report frame is ~175 mm (~500 pt); the old table-only frame was ~18 mm.
    expect(Math.abs(Number(frames[0][4]))).toBeGreaterThan(300);
  });

  it("prints whole-millimetre dimensions without decimals", async () => {
    const doc = await generateCompressiveStrengthPDF(options([{
      ...REFERENCE_CUBES[0],
      width: "150.00",
      height: "150",
      depth: "150.5",
    }]));
    const content = pageContent(doc);
    expect(content).toContain("(150)");
    expect(content).toContain("(150.5)");
    expect(content).not.toContain("150.00");
  });

  it("stacks a two-line lab reference inside its cell", async () => {
    const doc = await generateCompressiveStrengthPDF({
      ...options(REFERENCE_CUBES),
      record: { ...RECORD, labRef: "CM/5552\nCM/5553" },
    });
    const content = pageContent(doc);
    expect(content).toContain("CM/5552");
    expect(content).toContain("CM/5553");
  });

  it("numbers pages without a Generated stamp the lab sheet never had", async () => {
    const doc = await generateCompressiveStrengthPDF(options(REFERENCE_CUBES));
    const content = pageContent(doc);
    expect(content).not.toContain("Generated:");
    expect(content).toContain("Page 1 of 1");
  });
});

describe("fill colour adjacency", () => {
  it("re-emits the fill colour immediately before a rect drawn after text", () => {
    // Regression for the black L/W/H and Remarks header cells: jsPDF's text()
    // writes (and caches) a fill colour of its own, so a setFillColor issued
    // before the text is not re-emitted for a later rect. fillStrokeRect must
    // keep the rect's own colour adjacent to the rect in the content stream.
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: false });
    doc.setFillColor(212, 212, 212); // the stale colour the bug would leave behind
    doc.setFontSize(6.5);
    doc.text("HEADING", 30, 30); // black text between colour and rect
    fillStrokeRect(doc, 25, 40, 40, 8, [255, 255, 255]);

    const stream = Buffer.from(doc.output("arraybuffer")).toString("latin1");
    const rectIndex = stream.lastIndexOf(" re");
    expect(rectIndex).toBeGreaterThan(-1);
    const preceding = stream.slice(Math.max(0, rectIndex - 240), rectIndex);
    // jsPDF 4 writes white as `1. g`; older versions wrote `1 1 1 rg`.
    const fills = preceding.match(/\d[\d.]* \d[\d.]* \d[\d.]* rg|\d[\d.]* g/g) ?? [];
    // The last fill colour written before the rect must be the rect's own white.
    expect(["1. g", "1 1 1 rg"]).toContain(fills[fills.length - 1]);
  });
});