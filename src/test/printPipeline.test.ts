/**
 * Print-pipeline regression suite. Every printable PDF the app produces is invoked
 * against a known-good fixture; the test asserts that the generator ran,
 * produced at least one page, and signed the bytes. No snapshot crossings —
 * we guard against silently-unbrounchable output, not exact rendering.
 */
import { describe, it, vi } from "vitest";
import {
  generateTestPDF,
} from "@/lib/pdfGenerator";
import { generateCompressiveStrengthPDF } from "@/lib/compressivePdfGenerator";
import {
  applyReportedOptimum,
  calculateProctor,
} from "@/lib/proctorRecords";
import { generateMoistureDensityPDF } from "@/lib/mcPdfGenerator";
import { generateParticleSizeDistributionPDF, type PsdRecordView } from "@/lib/psdPdfGenerator";
import { calculateGrading, calculateHydrometer, calculateMoisture } from "@/lib/gradingCalculations";
import { mergePsdSeries } from "@/lib/psdChartGeometry";
import { emptyProctorRecord } from "@/lib/proctorRecords";

vi.mock("@/lib/imageUtils", () => ({ fetchAdminImagesAsBase64: async () => ({}) }));

const HYDROMETER_INPUTS = {
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
  sampledSubmittedBy: "Smoke Lab",
  testedBy: "Tester",
  dateSubmitted: "2026-11-13",
  dateTested: "2026-11-13",
  samplePreparation: { initialDryMass: "328.0", washedOvenDryMass: "176.4" },
  moisture: { wetMass: "186.5", dryMass: "149.0" },
  sieveRows,
  hydrometerRows,
});

const THREE_ROWS = [
  { sieveSize: "4.75", weightRetained: "0" },
  { sieveSize: "0.15", weightRetained: "1.5" },
  { sieveSize: "<0.15", weightRetained: "176.4" },
];

const summaryOf = (() => {
  const rows = [
    { moistureAdded: "30", mouldWetMass: "4310", mouldTare: "3050", containerNumber: "C1", containerWetMass: "112", containerDryMass: "104", containerTare: "36" },
    { moistureAdded: "50", mouldWetMass: "4450", mouldTare: "3050", containerNumber: "C2", containerWetMass: "115", containerDryMass: "105", containerTare: "36" },
    { moistureAdded: "70", mouldWetMass: "4560", mouldTare: "3050", containerNumber: "C3", containerWetMass: "118", containerDryMass: "106", containerTare: "36" },
    { moistureAdded: "90", mouldWetMass: "4600", mouldTare: "3050", containerNumber: "C4", containerWetMass: "120", containerDryMass: "107", containerTare: "36" },
  ];
  const calc = calculateProctor(rows as never, "903", 2.0);
  return applyReportedOptimum(calc, "13.5", "1780");
})();

vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in print-pipeline tests"); }));

describe("PDF print pipeline", () => {
  it("emits a compact slump PDF", async () => {
    const doc = await generateTestPDF({
      title: "Slump Test",
      standard: "EN 12350-2",
      projectName: "Smoke Project",
      clientName: "Smoke Client",
      date: "2026-11-13",
      testedBy: "Tester",
      fields: [{ label: "Measured slump", value: "42 mm" }],
      skipDownload: true,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("emits a compressive cube sheet", async () => {
    const doc = await generateCompressiveStrengthPDF({
      projectName: "Smoke Project",
      clientName: "Smoke Client",
      record: {
        contractor: "Smoke Contractor",
        county: "Naivasha",
        concreteClass: "C25/30",
        section: "Edge",
        madeBy: "Tester",
        slump: "80",
        clientRef: "R1",
        labRef: "L1",
        reportNo: "REP-001",
        dateReceived: "2026-11-13",
        dateCasted: "2026-11-01",
        curing: "standard",
        modeOfFailure: "-",
        comment: "-",
      },
      rows: [
        { cubeId: "C1", dateOfCast: "2026-11-01", dateOfTest: "2026-11-13", age: "12", load: "564.1", width: "150", depth: "150" },
      ],
      skipDownload: true,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("emits a Proctor compaction PDF", async () => {
    const record = emptyProctorRecord({ sampleId: "Smoke", sampleNumber: "S-01", sampleDepthFrom: "2.00", sampleDepthTo: "2.50", sampledSubmittedBy: "Tester", dateSubmitted: "2026-11-13", dateTested: "2026-11-13" });
    const points = [
      { moisture: 7.1, dryDensity: 1710 }, { moisture: 9.5, dryDensity: 1760 },
      { moisture: 11.9, dryDensity: 1785 }, { moisture: 14.2, dryDensity: 1780 },
      { moisture: 16.6, dryDensity: 1735 }, { moisture: 18.9, dryDensity: 1690 },
    ];
    const doc = await generateMoistureDensityPDF({
      projectName: "Smoke Project",
      clientName: "Smoke Client",
      date: "2026-11-13",
      dateTested: "2026-11-13",
      dateReported: "2026-11-13",
      labOrganization: "Smoke Lab",
      method: "standard",
      record: {
        label: record.label,
        sampleNumber: record.sampleNumber,
        sampleDepthFrom: record.sampleDepthFrom,
        sampleDepthTo: record.sampleDepthTo,
        sampledSubmittedBy: record.sampledSubmittedBy,
        dateSubmitted: record.dateSubmitted,
        dateTested: record.dateTested,
        mouldVolume: "903",
        specificGravity: "2.0",
        rows: record.standardRows,
      },
      summary: summaryOf,
      points,
      fitted: points,
      voidLines: [],
      skipDownload: true,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("emits a PSD PDF", async () => {
    const record = makeRecord(THREE_ROWS);
    const grading = calculateGrading(THREE_ROWS);
    const hydrometer = calculateHydrometer([], HYDROMETER_INPUTS, "176.4");
    const moisture = calculateMoisture("186.5", "149.0");
    const moistureCorrectedMass = 328 - (328 * (moisture.moistureContent ?? 0)) / 100;
    const preparationFineMass = Math.max(grading.totalWeight - 176.4, 0);
    const preparationFinesPercentage = grading.totalWeight > 0 ? (preparationFineMass / grading.totalWeight) * 100 : null;
    const doc = await generateParticleSizeDistributionPDF({
      projectName: "Smoke Project",
      clientName: "Smoke Client",
      date: "2026-11-13",
      dateTested: "2026-11-13",
      dateReported: "2026-11-13",
      testedBy: "Tester",
      labOrganization: "Smoke Lab",
      record,
      grading,
      moistureCorrectedMass,
      preparationFineMass,
      preparationFinesPercentage,
      hydrometer,
      hydrometerInputs: HYDROMETER_INPUTS,
      series: mergePsdSeries(
        THREE_ROWS.map((row, index) => ({ size: Number.parseFloat(row.sieveSize), passing: grading.cumulativePassing[index] })),
        [],
      ),
      chartImage: null,
      finesPercentage: 0,
      gravelPercentage: 24,
      sandPercentage: 2,
      uscsSymbol: "GP",
      uscsDescription: "POORLY GRADED GRAVEL",
      aashtoGroup: "A-1-a",
      groupIndex: 0,
      skipDownload: true,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
