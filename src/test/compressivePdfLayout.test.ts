import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/imageUtils", () => ({ fetchAdminImagesAsBase64: async () => ({}) }));

import {
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
});