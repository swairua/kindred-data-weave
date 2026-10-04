import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import GradingTest from "@/components/soil/GradingTest";
import ProctorTest from "@/components/soil/ProctorTest";

const exportState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  mcPdfPayloads: [] as Array<Record<string, unknown>>,
  psdPdfPayloads: [] as Array<Record<string, unknown>>,
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

// Proctor has its own density/moisture content sheet generator rather than the generic one.
vi.mock("@/lib/mcPdfGenerator", () => ({
  generateMoistureDensityPDF: vi.fn(async (data: Record<string, unknown>) => {
    exportState.mcPdfPayloads.push(data);
  }),
}));

// Grading has its own BS 1377-2 sheet generator rather than the generic one.
vi.mock("@/lib/psdPdfGenerator", () => ({
  generateParticleSizeDistributionPDF: vi.fn(async (data: Record<string, unknown>) => {
    exportState.psdPdfPayloads.push(data);
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
  exportState.mcPdfPayloads = [];
  exportState.psdPdfPayloads = [];
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

    await waitFor(() => expect(exportState.mcPdfPayloads).toHaveLength(1));
    const payload = exportState.mcPdfPayloads[0];

    expect(exportState.capturedIds).toEqual(["proctor-chart"]);
    expect(payload.chartImage).toBe("data:image/png;base64,iVBORw0KGgo=");

    // The signature line and the record's own test date, not the project date.
    expect(payload.testedBy).toBe("J. Doe");
    expect(payload.dateTested).toBe("2025-01-12");
    expect(payload.dateReported).toBe("2025-02-20");
    expect(payload.checkedBy).toBe("R. Checker");
    expect(payload.method).toBe("standard");

    // 3 points at 10/100, 10/102 and 10/105 water over dry soil; sorted by moisture.
    const points = payload.points as Array<{ moisture: number; dryDensity: number }>;
    expect(points).toHaveLength(3);
    expect(points[0].moisture).toBeCloseTo(9.52, 2);
    expect(points.at(-1)!.moisture).toBeCloseTo(10, 5);
    points.forEach((point) => expect(point.dryDensity).toBeGreaterThan(0));
    expect((payload.fitted as unknown[]).length).toBeGreaterThan(0);

    const summary = payload.summary as { mdd: number | null; omc: number | null };
    expect(summary.mdd).not.toBeNull();
    expect(summary.omc).not.toBeNull();
  });

  it("plots the zero, five and ten per cent air voids lines once Gs is known", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();

    fillPoints(["50", "70", "90"], ["3000", "3100", "3200"], ["140", "142", "145"], ["130", "132", "135"]);
    fireEvent.change(screen.getByLabelText("Specific gravity"), { target: { value: "2.7" } });

    await choosePdfExport("Export");

    await waitFor(() => expect(exportState.mcPdfPayloads).toHaveLength(1));
    const voidLines = exportState.mcPdfPayloads[0].voidLines as Array<{ percent: number; points: unknown[] }>;

    expect(voidLines.map((line) => line.percent)).toEqual([0, 5, 10]);
    voidLines.forEach((line) => expect(line.points.length).toBeGreaterThan(1));
  });

  it("offers the printed sheet only, with no spreadsheet exports", async () => {
    render(createElement(MemoryRouter, null, createElement(ProctorTest, { testKey: "proctor" })));
    expect(await screen.findByText(/Record results/)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Export" }), { key: "Enter" });

    expect(await screen.findByText("PDF")).toBeInTheDocument();
    expect(screen.queryByText("Excel")).not.toBeInTheDocument();
    expect(screen.queryByText("CSV")).not.toBeInTheDocument();
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

    await waitFor(() => expect(exportState.psdPdfPayloads).toHaveLength(1));
    const payload = exportState.psdPdfPayloads[0];

    expect(exportState.capturedIds).toEqual(["grading-chart"]);
    expect(payload.chartImage).toBe("data:image/png;base64,iVBORw0KGgo=");

    expect(payload.testedBy).toBe("L. Technician");
    expect(payload.dateTested).toBe("2025-01-15");
    expect(payload.dateReported).toBe("2025-02-20");
    expect(payload.checkedBy).toBe("R. Checker");

    // The BS sheet prints the fractions it classified the sample by. A 100 g sample
    // retaining 10 g on 4.75 mm and 5 g on 0.075 mm is 10 % gravel, 50 % sand and
    // 40 % fines.
    expect(payload.gravelPercentage).toBeCloseTo(10, 5);
    expect(payload.sandPercentage).toBeCloseTo(50, 5);
    expect(payload.finesPercentage).toBeCloseTo(40, 5);

    // The grading curve is handed over as a merged series ordered by ascending size,
    // which is the direction a grading curve is drawn in. The pan row is left out
    // because no percentage passes it.
    const series = payload.series as Array<{ size: number; passing: number }>;
    expect(series.map((point) => point.size)).toEqual([0.075, 0.15, 0.3, 0.425, 2, 4.75]);
    expect(series[0].passing).toBeCloseTo(40, 5);
    expect(series[5].passing).toBeCloseTo(90, 5);

    // M 145 6.4 on 40 % passing No. 200, LL 30 and PI 11 gives
    // (5)(0.15) + 0.01(25)(1) = 1.0, reported as 1.
    expect(payload.groupIndex).toBe(1);
  });
});
});