import { describe, expect, it } from "vitest";
import {
  FORMULAS_REFERENCE_TITLE,
  FORMULAS_REFERENCE_VERSION,
  FORMULA_SECTIONS,
  type FormulaSourceModule,
} from "@/lib/formulasReference";
import {
  FORMULAS_REFERENCE_FILENAME,
  generateFormulasReferencePDF,
} from "@/lib/formulasReferencePdfGenerator";

const MODULE_LOADERS: Record<FormulaSourceModule, () => Promise<Record<string, unknown>>> = {
  atterbergCalculations: () => import("@/lib/atterbergCalculations"),
  gradingCalculations: () => import("@/lib/gradingCalculations"),
  proctorRecords: () => import("@/lib/proctorRecords"),
  compressiveCalculations: () => import("@/lib/compressiveCalculations"),
};

const collectStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
};

describe("formulas reference content", () => {
  it("covers grading, atterberg, proctor and compressive sections", () => {
    expect(FORMULA_SECTIONS.map((section) => section.testKey)).toEqual([
      "grading",
      "atterberg",
      "proctor",
      "compressive",
    ]);
    for (const section of FORMULA_SECTIONS) {
      expect(section.title.trim()).not.toBe("");
      expect(section.standard.trim()).not.toBe("");
      expect(section.entries.length).toBeGreaterThan(0);
    }
  });

  it("gives every entry a heading, formulas and cited implementations", () => {
    for (const section of FORMULA_SECTIONS) {
      for (const entry of section.entries) {
        expect(entry.heading.trim()).not.toBe("");
        expect(entry.formulas.length).toBeGreaterThan(0);
        expect(entry.sourceFunctions.length).toBeGreaterThan(0);
        for (const variable of entry.variables) {
          expect(variable.symbol.trim()).not.toBe("");
          expect(variable.meaning.trim()).not.toBe("");
        }
      }
    }
  });

  it("keeps every content string ASCII so jsPDF Helvetica cannot mangle it", () => {
    const offenders: string[] = [];
    for (const text of collectStrings(FORMULA_SECTIONS)) {
      // eslint-disable-next-line no-control-regex
      if (/[^\x00-\x7F]/.test(text)) offenders.push(text);
    }
    expect(offenders).toEqual([]);
  });

  it("cites only functions that genuinely exist in the calculation modules", async () => {
    const modules = new Map<FormulaSourceModule, Record<string, unknown>>();
    for (const section of FORMULA_SECTIONS) {
      for (const entry of section.entries) {
        if (!modules.has(entry.sourceModule)) {
          modules.set(entry.sourceModule, await MODULE_LOADERS[entry.sourceModule]());
        }
        const module = modules.get(entry.sourceModule)!;
        for (const name of entry.sourceFunctions) {
          expect(
            module[name] !== undefined && module[name] !== null,
            `${entry.sourceModule} must export ${name} (cited by "${entry.heading}")`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("formulas reference PDF", () => {
  it("renders every section to at least one page without throwing", async () => {
    const doc = await generateFormulasReferencePDF({ skipDownload: true });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("versions the document and uses a stable filename", () => {
    expect(FORMULAS_REFERENCE_TITLE.trim()).not.toBe("");
    expect(FORMULAS_REFERENCE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(FORMULAS_REFERENCE_FILENAME).toBe("Calculations_and_Formulas_Reference.pdf");
  });
});
