import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { clearProctorResults, loadProctorResult, saveProctorResult } from "@/lib/proctorPersistence";
import { calculateProctor, calculateProctorPoint, createProctorPayload, createProctorRows, emptyProctorRecord, getProctorRecord, type ProctorRow } from "@/lib/proctorRecords";
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

  it("selects the point with the maximum dry density as the optimum", () => {
    const rows = [
      point({ containerWetMass: "140", containerDryMass: "130" }),
      point({ moistureAdded: "70", containerWetMass: "150", containerDryMass: "132" }),
      point({ moistureAdded: "90", mouldWetMass: "3200", containerWetMass: "150", containerDryMass: "135" }),
      point({ containerNumber: "4", containerDryMass: "" }),
    ];
    expect(calculateProctor(rows, "1000")).toEqual({
      omc: (15 / 105) * 100,
      mdd: 2200 / (1 + (15 / 105)),
      bulkDensity: 2200,
    });
  });

  it("creates six A–F points for each method", () => {
    expect(createProctorRows()).toHaveLength(6);
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
    expect(calculateProctor(loaded.standardRows, "")).toEqual({ omc: 12, mdd: 1900, bulkDensity: null });
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
});
