import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { clearProctorResults, loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { airVoidsDensity, calculateProctor, calculateProctorPoint, createProctorPayload, createProctorRows, emptyProctorRecord, fitCompactionCurve, getProctorRecord, sampleCompactionCurve, zeroAirVoidsCurve, zeroAirVoidsDensity, type ProctorRow } from "@/lib/proctorRecords";
import { getExpectedTestType, hasRequiredSoilSampleMetadata, isInitialTestValid, isTestAllowed, toRecordMetadata } from "@/lib/recordTestWizard";
import ProctorTest from "@/components/soil/ProctorTest";

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
    expect(summary.rSquared).toBeCloseTo(1, 6);
    expect(summary.curve?.a).toBeCloseTo(-12.01269, 4);
    expect(summary.omc!).toBeLessThan((15 / 105) * 100);
    expect(summary.mdd!).toBeGreaterThan(2200 / (1 + 15 / 105));
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
    expect(airVoidsDensity(5, 2.7, 12)).toBeCloseTo(2116.2868, 3);
    expect(airVoidsDensity(100, 2.7, 12)).toBeNull();
    expect(airVoidsDensity(-5, 2.7, 12)).toBeNull();

    const curve = zeroAirVoidsCurve(2.7, [10, 14]);
    expect(curve).toHaveLength(40);
    expect(curve[0].moisture).toBeCloseTo(10, 6);
    expect(curve[39].moisture).toBeCloseTo(14, 6);
    expect(curve.every((point) => point.dryDensity > 0)).toBe(true);
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
    expect(record.airVoidsTarget).toBe("5");

    const loaded = getProctorRecord({ project: { records: [{ specificGravity: "2.72", airVoidsTarget: "10" }] } });
    expect(loaded.specificGravity).toBe("2.72");
    expect(loaded.airVoidsTarget).toBe("10");
    // An older payload with no specific gravity still loads and falls back to the 5% line.
    expect(getProctorRecord({ project: { records: [{}] } }).airVoidsTarget).toBe("5");
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
    expect(summary.rSquared).toBeNull();
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

  it("shows six A–F columns and switches between independent Standard and Modified inputs", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));

    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "F" })).toBeInTheDocument();
    expect(screen.getByLabelText("Standard mould volume")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Moisture addition (cc), point A"), { target: { value: "55" } });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Modified" }), { button: 0 });
    expect(await screen.findByLabelText("Modified mould volume")).toBeInTheDocument();
    expect(screen.getByLabelText("Moisture addition (cc), point A")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Moisture addition (cc), point A"), { target: { value: "65" } });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Standard" }), { button: 0 });
    expect(screen.getByLabelText("Moisture addition (cc), point A")).toHaveValue(55);
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

  it("cites the rammer clause for each method", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/BS 1377 Part 4, 3\.3/)).toBeInTheDocument();
    expect(screen.getByText(/Standard \(2\.5 kg rammer\)/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Modified" }), { button: 0 });
    expect(await screen.findByText(/BS 1377 Part 4, 3\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Modified \(4\.5 kg rammer\)/)).toBeInTheDocument();
  });

  it("reports the fitted curve optimum for a bracketed set of moisture contents", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    fillPoints(["50", "70", "90"], ["3000", "3000", "3200"], ["140", "150", "150"], ["130", "132", "135"]);

    // The peak of the fitted curve, not the densest single measurement (which would read 14.3 / 1925).
    expect(await screen.findByText("13.2")).toBeInTheDocument();
    expect(screen.getByText("1940")).toBeInTheDocument();
    expect(screen.getByText("2195")).toBeInTheDocument();
    expect(screen.getByText("Fitted curve (R2 1.000)")).toBeInTheDocument();
    // Only three of the five recommended moisture contents were entered.
    expect(screen.getByText(/Only 3 moisture contents completed/)).toBeInTheDocument();
    expect(screen.getByText(/3\/6 standard points/)).toBeInTheDocument();
  });

  it("reaches Complete for a filled method even when the other method is empty", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    expect(screen.getByText(/No data/)).toBeInTheDocument();

    fillPoints(
      ["50", "60", "70", "80", "90", "100"],
      ["3000", "3000", "3000", "3000", "3000", "3000"],
      ["140", "140", "140", "140", "140", "140"],
      ["130", "130", "130", "130", "130", "130"],
    );

    // Completion is judged on the method on screen, not on all twelve points of both methods.
    expect(await screen.findByText(/Complete/)).toBeInTheDocument();
    expect(screen.getByText(/6\/6 standard points/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Modified" }), { button: 0 });
    expect(await screen.findByText(/No data/)).toBeInTheDocument();
    expect(screen.getByText(/0\/6 modified points/)).toBeInTheDocument();
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
