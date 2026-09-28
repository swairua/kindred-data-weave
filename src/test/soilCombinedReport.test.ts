import { describe, expect, it } from "vitest";
import { buildCombinedSoilReport } from "@/lib/soilCombinedReport";
import { createProctorPayload, createProctorRows, emptyProctorRecord } from "@/lib/proctorRecords";

/** 100 g PSD: 10/10/15/15/5/5 retained + 40 pan -> 40% fines, LL30/PL19 -> GI 2. */
const gradingPayload = {
  project: {
    title: "P", clientName: "C", date: "2025-01-01",
    records: [{
      label: "BH-01", sampleNumber: "BH-01", sampleDepthFrom: "1.0", sampleDepthTo: "2.0",
      testedBy: "Tech", dateTested: "2025-01-12",
      moisture: { wetMass: "120", dryMass: "100" },
      classification: { liquidLimit: "30", plasticLimit: "19" },
      sieveRows: [
        { sieveSize: "4.75 (No. 4)", weightRetained: "10" },
        { sieveSize: "2.00 (No. 10)", weightRetained: "10" },
        { sieveSize: "0.425", weightRetained: "15" },
        { sieveSize: "0.3", weightRetained: "15" },
        { sieveSize: "0.15", weightRetained: "5" },
        { sieveSize: "0.075", weightRetained: "5" },
        { sieveSize: "<0.063", weightRetained: "40" },
      ],
      hydrometerRows: [{ time: "2", actualHydrometer: "10" }],
      hydrometerInputs: { sG: "2.65", temperature: "20", meniscusCorrection: "0.1" },
    }],
  },
  calculations: {
    d10: 0.07, d30: 0.2, d60: 1.1, cu: 15.7, cc: 0.52,
    moistureContent: 20, gravelPercentage: 10, sandPercentage: 50,
    sieveFinesPercentage: 40, finesPercentage: 40,
    plasticityIndex: 11, groupIndex: 2, uscsSymbol: "SC", aashtoGroup: "A-6",
  },
};

const proctorPayloadFor = (sampleNumber: string) => {
  // Three standard points around OMC; modified left empty on purpose.
  const rows = createProctorRows();
  const mk = (mAdd: string, wet: string, cWet: string, cDry: string, n: string) => ({
    moistureAdded: mAdd, mouldWetMass: wet, mouldTare: "1000",
    containerNumber: n, containerWetMass: cWet, containerDryMass: cDry, containerTare: "30",
  });
  rows[0] = mk("50", "3000", "140", "130", "1");
  rows[1] = mk("70", "3100", "142", "132", "2");
  rows[2] = mk("90", "3050", "145", "133", "3");
  const record = {
    ...emptyProctorRecord({ sampleId: sampleNumber, sampleNumber }),
    sampleDepthFrom: "1.0", sampleDepthTo: "2.0",
    standardMouldVolume: "1000", modifiedMouldVolume: "1000",
    specificGravity: "2.65", airVoidsTarget: "5",
    standardRows: rows, modifiedRows: createProctorRows(),
  };
  const std = { omc: 12.5, mdd: 1900, bulkDensity: 2137, optimumSource: "curve" as const, curve: null, rSquared: 0.98, pointCount: 3, warnings: [] };
  const mod = { omc: null, mdd: null, bulkDensity: null, optimumSource: "none" as const, curve: null, rSquared: null, pointCount: 0, warnings: [] };
  return createProctorPayload({ title: "P", clientName: "C", date: "2025-01-01" }, record, std, mod);
};

describe("soilCombinedReport", () => {
  it("joins PSD and compaction with relationship rows and traceability tables", () => {
    const report = buildCombinedSoilReport(gradingPayload, proctorPayloadFor("BH-01"), { projectName: "P" });
    expect(report.hasGrading).toBe(true);
    expect(report.hasProctor).toBe(true);
    expect(report.matched).toBe(true);
    expect(report.banner).toBeNull();
    const labels = report.fields.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(["Cu (=D60/D10)", "Standard OMC (%)", "Modified MDD (kg/m3)"]));
    // Relationship block present
    expect(labels).toEqual(expect.arrayContaining(["Fines vs Standard OMC", "Gradation vs Standard MDD", "Prep w vs Standard OMC"]));
    // Tables: sieve + hydrometer + standard + modified? modified empty -> standard + results
    expect(report.tables.length).toBeGreaterThanOrEqual(4 - 1);
    expect(report.tables.some((t) => t.title?.includes("sieve analysis"))).toBe(true);
    expect(report.tables.some((t) => t.title?.includes("Compaction - results"))).toBe(true);
    // Sieve % columns filled from recomputation
    const sieve = report.tables.find((t) => t.title?.includes("sieve analysis"));
    expect(sieve?.rows[0].length).toBe(4);
    expect(sieve?.rows[0][2]).not.toBe("—");
    expect(report.standard).toContain("BS 1377-2:1990");
    expect(report.standard).toContain("BS 1377-4:1990");
  });

  it("flags mismatched samples instead of silently merging", () => {
    const report = buildCombinedSoilReport(gradingPayload, proctorPayloadFor("BH-99"), {});
    expect(report.matched).toBe(false);
    expect(report.banner).toMatch(/differ/);
    expect(report.sampleLabel).toMatch(/Latest PSD/);
    expect(report.sampleLabel).toMatch(/Latest Proctor/);
  });

  it("renders dashes and a coverage banner when the companion test is missing", () => {
    const onlyGrading = buildCombinedSoilReport(gradingPayload, null, {});
    expect(onlyGrading.hasProctor).toBe(false);
    expect(onlyGrading.banner).toMatch(/Companion test not saved/);
    expect(onlyGrading.fields.find((f) => f.label === "Standard OMC (%)")?.value).toBe("—");
    expect(onlyGrading.fields.find((f) => f.label === "Fines vs OMC")?.value).toBe("—");

    const onlyProctor = buildCombinedSoilReport(null, proctorPayloadFor("BH-01"), {});
    expect(onlyProctor.hasGrading).toBe(false);
    expect(onlyProctor.banner).toMatch(/Companion test not saved/);
    expect(onlyProctor.fields.find((f) => f.label === "Cu (=D60/D10)")?.value).toBe("—");
    expect(onlyProctor.tables.some((t) => t.title?.includes("sieve"))).toBe(false);
    expect(onlyProctor.tables.some((t) => t.title?.includes("Compaction - results"))).toBe(true);
  });
});
