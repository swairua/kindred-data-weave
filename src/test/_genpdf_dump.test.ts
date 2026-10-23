import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
vi.mock("@/lib/imageUtils", () => ({ fetchAdminImagesAsBase64: async () => ({}) }));
import { generateCompressiveStrengthPDF, type CompressiveRecordView } from "../lib/compressivePdfGenerator";
import { generateParticleSizeDistributionPDF } from "../lib/psdPdfGenerator";
import { calculateGrading, calculateHydrometer } from "../lib/gradingCalculations";
import { mergePsdSeries } from "../lib/psdChartGeometry";
import { type CompressiveCubeInput } from "../lib/compressiveCalculations";

describe("dump", () => {
  it("cube", async () => {
    const rec: CompressiveRecordView = {
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
    const rows: CompressiveCubeInput[] = [
      { id: null, mark: "", dateOfCast: "2026-09-19", dateOfTest: "2026-09-26", load: "564.1", width: "150", height: "150", depth: "150", mass: "7927", remarks: "" },
      { id: null, mark: "", dateOfCast: "2026-09-19", dateOfTest: "2026-09-26", load: "484.6", width: "150", height: "150", depth: "150", mass: "7971", remarks: "" },
    ];
    const doc = await generateCompressiveStrengthPDF({
      projectName: "Proposed Residential Development in Nairobi",
      clientName: "Venus Engineering and Construction Limited",
      dateReported: "2026-09-28",
      testedBy: "Paul",
      checkedBy: "",
      record: rec,
      rows,
      skipDownload: true,
    });
    fs.writeFileSync("_fresh_cube_now.pdf", Buffer.from(doc.output("arraybuffer")));
    expect(true).toBe(true);
  });
  it("psd", async () => {
    const FULL_SIEVE = [
      ["63", "0"], ["50", "0"], ["37.5", "0"], ["28", "0"], ["20", "14.5"], ["14", "6.5"],
      ["10", "8.0"], ["6.3", "8.0"], ["5", "6.5"], ["3.35", "4.5"], ["2.36", "8.0"],
      ["1.18", "5.5"], ["0.6", "2.0"], ["0.425", "0.5"], ["0.3", "1.0"], ["0.15", "1.5"],
      ["0.075", "2.5"], ["0.063", "0.0"], ["<0.063", "176.4"],
    ].map(([sieveSize, weightRetained]) => ({ sieveSize, weightRetained }));
    const hydrometerInputs = {
      dryWeight: "176.4", suspensionVolume: "1000", sG: "2.65", temperature: "20",
      hydrometerType: "152H", zeroCorrection: "0", meniscusCorrection: "0.1",
      temperatureCorrection: "0", kFactor: "",
    };
    const FULL_HYDROMETER = ["0.25", "0.5", "1", "2", "4", "8", "15", "30", "60", "120", "240", "480", "1440"]
      .map((time) => ({ time, actualHydrometer: "48" }));
    const grading = calculateGrading(FULL_SIEVE.map((r) => ({ sieveSize: r.sieveSize, weightRetained: r.weightRetained })));
    const hydrometer = calculateHydrometer(FULL_HYDROMETER, hydrometerInputs, "176.4");
    const series = mergePsdSeries(
      FULL_SIEVE.map((row, index) => ({ size: Number.parseFloat(row.sieveSize), passing: grading.cumulativePassing[index] })),
      hydrometer.results.map((result) => ({ size: result.particleDiameter, passing: result.finesByHydrometer })),
    );
    const doc = await generateParticleSizeDistributionPDF({
      projectName: "KIRIAINI AHP",
      clientName: "SDHUD",
      date: "2026-06-11",
      dateTested: "2026-06-11",
      dateReported: "2026-06-13",
      testedBy: "JILLO",
      checkedBy: "",
      labOrganization: "Cransfield Materials Testing Center",
      record: {
        label: "BH1", sampleNumber: "-", sampleDepthFrom: "0.0", sampleDepthTo: "25.0",
        sampledSubmittedBy: "Cransfield", testedBy: "JILLO", dateSubmitted: "2026-06-09",
        dateTested: "2026-06-11", samplePreparation: { initialDryMass: "328.0", washedOvenDryMass: "176.4" },
        moisture: { wetMass: "186.5", dryMass: "149.0" }, sieveRows: FULL_SIEVE, hydrometerRows: FULL_HYDROMETER,
      },
      grading, hydrometer, hydrometerInputs, series,
      chartImage: null,
      gravelPercentage: 22.8, sandPercentage: 5.3, finesPercentage: 71.9,
      uscsSymbol: "MH", uscsDescription: "GRAVELLY ELASTIC SILT", aashtoGroup: "A-7-5", groupIndex: 3,
      skipDownload: true,
    });
    fs.writeFileSync("_fresh_psd_now.pdf", Buffer.from(doc.output("arraybuffer")));
    expect(true).toBe(true);
  });
});

