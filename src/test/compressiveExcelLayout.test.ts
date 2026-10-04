import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/imageUtils", () => ({ fetchAdminImagesAsBase64: async () => ({}) }));

import ExcelJS from "exceljs";
import { generateCompressiveStrengthExcel } from "@/lib/compressiveExcelGenerator";
import { CUBE_SHEET_COLUMNS, cubeSheetValues } from "@/lib/compressivePdfGenerator";
import { cubeStrengthFromClass, type CompressiveCubeInput } from "@/lib/compressiveCalculations";

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

const RECORD = {
  contractor: "Contractor", county: "Nairobi", concreteClass: "C30",
  section: "Bases", madeBy: "Contractor", slump: "N/A",
  clientRef: "", labRef: "CM/9023", dateCasted: "2026-09-19",
};

const build = (rows: CompressiveCubeInput[]) =>
  generateCompressiveStrengthExcel({
    projectName: "Proposed Residential Development in Nairobi",
    clientName: "Venus Engineering and Construction Limited",
    dateReported: "2026-09-28",
    testedBy: "Paul",
    checkedBy: "",
    labOrganization: "CRANSFIELD LABS",
    record: RECORD,
    rows,
    skipDownload: true,
  });

/** jsdom's Blob has no `arrayBuffer()`, so go through FileReader. */
const toBuffer = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

/** Read the workbook back so the assertions test real output, not intentions. */
const readBack = async (rows: CompressiveCubeInput[]) => {
  const blob = await build(rows);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await toBuffer(blob as Blob));
  const ws = wb.getWorksheet("Cube Results")!;
  const text: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value;
      if (v !== null && v !== undefined) text.push(String(v));
    });
  });
  return { ws, text };
};

describe("generateCompressiveStrengthExcel", () => {
  it("builds a readable workbook", async () => {
    const blob = await build(REFERENCE_CUBES);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.size).toBeGreaterThan(1000);
  });

  it("prints the same values as the PDF sheet, cell for cell", async () => {
    const { text } = await readBack(REFERENCE_CUBES);
    const expected = cubeSheetValues(REFERENCE_CUBES[0], cubeStrengthFromClass("C30"));
    // Every value of the first cube, minus the trailing spacer column.
    for (const value of expected.slice(0, CUBE_SHEET_COLUMNS.length)) {
      expect(text).toContain(value);
    }
  });

  it("carries the cube mark through when the technician entered one", async () => {
    const { text } = await readBack([{ ...REFERENCE_CUBES[0], mark: "CUBE-A" }]);
    expect(text).toContain("CUBE-A");
  });

  it("omits blank rows that cannot produce a strength", async () => {
    const { text } = await readBack([
      ...REFERENCE_CUBES,
      { ...REFERENCE_CUBES[0], load: "" },
    ]);
    // Two cubes means two "84%"/"72%" cells, not three.
    expect(text).toContain("84%");
    expect(text).toContain("72%");
    const marks = text.filter((t) => t === "None").length;
    expect(marks).toBe(2);
  });

  it("prints the identification block and the terms", async () => {
    const { text } = await readBack(REFERENCE_CUBES);
    expect(text).toContain("PROJECT");
    expect(text).toContain("LAB REF");
    expect(text).toContain("CM/9023");
    expect(text).toContain("19-Sep-26");
    expect(text).toContain("Terms and Conditions");
    // Merged cells report the master's value from every cell in the range, so
    // the terms arrive repeated; check the opening clause of the first one.
    expect(text.some((cell) => cell.startsWith("1.  Results herein is a true representation"))).toBe(true);
    expect(text.some((cell) => cell.includes("7.  A legal contract"))).toBe(true);
    expect(text).toContain("TESTED BY:  Paul");
  });

  it("uses the same column count as the printed sheet", async () => {
    const { ws } = await readBack(REFERENCE_CUBES);
    // Column 1 is the margin, so the sheet occupies 2..lastCol.
    expect(ws.actualColumnCount).toBe(CUBE_SHEET_COLUMNS.length + 1);
  });

  it("still produces a workbook with no cubes at all", async () => {
    const blob = await build([]);
    expect(blob!.size).toBeGreaterThan(1000);
  });
});