import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { clearProctorResults, loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { airVoidsCurve, airVoidsDensity, applyReportedOptimum, assessFieldCompaction, calculateProctor, correctForOversize, calculateProctorPoint, compactionEnergy, createProctorPayload, createProctorRows, emptyProctorRecord, fitCompactionCurve, getProctorRecord, getProctorRecords, isReportableOptimum, parseAirVoidsTargets, sampleCompactionCurve, zeroAirVoidsCurve, zeroAirVoidsDensity, type ProctorRow } from "@/lib/proctorRecords";
import { getExpectedTestType, hasRequiredSoilSampleMetadata, isInitialTestValid, isTestAllowed, toRecordMetadata } from "@/lib/recordTestWizard";
import ProctorTest from "@/components/soil/ProctorTest";

const pdfState = vi.hoisted(() => ({
  options: [] as Array<{ record: { label: string }; samples: Array<{ record: { label: string } }> }>,
  autoPrintCount: 0,
}));

const apiState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  nextId: 1,
  project: {
    projectName: "Test Project",
    clientName: "Test Client",
    date: "2025-01-01",
    projectDate: "2025-01-01",
    currentProjectId: 10,
    labOrganization: "Test Laboratory",
  },
  recordMetadata: {
    sampleId: "BH-04",
    sampleNumber: "2",
    sampleDepthFrom: "18.2",
    sampleDepthTo: "20.0",
    sampledSubmittedBy: "J. Doe",
    dateSubmitted: "2025-01-10",
    dateTested: "2025-01-12",
  },
}));

vi.mock("@/lib/mcPdfGenerator", () => ({
  generateMoistureDensityPDF: vi.fn(async (options: { record: { label: string }; samples: Array<{ record: { label: string } }> }) => {
    pdfState.options.push(options);
    return {
      autoPrint: () => { pdfState.autoPrintCount += 1; },
      output: () => "blob:proctor-test",
    };
  }),
}));

vi.mock("@/lib/api", () => ({
  listRecords: vi.fn(async () => ({ data: apiState.rows })),
  createRecord: vi.fn(async (_table: string, data: Record<string, unknown>) => {
    const row = { ...data, id: apiState.nextId++ };
    apiState.rows.push(row);
    return { data: row, id: row.id };
  }),
  updateRecord: vi.fn(async (_table: string, id: number, data: Record<string, unknown>) => {
    const rowIndex = apiState.rows.findIndex((row) => row.id === id);
    const row = { ...apiState.rows[rowIndex], ...data };
    apiState.rows[rowIndex] = row;
    return { data: row, id };
  }),
  deleteRecord: vi.fn(async (_table: string, id: number) => {
    apiState.rows = apiState.rows.filter((row) => row.id !== id);
    return { deleted: true };
  }),
}));

vi.mock("@/context/ProjectContext", () => ({
  useProject: () => apiState.project,
}));

vi.mock("@/context/TestDataContext", () => ({
  useTestData: () => ({
    recordMetadata: { proctor: apiState.recordMetadata },
    updateTest: vi.fn(),
  }),
}));

const completeSample = {
  sampleId: "BH-04",
  sampleNo: "2",
  sampleDepthFrom: "18.2",
  sampleDepthTo: "20.0",
  sampledSubmittedBy: "J. Doe",
  sampleDateSubmitted: "2025-01-10",
  sampleDateTested: "2025-01-12",
  sampleNotes: "Brown clay",
};

const point = (overrides: Partial<ProctorRow> = {}): ProctorRow => ({
  moistureAdded: "50",
  mouldWetMass: "3000",
  mouldTare: "1000",
  containerNumber: "1",
  containerWetMass: "140",
  containerDryMass: "130",
  containerTare: "30",
  ...overrides,
});

const createPayload = (sampleId: string) => {
  const record = {
    ...emptyProctorRecord({ sampleId, sampleNumber: "2", sampleDepthFrom: "18.2", sampleDepthTo: "20.0" }),
    standardMouldVolume: "1000",
    modifiedMouldVolume: "1000",
  };
  record.standardRows = [point(), point({ moistureAdded: "75", containerWetMass: "150", containerDryMass: "133" }), ...createProctorRows().slice(2)];
  record.modifiedRows = [point({ moistureAdded: "60", containerWetMass: "150", containerDryMass: "132" }), ...createProctorRows().slice(1)];
  return createProctorPayload(
    { title: "Test Project", clientName: "Test Client", date: "2025-01-01" },
    record,
    calculateProctor(record.standardRows, record.standardMouldVolume),
    calculateProctor(record.modifiedRows, record.modifiedMouldVolume),
  );
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  apiState.rows = [];
  apiState.nextId = 1;
  pdfState.options = [];
  pdfState.autoPrintCount = 0;
});

describe("Proctor wizard flow", () => {
  it("allows the enabled Proctor option only for soil and maps it to its own project type", () => {
    expect(isTestAllowed("soil", "proctor")).toBe(true);
    expect(isTestAllowed("concrete", "proctor")).toBe(false);
    expect(isInitialTestValid("soil", "proctor", true, true)).toBe(true);
    expect(isInitialTestValid("soil", "proctor", false, true)).toBe(false);
    expect(getExpectedTestType("proctor")).toBe("proctor");
  });

  it("requires PSD-equivalent sample details and transfers them to record metadata", () => {
    expect(hasRequiredSoilSampleMetadata({ ...completeSample, sampleNo: " " })).toBe(false);
    expect(hasRequiredSoilSampleMetadata(completeSample)).toBe(true);
    expect(toRecordMetadata({ ...completeSample, testedBy: "S. Technician" }).testedBy).toBe("S. Technician");
    expect(toRecordMetadata(completeSample)).toEqual({
      sampleId: "BH-04",
      sampleNumber: "2",
      sampleDepthFrom: "18.2",
      sampleDepthTo: "20.0",
      sampledSubmittedBy: "J. Doe",
      sampleNotes: "Brown clay",
      dateSubmitted: "2025-01-10",
      dateTested: "2025-01-12",
      testedBy: "J. Doe",
    });
  });
});

describe("Proctor calculations", () => {
  it("calculates wet material, bulk density, water content, dry soil, and dry density", () => {
    expect(calculateProctorPoint(point(), "1000")).toEqual({
      wetMaterialMass: 2000,
      bulkDensity: 2000,
      waterMass: 10,
      drySoilMass: 100,
      moistureContent: 10,
      dryDensity: 2000 / 1.1,
    });
  });

  it("excludes incomplete or physically invalid points", () => {
    expect(calculateProctorPoint(point({ containerDryMass: "" }), "1000").dryDensity).toBeNull();
    expect(calculateProctorPoint(point({ containerWetMass: "120" }), "1000").moistureContent).toBeNull();
    expect(calculateProctorPoint(point(), "0").bulkDensity).toBeNull();
    expect(calculateProctorPoint(point({ mouldWetMass: "900" }), "1000").dryDensity).toBeNull();
  });

  it("derives the optimum from the fitted compaction curve, not the densest single point", () => {
    const rows = [
      point({ containerWetMass: "140", containerDryMass: "130" }),
      point({ moistureAdded: "70", containerWetMass: "150", containerDryMass: "132" }),
      point({ moistureAdded: "90", mouldWetMass: "3200", containerWetMass: "150", containerDryMass: "135" }),
      point({ containerNumber: "4", containerDryMass: "" }),
    ];
    const summary = calculateProctor(rows, "1000");

    // The densest single measurement is the 14.29% / 1925 kg/m3 point, but the peak of the curve
    // through all three plots sits lower and denser: a 13.18% / 1939.68 kg/m3 vertex.
    expect(summary.optimumSource).toBe("curve");
    expect(summary.pointCount).toBe(3);
    expect(summary.omc).toBeCloseTo(13.18027, 4);
    expect(summary.mdd).toBeCloseTo(1939.6796, 3);
    expect(summary.bulkDensity).toBeCloseTo(summary.mdd! * (1 + summary.omc! / 100), 6);
    expect(summary.curve?.a).toBeCloseTo(-12.01269, 4);
    expect(summary.omc!).toBeLessThan((15 / 105) * 100);
    expect(summary.mdd!).toBeGreaterThan(2200 / (1 + 15 / 105));
  });

  it("fits the OMC and MDD through the measured peak and its two neighbours only", () => {
    const sheet = [
      { moisture: 9.1, dryDensity: 1412 },
      { moisture: 11.3, dryDensity: 1453 },
      { moisture: 13.4, dryDensity: 1488 },
      { moisture: 15.6, dryDensity: 1493 },
      { moisture: 17.6, dryDensity: 1456 },
      { moisture: 19.8, dryDensity: 1410 },
    ];
    const fit = fitCompactionCurve(sheet);

    expect(fit).not.toBeNull();
    expect(fit!.omc).toBeCloseTo(14.73, 2);
    expect(fit!.mdd).toBeCloseTo(1496.75, 0);
    expect(fitCompactionCurve(sheet.slice(2, 5))!.omc).toBeCloseTo(fit!.omc, 9);
  });

  it("places the vertex between the neighbours of the measured peak", () => {
    const fit = fitCompactionCurve([
      { moisture: 10, dryDensity: 1880 },
      { moisture: 12, dryDensity: 1890 },
      { moisture: 14, dryDensity: 1900 },
      { moisture: 16, dryDensity: 1700 },
      { moisture: 18, dryDensity: 1600 },
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.omc).toBeGreaterThan(12);
    expect(fit!.omc).toBeLessThan(16);
  });

  it("reports only a bracketed curve through at least five points as reportable", () => {
    const threePoints = calculateProctor([point(), point({ moistureAdded: "70", containerWetMass: "150", containerDryMass: "132" }), point({ moistureAdded: "90", mouldWetMass: "3200", containerWetMass: "150", containerDryMass: "135" })], "1000");
    expect(threePoints.optimumSource).toBe("curve");
    expect(isReportableOptimum(threePoints)).toBe(false);
    expect(isReportableOptimum(calculateProctor([point()], "1000"))).toBe(false);
  });

  it("computes compaction energy from the recorded effort in kJ per cubic metre", () => {
    const standard = { layers: "3", blowsPerLayer: "27", rammerMass: "2.5", dropHeight: "300" };
    const modified = { layers: "5", blowsPerLayer: "27", rammerMass: "4.5", dropHeight: "450" };
    expect(compactionEnergy(standard, "1000")).toBeCloseTo(595.96, 2);
    expect(compactionEnergy(modified, "1000")).toBeCloseTo(2681.8, 1);
    expect(compactionEnergy({ ...standard, layers: "" }, "1000")).toBeNull();
    expect(compactionEnergy(standard, "0")).toBeNull();
  });

  it("parses a list of air voids percentages and ignores invalid entries", () => {
    expect(parseAirVoidsTargets("10, 5 ,5;abc, 0, 120")).toEqual([5, 10]);
    expect(parseAirVoidsTargets("")).toEqual([]);
  });

  it("corrects the maximum dry density and optimum moisture for oversize particles", () => {
    // 20 % oversize at Gs 2.65 in a 1800 kg/m3 finer fraction (ASTM D4718).
    const corrected = correctForOversize(1800, 12, 20, 2.65);
    expect(corrected.mdd).toBeCloseTo(1923.4, 0);
    expect(corrected.omc).toBeCloseTo(9.6, 9);
    expect(correctForOversize(1800, 12, 0, 2.65)).toEqual({ mdd: 1800, omc: 12 });
  });

  it("assesses field relative compaction against the reference maximum dry density", () => {
    expect(assessFieldCompaction(1700, 1800, 95)).toEqual({ relativeCompaction: (1700 / 1800) * 100, acceptance: "fail" });
    expect(assessFieldCompaction(1800, 1800, 95).acceptance).toBe("pass");
    expect(assessFieldCompaction(1700, 1800, null).acceptance).toBe("no-limit");
    expect(assessFieldCompaction(null, 1800, 95)).toEqual({ relativeCompaction: null, acceptance: "not-assessed" });
  });

  it("warns when a measured point plots above the zero air voids line", () => {
    // A 3000 kg/m3 bulk density at 10 % moisture gives 2727 kg/m3, which Gs 2.7 cannot reach (2126 kg/m3).
    const rows = [point({ mouldWetMass: "4000" })];
    expect(calculateProctor(rows, "1000", 2.7).warnings.join(" ")).toMatch(/1 point plots above the zero air voids line/);
    expect(calculateProctor(rows, "1000").warnings.join(" ")).not.toMatch(/zero air voids/);
  });

  it("warns when the specific gravity is outside the range of mineral soils", () => {
    const rows = [point()];
    expect(calculateProctor(rows, "1000", 2).warnings.join(" ")).toMatch(/Specific gravity 2 is outside the 2.4 to 2.9 range/);
    expect(calculateProctor(rows, "1000", 2.7).warnings.join(" ")).not.toMatch(/outside the 2.4 to 2.9 range/);
    expect(calculateProctor(rows, "1000").warnings.join(" ")).not.toMatch(/outside the 2.4 to 2.9 range/);
  });

  it("replaces calculated OMC and MDD only where a reported value is entered", () => {
    const calculated = calculateProctor([
      point({ containerWetMass: "140", containerDryMass: "130" }),
      point({ moistureAdded: "70", containerWetMass: "150", containerDryMass: "132" }),
      point({ moistureAdded: "90", mouldWetMass: "3200", containerWetMass: "150", containerDryMass: "135" }),
    ], "1000");

    expect(applyReportedOptimum(calculated, "15.0", "1495")).toMatchObject({ omc: 15, mdd: 1495, optimumSource: "curve" });
    expect(applyReportedOptimum(calculated, "", "1495")).toMatchObject({ omc: calculated.omc, mdd: 1495 });
    expect(applyReportedOptimum(calculated, "", "")).toEqual(calculated);
  });

  it("requires five moisture contents for a reportable optimum and not a goodness-of-fit score", () => {
    expect(isReportableOptimum({
      omc: 14, mdd: 1500, bulkDensity: 1700, optimumSource: "curve", curve: null, pointCount: 5, warnings: [],
    })).toBe(true);
    expect(isReportableOptimum({
      omc: 14, mdd: 1500, bulkDensity: 1700, optimumSource: "curve", curve: null, pointCount: 4, warnings: [],
    })).toBe(false);
    expect(isReportableOptimum({
      omc: 14, mdd: 1500, bulkDensity: 1700, optimumSource: "peak-point", curve: null, pointCount: 6, warnings: [],
    })).toBe(false);
  });

  it("flags the curve-validity problems BS 1377-4:1990, 3.3 would not accept", () => {
    const rising = [
      point({ containerWetMass: "150", containerDryMass: "135", mouldWetMass: "3200" }),
      point({ containerWetMass: "155", containerDryMass: "137", mouldWetMass: "3250" }),
      point({ containerWetMass: "160", containerDryMass: "139", mouldWetMass: "3300" }),
      point({ containerWetMass: "165", containerDryMass: "141", mouldWetMass: "3350" }),
    ];
    const risingSummary = calculateProctor(rising, "1000");
    // Dry density is still climbing at the last point, so there is no peak to report.
    expect(risingSummary.optimumSource).toBe("peak-point");
    expect(risingSummary.warnings.join(" ")).toMatch(/has not turned over/);
    expect(risingSummary.warnings.join(" ")).toMatch(/could not be fitted/);

    const single = calculateProctor([point()], "1000");
    expect(single.optimumSource).toBe("peak-point");
    expect(single.warnings.join(" ")).toMatch(/at least 5/);

    expect(calculateProctor([], "1000")).toMatchObject({
      omc: null,
      mdd: null,
      optimumSource: "none",
      pointCount: 0,
      warnings: [],
    });
  });

  it("rejects curve fits that cannot describe a physical maximum", () => {
    expect(fitCompactionCurve([{ moisture: 10, dryDensity: 1800 }, { moisture: 12, dryDensity: 1900 }])).toBeNull();
    // Rising densities give an upward-opening curve, which has no maximum.
    expect(fitCompactionCurve([
      { moisture: 10, dryDensity: 1800 },
      { moisture: 12, dryDensity: 1900 },
      { moisture: 14, dryDensity: 2000 },
    ])).toBeNull();
    // Repeated moisture contents cannot determine a parabola.
    expect(fitCompactionCurve([
      { moisture: 10, dryDensity: 1800 },
      { moisture: 10, dryDensity: 1850 },
      { moisture: 12, dryDensity: 1900 },
    ])).toBeNull();
    // Downward opening, but the peak sits far beyond the measured range.
    expect(fitCompactionCurve([
      { moisture: 10, dryDensity: 1800 },
      { moisture: 15, dryDensity: 1900 },
      { moisture: 20, dryDensity: 1990 },
    ])).toBeNull();
  });

  it("computes zero air voids and target air voids densities from the specific gravity", () => {
    expect(zeroAirVoidsDensity(2.7, 12)).toBeCloseTo(2700 / 1.324, 6);
    expect(zeroAirVoidsDensity(2.7, 0)).toBeCloseTo(2700, 6);
    expect(zeroAirVoidsDensity(0, 12)).toBeNull();
    expect(zeroAirVoidsDensity(-2.7, 12)).toBeNull();
    // rd(na) = rd(ZAV) x (1 - na), so the 5% line is 95% of the saturation density
    expect(airVoidsDensity(5, 2.7, 12)).toBeCloseTo((2700 / 1.324) * 0.95, 6);
    expect(airVoidsDensity(5, 2.7, 12)).toBeCloseTo(1937.3112, 3);
    expect(airVoidsDensity(100, 2.7, 12)).toBeNull();
    expect(airVoidsDensity(-5, 2.7, 12)).toBeNull();

    const curve = zeroAirVoidsCurve(2.7, [10, 14]);
    expect(curve).toHaveLength(40);
    expect(curve[0].moisture).toBeCloseTo(10, 6);
    expect(curve[39].moisture).toBeCloseTo(14, 6);
    expect(curve.every((point) => point.dryDensity > 0)).toBe(true);
  });

  it("keeps the target air voids line below the zero air voids line everywhere", () => {
    // A soil can never be denser than the saturated state, so a line that is scaled up by the
    // air voids percentage is physically impossible and must never reach the chart.
    for (const airVoidsPercent of [1, 5, 10, 20]) {
      for (const moisture of [5, 12, 25]) {
        const saturation = zeroAirVoidsDensity(2.7, moisture) as number;
        const voids = airVoidsDensity(airVoidsPercent, 2.7, moisture) as number;
        expect(voids).toBeLessThan(saturation);
        expect(voids).toBeCloseTo(saturation * (1 - airVoidsPercent / 100), 9);
      }
    }
    // Zero air voids is the saturation line itself
    expect(airVoidsDensity(0, 2.7, 12)).toBeCloseTo(zeroAirVoidsDensity(2.7, 12) as number, 9);

    const range: [number, number] = [8, 20];
    const voidsCurve = airVoidsCurve(5, 2.7, range);
    const saturationCurve = zeroAirVoidsCurve(2.7, range);
    expect(voidsCurve).toHaveLength(saturationCurve.length);
    expect(voidsCurve.every((point, index) => point.dryDensity < (saturationCurve[index].dryDensity as number))).toBe(true);
  });

  it("samples the fitted curve so it can be drawn between the measured points", () => {
    const fit = fitCompactionCurve([
      { moisture: 10, dryDensity: 1818.181818 },
      { moisture: 14.2857143, dryDensity: 1925 },
      { moisture: 17.6470588, dryDensity: 1700 },
    ]);
    expect(fit).not.toBeNull();
    const curve = sampleCompactionCurve(fit!, [10, 17.6470588], 3);
    expect(curve).toHaveLength(3);
    expect(curve[0].moisture).toBeCloseTo(10, 6);
    expect(curve[2].moisture).toBeCloseTo(17.6470588, 6);
    // The drawn curve reproduces the measured points it was fitted through.
    expect(curve[0].dryDensity).toBeCloseTo(1818.1818, 2);
    expect(curve[2].dryDensity).toBeCloseTo(1700, 2);
    // Sampling the same range finely returns the fitted maximum at the fitted moisture content.
    const peakSample = sampleCompactionCurve(fit!, [10, 17.6470588], 101);
    const highest = peakSample.reduce((max, point) => (point.dryDensity > max.dryDensity ? point : max));
    expect(highest.dryDensity).toBeCloseTo(fit!.mdd, 1);
    expect(highest.moisture).toBeCloseTo(fit!.omc, 0);
  });

  it("does not require the recorded-only moisture addition or container number", () => {
    expect(calculateProctorPoint(point({ moistureAdded: "" }), "1000").dryDensity).toBeCloseTo(2000 / 1.1, 6);
    expect(calculateProctorPoint(point({ moistureAdded: "" }), "1000").wetMaterialMass).toBe(2000);
    expect(calculateProctorPoint(point({ containerNumber: "" }), "1000").moistureContent).toBeCloseTo(10, 6);
    // A negative water addition is still rejected.
    expect(calculateProctorPoint(point({ moistureAdded: "-5" }), "1000").dryDensity).toBeNull();
  });

  it("creates six A–F points for each method", () => {
    expect(createProctorRows()).toHaveLength(6);
  });

  it("defaults the 1 L mould and the air voids target but leaves the specific gravity blank", () => {
    const record = emptyProctorRecord();
    expect(record.standardMouldVolume).toBe("1000");
    expect(record.modifiedMouldVolume).toBe("1000");
    expect(record.specificGravity).toBe("");
    expect(record.airVoidsTarget).toBe("5, 10");

    const loaded = getProctorRecord({ project: { records: [{ specificGravity: "2.72", airVoidsTarget: "10" }] } });
    expect(loaded.specificGravity).toBe("2.72");
    expect(loaded.airVoidsTarget).toBe("10");
    // An older payload with no specific gravity still loads and falls back to the 5% and 10% lines.
    expect(getProctorRecord({ project: { records: [{}] } }).airVoidsTarget).toBe("5, 10");
  });

  it("normalizes legacy v1 rows without discarding directly-entered values", () => {
    const loaded = getProctorRecord({
      version: "1.0",
      project: { records: [{
        label: "BH-04",
        standardRows: [{ moisture: "9.5", dryDensity: "1880" }, { moisture: "12", dryDensity: "1900" }],
        modifiedRows: [{ moisture: "8", dryDensity: "2010" }],
      }] },
    });
    expect(loaded.standardRows).toHaveLength(6);
    expect(loaded.standardRows[0].legacy).toEqual({ moisture: "9.5", dryDensity: "1880" });
    expect(calculateProctorPoint({ ...loaded.standardRows[0], moistureAdded: "10" }, "").dryDensity).toBe(1880);
    const summary = calculateProctor(loaded.standardRows, "");
    expect(summary).toMatchObject({ omc: 12, mdd: 1900, bulkDensity: null, optimumSource: "peak-point" });
    expect(summary.curve).toBeNull();
    expect(calculateProctor(loaded.modifiedRows, "").mdd).toBe(2010);
  });

  it("round-trips both methods in the versioned payload", () => {
    const payload = createPayload("BH-04");
    const loaded = getProctorRecord(JSON.stringify(payload));
    expect(payload.version).toBe("2.0");
    expect(payload.project.records[0].label).toBe("BH-04");
    expect(loaded.standardRows).toEqual(payload.project.records[0].standardRows);
    expect(loaded.modifiedRows).toEqual(payload.project.records[0].modifiedRows);
    expect(payload.calculations.standard.omc).not.toBeNull();
    expect(payload.calculations.modified.omc).not.toBeNull();
  });

  it("round-trips and normalizes multiple sample records", () => {
    const first = emptyProctorRecord({ sampleId: "BH-04", sampleNumber: "1" });
    const second = emptyProctorRecord({ sampleId: "BH-05", sampleNumber: "2" });
    const summary = calculateProctor([], "1000");
    const payload = createProctorPayload({ title: "P", clientName: "C", date: "2025-01-01" }, first, summary, summary, [first, second]);

    expect(getProctorRecords(JSON.stringify(payload)).map((record) => [record.label, record.sampleNumber]))
      .toEqual([["BH-04", "1"], ["BH-05", "2"]]);
  });
});

describe("Proctor record persistence", () => {
  it("creates once, updates subsequent saves, and scopes load and clear by project", async () => {
    const firstPayload = createPayload("BH-04");
    const recordId = await saveProctorResult(10, null, {
      test_key: "proctor",
      category: "soil",
      payload_json: firstPayload,
    });

    expect(recordId).toBe(1);
    expect(await loadProctorResult(10)).toMatchObject({ id: 1, project_id: 10, test_key: "proctor" });

    const secondPayload = createPayload("BH-05");
    const updatedId = await saveProctorResult(10, recordId, {
      test_key: "proctor",
      category: "soil",
      payload_json: secondPayload,
    });

    expect(updatedId).toBe(recordId);
    expect(apiState.rows).toHaveLength(1);
    expect(await loadProctorResult(20)).toBeNull();

    apiState.rows.push({ id: 2, project_id: 20, test_key: "proctor" });
    apiState.rows.push({ id: 3, project_id: 10, test_key: "grading" });
    await clearProctorResults(10);
    expect(apiState.rows.map((row) => [row.project_id, row.test_key])).toEqual([[20, "proctor"], [10, "grading"]]);
  });
});

describe("Proctor record page", () => {
  /** Enters the five measured masses for the first n points; the 1 L mould is prefilled. */
  const fillPoints = (
    moistureAdded: string[],
    mouldWetMass: string[],
    containerWetMass: string[],
    containerDryMass: string[],
  ) => {
    moistureAdded.forEach((value, index) => {
      const suffix = `, point ${"ABCDEFGHIJ"[index]}`;
      fireEvent.change(screen.getByLabelText(`Moisture addition (cc)${suffix}`), { target: { value } });
      fireEvent.change(screen.getByLabelText(`Wt of mould + wet material (g)${suffix}`), { target: { value: mouldWetMass[index] } });
      fireEvent.change(screen.getByLabelText(`Wt of mould (g)${suffix}`), { target: { value: "1000" } });
      fireEvent.change(screen.getByLabelText(`Wt of container + wet material (g)${suffix}`), { target: { value: containerWetMass[index] } });
      fireEvent.change(screen.getByLabelText(`Wt of container + dry material (g)${suffix}`), { target: { value: containerDryMass[index] } });
      fireEvent.change(screen.getByLabelText(`Wt of container (g)${suffix}`), { target: { value: "30" } });
    });
  };

  it("shows saved Standard readings when the method flag is stale", async () => {
    const payload = createPayload("BH-04");
    payload.project.records[0].type = "modified";
    payload.project.records[0].modifiedRows = createProctorRows();
    apiState.rows.push({ id: 4, project_id: 10, test_key: "proctor", payload_json: payload });
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));

    expect(await screen.findByText(/Record results — BS 1377 Part 4, 3\.3/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "F" })).toBeInTheDocument();
    expect(screen.getByLabelText("Standard mould volume")).toBeInTheDocument();
    expect(screen.getByLabelText("Moisture addition (cc), point A")).toHaveValue(50);
    expect(screen.queryByRole("tab", { name: "Standard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Modified" })).not.toBeInTheDocument();
  });

  it("downloads a selected Proctor sample and prints all selected samples", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({ onload: null } as unknown as Window);
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("proctor-add-sample"));

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Download Proctor PDF");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Download 1 selected" }));
    await waitFor(() => expect(pdfState.options).toHaveLength(1));
    expect(pdfState.options[0].record.label).toBe("Sample 2");
    expect(pdfState.options[0].samples).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    fireEvent.click(screen.getByRole("button", { name: "Print all (2)" }));
    await waitFor(() => expect(pdfState.options).toHaveLength(2));
    expect(pdfState.options[1].record.label).toBe("BH-04");
    expect(pdfState.options[1].samples.map(({ record: sample }) => sample.label)).toEqual(["Sample 2"]);
    expect(pdfState.autoPrintCount).toBe(1);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("adds and switches between sample records without mixing their readings", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByTestId("proctor-sample-strip")).toHaveTextContent("Sample 1 of 1");
    fireEvent.change(screen.getByLabelText("Moisture addition (cc), point A"), { target: { value: "55" } });

    fireEvent.click(screen.getByTestId("proctor-add-sample"));
    expect(screen.getByTestId("proctor-sample-strip")).toHaveTextContent("Sample 2 of 2");
    expect(screen.getByTestId("proctor-sample-2")).toHaveTextContent("Sample 2");
    expect(screen.getByLabelText("Moisture addition (cc), point A")).toHaveValue(null);
    expect(screen.getByLabelText("Sample ID")).toHaveValue("Sample 2");
    expect(screen.getByLabelText("Sample number")).toHaveValue("");
    expect(screen.getByLabelText("Sample depth from")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Sample number"), { target: { value: "BH-05" } });
    fireEvent.change(screen.getByLabelText("Sample depth from"), { target: { value: "3.5" } });
    fireEvent.change(screen.getByLabelText("Moisture addition (cc), point A"), { target: { value: "65" } });

    fireEvent.click(screen.getByTestId("proctor-sample-1"));
    expect(screen.getByLabelText("Moisture addition (cc), point A")).toHaveValue(55);
    expect(screen.getByLabelText("Sample depth from")).toHaveValue(18.2);
    fireEvent.click(screen.getByTestId("proctor-sample-2"));
    expect(screen.getByLabelText("Moisture addition (cc), point A")).toHaveValue(65);
    expect(screen.getByLabelText("Sample depth from")).toHaveValue(3.5);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiState.rows).toHaveLength(1));
    const savedRecords = (apiState.rows[0].payload_json as { project: { records: Array<{ label: string; sampleNumber: string; sampleDepthFrom: string }> } }).project.records;
    expect(savedRecords.map((sample) => [sample.label, sample.sampleNumber, sample.sampleDepthFrom])).toEqual([
      ["BH-04", "2", "18.2"],
      ["Sample 2", "BH-05", "3.5"],
    ]);
  });

  it("opens blank when started as a new record from an existing project and saves a new row", async () => {
    // A stored record already exists for this project.
    apiState.rows.push({ id: 7, project_id: 10, test_key: "proctor", payload_json: createPayload("BH-04") });
    const storedPayload = JSON.parse(JSON.stringify(apiState.rows[0].payload_json));

    render(createElement(MemoryRouter, { initialEntries: ["/tests?newRecord=1&fromProject=10&sourceProjectId=10#proctor"] }, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();

    // The stored measurements are not repopulated...
    expect(screen.getByLabelText("Moisture addition (cc), point A")).toHaveValue(null);

    // ...so filling and saving writes a new row and leaves the stored one untouched.
    fireEvent.change(screen.getByLabelText("Moisture addition (cc), point A"), { target: { value: "55" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiState.rows).toHaveLength(2));
    expect(apiState.rows[0].id).toBe(7);
    expect(apiState.rows[0].payload_json).toEqual(storedPayload);
  });

  it("saves and reloads the expanded payload", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Standard mould volume"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Moisture addition (cc), point A"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Wt of mould + wet material (g), point A"), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText("Wt of mould (g), point A"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Container No., point A"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Wt of container + wet material (g), point A"), { target: { value: "140" } });
    fireEvent.change(screen.getByLabelText("Wt of container + dry material (g), point A"), { target: { value: "130" } });
    fireEvent.change(screen.getByLabelText("Wt of container (g), point A"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiState.rows).toHaveLength(1));
    expect(apiState.rows[0].payload_json).toMatchObject({ version: "2.0" });
    expect(apiState.rows[0].data_points).toBe(1);
  });

  it("uses the saved Standard rammer clause for the single Proctor form", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/BS 1377 Part 4, 3\.3/)).toBeInTheDocument();
    expect(screen.getByText(/Standard \(2\.5 kg rammer\)/)).toBeInTheDocument();
  });

  it("reports the fitted curve optimum for a bracketed set of moisture contents", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    fillPoints(["50", "70", "90"], ["3000", "3000", "3200"], ["140", "150", "150"], ["130", "132", "135"]);

    // The peak of the fitted curve, not the densest single measurement (which would read 14.3 / 1925).
    expect(await screen.findByText("13.2")).toBeInTheDocument();
    expect(screen.getByText("1940")).toBeInTheDocument();
    expect(screen.getByText("2195")).toBeInTheDocument();
    // Only three of the five recommended moisture contents were entered.
    expect(screen.getByText(/Only 3 moisture contents completed/)).toBeInTheDocument();
    expect(screen.getByText(/0\/6 standard points/)).toBeInTheDocument();
  });

  it("reaches Complete when the Standard sample is fully recorded", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    expect(screen.getByText(/No data/)).toBeInTheDocument();

    // Moisture 10-20% with the dry density peaking at 16%, so the curve is bracketed.
    fillPoints(
      ["50", "60", "70", "80", "90", "100"],
      ["3155", "3223", "3277", "3319", "3346", "3358"],
      ["140", "142", "144", "146", "148", "150"],
      ["130", "130", "130", "130", "130", "130"],
    );

    // Calculated masses alone do not complete a point without its recorded container number.
    expect(await screen.findByText(/In progress/)).toBeInTheDocument();
    expect(screen.getByText(/0\/6 standard points/)).toBeInTheDocument();

    for (let index = 0; index < 6; index += 1) {
      fireEvent.change(screen.getByLabelText(`Container No., point ${"ABCDEF"[index]}`), { target: { value: `C${index + 1}` } });
    }
    fireEvent.change(screen.getByLabelText("Moisture addition (cc), point A"), { target: { value: "" } });
    expect(screen.getByText(/In progress/)).toBeInTheDocument();
    expect(screen.getByText(/5\/6 standard points/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Moisture addition (cc), point A"), { target: { value: "50" } });
    expect(await screen.findByText(/Complete/)).toBeInTheDocument();
    expect(screen.getByText(/6\/6 standard points/)).toBeInTheDocument();
  });

  it("keeps the Standard record In progress until the dry density turns over", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    expect(screen.getByText(/596 kJ\/m³/)).toBeInTheDocument();

    fillPoints(
      ["50", "60", "70"],
      ["3155", "3223", "3277"],
      ["140", "142", "144"],
      ["130", "130", "130"],
    );
    for (const letter of "ABC") {
      fireEvent.change(screen.getByLabelText(`Container No., point ${letter}`), { target: { value: letter } });
    }

    expect(await screen.findByText(/In progress/)).toBeInTheDocument();
    expect(screen.getByText(/Maximum dry density sits on the outermost completed point/)).toBeInTheDocument();
  });

  it("accepts a specific gravity and saves it with the record", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Specific gravity"), { target: { value: "2.70" } });
    fireEvent.change(screen.getByLabelText("Target air voids percentage"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Wt of mould + wet material (g), point A"), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText("Wt of mould (g), point A"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Wt of container + wet material (g), point A"), { target: { value: "140" } });
    fireEvent.change(screen.getByLabelText("Wt of container + dry material (g), point A"), { target: { value: "130" } });
    fireEvent.change(screen.getByLabelText("Wt of container (g), point A"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiState.rows).toHaveLength(1));
    expect(apiState.rows[0].payload_json).toMatchObject({
      project: { records: [{ specificGravity: "2.70", airVoidsTarget: "5" }] },
    });
  });

  it("adds a point beyond F up to the cap", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    const addPoint = screen.getByRole("button", { name: "Add point" });
    for (let click = 0; click < 4; click += 1) fireEvent.click(addPoint);
    expect(screen.getByRole("columnheader", { name: "10" })).toBeInTheDocument();
    expect(addPoint).toBeDisabled();
  });
});
