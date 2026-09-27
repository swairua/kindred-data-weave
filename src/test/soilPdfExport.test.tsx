import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import GradingTest from "@/components/soil/GradingTest";
import ProctorTest from "@/components/soil/ProctorTest";

const exportState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  pdfPayloads: [] as Array<Record<string, unknown>>,
  capturedIds: [] as string[],
  project: {
    projectName: "Export Project",
    clientName: "Export Client",
    date: "2025-02-01",
    projectDate: "2025-02-01",
    currentProjectId: 42,
    labOrganization: "Test Laboratory",
    dateReported: "2025-02-20",
    checkedBy: "R. Checker",
  },
  recordMetadata: {
    sampleId: "BH-09",
    sampleNumber: "4",
    sampledSubmittedBy: "J. Doe",
    dateSubmitted: "2025-01-10",
    dateTested: "2025-01-12",
    testedBy: "J. Doe",
  },
}));

vi.mock("@/lib/api", () => ({
  listRecords: vi.fn(async () => ({ data: exportState.rows })),
  createRecord: vi.fn(async (_table: string, data: Record<string, unknown>) => ({ data: { ...data, id: 1 }, id: 1 })),
  updateRecord: vi.fn(async (_table: string, id: number, data: Record<string, unknown>) => ({ data, id })),
  deleteRecord: vi.fn(async () => ({ deleted: true })),
}));

vi.mock("@/context/ProjectContext", () => ({
  useProject: () => exportState.project,
}));

vi.mock("@/context/TestDataContext", () => ({
  useTestData: () => ({ recordMetadata: { proctor: exportState.recordMetadata, grading: exportState.recordMetadata }, updateTest: vi.fn() }),
}));

// Capture the payload the report is built from instead of writing a PDF file.
vi.mock("@/lib/pdfGenerator", () => ({
  generateTestPDF: vi.fn(async (data: Record<string, unknown>) => {
    exportState.pdfPayloads.push(data);
  }),
}));

// The real capture resolves the chart by DOM id, so record what was asked for. It returns a
// data URL so the export can prove a chart reached the payload.
vi.mock("@/lib/chartCapture", () => ({
  captureChartAsBase64: vi.fn(async (elementId: string) => {
    exportState.capturedIds.push(elementId);
    return "data:image/png;base64,iVBORw0KGgo=";
  }),
}));

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

beforeEach(() => {
  exportState.rows = [];
  exportState.pdfPayloads = [];
  exportState.capturedIds = [];
});

afterEach(cleanup);

/** Opens the export menu and picks PDF. */
const choosePdfExport = async (menuName: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: menuName }), { key: "Enter" });
  const pdfItem = await screen.findByText("PDF");
  fireEvent.click(pdfItem);
};

describe("Proctor PDF export", () => {
  /** Enters the measured masses for the first n standard points; the 1 L mould is prefilled. */
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

  it("captures the curve the export resolves by id and reports who tested it", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();

    // The capture looks the chart up with getElementById, so the id must reach the element.
    expect(document.getElementById("proctor-chart")).not.toBeNull();

    fillPoints(["50", "70", "90"], ["3000", "3100", "3200"], ["140", "142", "145"], ["130", "132", "135"]);

    await choosePdfExport("Export");

    await waitFor(() => expect(exportState.pdfPayloads).toHaveLength(1));
    const payload = exportState.pdfPayloads[0];

    expect(exportState.capturedIds).toEqual(["proctor-chart"]);
    expect(Object.keys(payload.chartImages as Record<string, string>)).toEqual(["Proctor Curve"]);

    // The signature line and the record's own test date, not the project date.
    expect(payload.testedBy).toBe("J. Doe");
    expect(payload.dateTested).toBe("2025-01-12");
    expect(payload.dateReported).toBe("2025-02-20");
    expect(payload.checkedBy).toBe("R. Checker");
    expect(payload.standard).toContain("BS 1377-4:1990");
    expect(payload.standard).toContain("2.5 kg rammer");

    const labels = (payload.fields as Array<{ label: string }>).map((field) => field.label);
    expect(labels).toEqual(expect.arrayContaining(["Optimum Moisture Content", "Maximum Dry Density"]));
  });

describe("Particle Size Distribution PDF export", () => {
  it("keeps the chart, the signature details and the results summary in the report", async () => {
    // 100 g sample whose fines pass the 0.075 mm sieve, so it classifies and gains a group index.
    exportState.rows = [{
      id: "90",
      project_id: "42",
      test_key: "grading",
      payload_json: {
        project: {
          records: [{
            sampleNumber: "Export sample",
            testedBy: "L. Technician",
            dateTested: "2025-01-15",
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
          }],
        },
      },
    }];

    render(createElement(MemoryRouter, null, createElement(GradingTest, { testKey: "grading" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();
    expect(document.getElementById("grading-chart")).not.toBeNull();

    await choosePdfExport("Export options");

    await waitFor(() => expect(exportState.pdfPayloads).toHaveLength(1));
    const payload = exportState.pdfPayloads[0];

    expect(exportState.capturedIds).toEqual(["grading-chart"]);
    expect(Object.keys(payload.chartImages as Record<string, string>)).toEqual(["Particle Size Distribution Curve"]);

    expect(payload.testedBy).toBe("L. Technician");
    expect(payload.dateTested).toBe("2025-01-15");
    expect(payload.dateReported).toBe("2025-02-20");
    expect(payload.checkedBy).toBe("R. Checker");
    expect(payload.standard).toContain("BS 1377-2:1990");
    expect(payload.standard).toContain("9.5");

    // The summary the spreadsheet always carried must reach the PDF too.
    const labels = (payload.fields as Array<{ label: string }>).map((field) => field.label);
    expect(labels).toEqual(expect.arrayContaining(["D10", "D30", "D60", "Cu", "Cc", "Group Index"]));
  });
});
});