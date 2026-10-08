import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GradingTest from "@/components/soil/GradingTest";
import { ProjectContext } from "@/context/ProjectContext";

const gradingMocks = vi.hoisted(() => ({ listRecords: vi.fn() }));

vi.mock("@/lib/api", () => ({
  listRecords: gradingMocks.listRecords,
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  updateRecord: vi.fn(),
}));

vi.mock("@/context/TestDataContext", () => ({
  useTestData: () => ({ recordMetadata: {} }),
}));

// Ids and project ids are strings because that is what the PHP API returns: `api.php` uses a plain
// `new mysqli(...)` and `hydrateRow()` only decodes `*_json` columns.
const savedResults = [
  {
    id: "88",
    project_id: "42",
    test_key: "grading",
    payload_json: { project: { records: [{ sampleNumber: "Selected sample", sampledSubmittedBy: "Sample submitter", testedBy: "Lab technician", samplePreparation: { initialDryMass: "123" } }] } },
  },
  {
    id: "89",
    project_id: "42",
    test_key: "grading",
    payload_json: { project: { records: [{ sampleNumber: "Newest sample", samplePreparation: { initialDryMass: "999" } }] } },
  },
  {
    // 100 g sample: 15 g retained on 0.6 mm, 20 g on 0.3 mm, 15 g on 0.15 mm, 5 g on 0.075 mm
    // and 45 g in the pan, so 85% passes the No. 40 sieve and 45% passes the No. 200 sieve.
    id: "90",
    project_id: "42",
    test_key: "grading",
    payload_json: {
      project: {
        records: [{
          sampleNumber: "Group index sample",
          classification: { liquidLimit: "30", plasticLimit: "19" },
          sieveRows: [
            { sieveSize: "0.6", weightRetained: "15" },
            { sieveSize: "0.425", weightRetained: "0" },
            { sieveSize: "0.3", weightRetained: "20" },
            { sieveSize: "0.15", weightRetained: "15" },
            { sieveSize: "0.075", weightRetained: "5" },
            { sieveSize: "<0.063", weightRetained: "45" },
          ],
        }],
      },
    },
  },
];

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

beforeEach(() => {
  gradingMocks.listRecords.mockReset().mockResolvedValue({ data: savedResults });
});

afterEach(cleanup);

describe("GradingTest selected record", () => {
  it("opens blank when a new record is started from an existing project", async () => {
    render(
      <MemoryRouter initialEntries={["/tests?newRecord=1&fromProject=44&sourceProjectId=42#grading"]}>
        <ProjectContext.Provider value={{ projectName: "Cloned project", clientName: "Client", date: "2026-06-12", currentProjectId: 44 }}>
          <GradingTest testKey="grading" />
        </ProjectContext.Provider>
      </MemoryRouter>,
    );

    // The form renders, but the source project's saved measurements are never copied in...
    expect(await screen.findByText("Record results — BS 1377 Part 2")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("123")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("999")).not.toBeInTheDocument();
    expect(screen.queryByText("Selected sample")).not.toBeInTheDocument();
    // ...and no stored row id is loaded, so the first save creates a new row instead of
    // updating the original project's record.
    expect(gradingMocks.listRecords).not.toHaveBeenCalled();
  });

  it("loads the saved result ID from the project overview", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/tests?projectId=42&resultId=88#grading"]}>
        <ProjectContext.Provider value={{ projectName: "Grading project", clientName: "Client", date: "2026-06-12", dateReported: "2026-06-18", currentProjectId: 42 }}>
          <GradingTest testKey="grading" />
        </ProjectContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("123")).toBeInTheDocument();
    expect(screen.getByText("Selected sample")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("999")).not.toBeInTheDocument();
    expect(screen.getByText("Record results — BS 1377 Part 2")).toBeInTheDocument();
    const sectionOrder = [
      "Sample preparation",
      "Moisture content at preparation",
      "Soil classification",
      "Wet & dry sieve analysis to BS 1377-2:1990:9.2/9.3",
      "Hydrometer analysis to BS 1377-2:1990:9.5",
      "Particle size distribution graph",
    ];
    const sectionOffsets = sectionOrder.map((title) => container.textContent?.indexOf(title) ?? -1);
    expect(sectionOffsets).toEqual([...sectionOffsets].sort((a, b) => a - b));
    expect(screen.getByText("Group Index")).toBeInTheDocument();
    expect(screen.getByText("Atterberg")).toBeInTheDocument();
    // The grading curve is now the BS 1377-2 sheet, so the ASTM fraction legend is gone.
    expect(screen.getByText("SILT FRACTION")).toBeInTheDocument();
    expect(screen.getByText("SAND FRACTION")).toBeInTheDocument();
    expect(screen.getByText("GRAVEL FRACTION")).toBeInTheDocument();
    expect(screen.queryByText("Fines (<0.075 mm)")).not.toBeInTheDocument();
    // CLAY and COBBLES each appear twice: once on the sub-fraction row and once on
    // the fraction band row, so they are matched by quantity rather than uniquely.
    expect(screen.getAllByText("CLAY")).toHaveLength(2);
    expect(screen.getAllByText("COBBLES")).toHaveLength(2);
    expect(screen.getAllByText("Fine")).toHaveLength(3);
    expect(screen.getAllByText("Medium")).toHaveLength(3);
    expect(screen.getAllByText("Coarse")).toHaveLength(3);
    expect(screen.getByText("FRACTION")).toBeInTheDocument();
    expect(screen.getByText("Passing (%)")).toBeInTheDocument();
    expect(screen.getByText("Particle size (mm)")).toBeInTheDocument();
    expect(screen.getByText("PARTICLE SIZE DISTRIBUTION GRAPH")).toBeInTheDocument();
    expect(screen.getByText("Lab technician")).toBeInTheDocument();
    expect(screen.queryByText("Sample submitter")).not.toBeInTheDocument();
    expect(screen.getByText("2026-06-18")).toBeInTheDocument();
    expect(screen.getByText("Scroll →")).toBeInTheDocument();
    expect(screen.getByText("Particle size distribution graph")).toBeInTheDocument();
    expect(screen.getByText("Hydrometer analysis to BS 1377-2:1990:9.5")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Export options" }), { key: "Enter" });
    // The grading report is issued as a PDF sheet only; no spreadsheet formats are offered.
    expect(await screen.findByText("PDF")).toBeInTheDocument();
    expect(screen.queryByText("Excel")).not.toBeInTheDocument();
    expect(screen.queryByText("CSV")).not.toBeInTheDocument();
  });

  it("takes the AASHTO group index from the No. 200 sieve, not the No. 40 sieve", async () => {
    render(
      <MemoryRouter initialEntries={["/tests?projectId=42&resultId=90#grading"]}>
        <ProjectContext.Provider value={{ projectName: "Grading project", clientName: "Client", date: "2026-06-12", currentProjectId: 42 }}>
          <GradingTest testKey="grading" />
        </ProjectContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Group index sample")).toBeInTheDocument();
    // 45% passing No. 200 with LL 30 and PI 11 gives (10)(0.15) + 0.01(30)(1) = 1.8 → 2.
    // The 85% passing No. 40 of the same sample would have reported 8.
    expect(screen.getByText("Group Index").closest("label")).toHaveTextContent("Group Index2");
  });
});
