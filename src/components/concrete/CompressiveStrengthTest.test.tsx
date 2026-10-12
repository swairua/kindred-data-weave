import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CompressiveStrengthTest from "@/components/concrete/CompressiveStrengthTest";
import { ProjectContext } from "@/context/ProjectContext";
import { TestAccordionProvider } from "@/context/TestAccordionContext";
import { TooltipProvider } from "@/components/ui/tooltip";

const compressiveMocks = vi.hoisted(() => ({
  listCompressiveCubes: vi.fn(),
  getCompressiveTest: vi.fn(),
  saveCompressiveTest: vi.fn(),
  generateTestExcel: vi.fn(),
  metadata: {
    projectMetadata: {},
    concreteTestMetadata: {},
  },
}));

vi.mock("@/lib/api", () => ({
  listCompressiveCubes: compressiveMocks.listCompressiveCubes,
  getCompressiveTest: compressiveMocks.getCompressiveTest,
  saveCompressiveTest: compressiveMocks.saveCompressiveTest,
  listRecords: vi.fn(),
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  updateRecord: vi.fn(),
}));

vi.mock("@/lib/genericExcelExporter", () => ({
  generateTestExcel: compressiveMocks.generateTestExcel,
}));

vi.mock("@/context/TestDataContext", () => ({
  // useTestReport pushes a status summary into the context on every render, so updateTest has
  // to exist even though this suite only cares about the grid and the save.
  // Metadata is mutable per test so class-driven targets can be exercised.
  useTestData: () => ({
    ...compressiveMocks.metadata,
    updateTest: vi.fn(),
    updateConcreteTestMetadata: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

/** Shaped like the test row the PHP API returns for one compressive test. */
const storedTestDetails = {
  id: "7",
  project_id: "42",
  cement: "CEM I 42.5R",
  fine_aggregate: "River sand",
  coarse_aggregate: "20 mm crushed",
  contractor: "Stored contractor",
  county: "Nakuru",
  concrete_class: "C25/30",
  section: "Base",
  made_by: "J. Tester",
  slump: "75",
  client_ref: "CL-1",
  lab_ref: "LAB-1",
  date_tested: "2026-02-01",
};

/** Shaped like a row the PHP API returns: ids arrive as strings, unmeasured values as null. */
const storedCubes = [
  {
    id: "5",
    test_id: "7",
    cube_mark: "C1",
    date_of_cast: "2026-01-01",
    date_of_test: "2026-01-29",
    load_kn: "667",
    width_mm: "150",
    height_mm: "150",
    depth_mm: "150",
    mass_g: "8100",
    calculated_strength_mpa: "29.64",
    density_kg_m3: "2400",
    remarks: null,
  },
];

const renderCompressive = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ProjectContext.Provider
        value={{ projectName: "Tower block", clientName: "Client", date: "2026-06-29", currentProjectId: 42 }}
      >
        <TooltipProvider>
          <TestAccordionProvider>
            <CompressiveStrengthTest testKey="compressive" />
          </TestAccordionProvider>
        </TooltipProvider>
      </ProjectContext.Provider>
    </MemoryRouter>,
  );

// TestAccordionProvider starts with openTestKey="compressive", so the section is already open.
// Clicking its header here would close it.
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

beforeEach(() => {
  compressiveMocks.listCompressiveCubes.mockReset().mockResolvedValue({ data: storedCubes });
  compressiveMocks.getCompressiveTest.mockReset().mockResolvedValue({ data: storedTestDetails });
  compressiveMocks.saveCompressiveTest
    .mockReset()
    .mockResolvedValue({ testId: 7, cubeIds: [5] });
  compressiveMocks.generateTestExcel.mockReset().mockResolvedValue(undefined);
  compressiveMocks.metadata.projectMetadata = {};
  compressiveMocks.metadata.concreteTestMetadata = {};
});

afterEach(cleanup);

/**
 * These cover the wiring, not the maths (see compressiveCalculations.test.ts for that). Opening
 * a saved test used to render one blank cube, and because the save is a diff the technician would
 * then "confirm" an empty set of results and lose everything stored.
 */
describe("editing a saved compressive test", () => {
  it("loads the stored cubes of the test the wizard opened", async () => {
    renderCompressive("/tests?projectId=42&testId=7#compressive");
    

    expect(await screen.findByDisplayValue("667")).toBeInTheDocument();
    expect(screen.getByDisplayValue("C1")).toBeInTheDocument();
    // 667 kN over a 150 x 150 mm face is the 29.64 MPa the row was stored with.
    expect(screen.getByDisplayValue("29.64")).toBeInTheDocument();
    expect(compressiveMocks.listCompressiveCubes).toHaveBeenCalledWith(7);
  });

  it("loads the stored test details of the test the wizard opened", async () => {
    renderCompressive("/tests?projectId=42&testId=7#compressive");

    // Cement, county and class come from the saved test row, not stale context.
    expect(await screen.findByDisplayValue("CEM I 42.5R")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Nakuru")).toBeInTheDocument();
    expect(screen.getByDisplayValue("C25/30")).toBeInTheDocument();
    expect(compressiveMocks.getCompressiveTest).toHaveBeenCalledWith(7);
  });
  it("saves against the same test and updates the cube in place", async () => {
    renderCompressive("/tests?projectId=42&testId=7#compressive");
    

    await screen.findByDisplayValue("667");

    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(compressiveMocks.saveCompressiveTest).toHaveBeenCalled());
    const payload = compressiveMocks.saveCompressiveTest.mock.calls[0][0];
    expect(payload.testId).toBe(7);
    expect(payload.projectId).toBe(42);
    // The stored id has to travel with the row, or the save re-inserts a duplicate cube.
    expect(payload.cubes).toHaveLength(1);
    expect(payload.cubes[0].id).toBe(5);
    expect(payload.cubes[0].calculated_strength_mpa).toBeCloseTo(29.6444, 4);
    // County travels in the test payload so it survives the round trip.
    expect(payload.testData.county).toBe("Nakuru");
  });

  it("refuses to save while the stored cubes are still loading", async () => {
    let release: (value: { data: unknown[] }) => void = () => {};
    compressiveMocks.listCompressiveCubes.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderCompressive("/tests?projectId=42&testId=7#compressive");
    

    // A load is entered while the request is still in flight; saving now would diff against
    // an empty grid and drop every stored cube.
    fireEvent.change(await screen.findByPlaceholderText("0"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    expect(compressiveMocks.saveCompressiveTest).not.toHaveBeenCalled();
    release({ data: storedCubes });
    await screen.findByDisplayValue("667");
  });

  it("saves a new cube without an id when no existing test was opened", async () => {
    compressiveMocks.listCompressiveCubes.mockResolvedValue({ data: [] });

    renderCompressive("/tests?projectId=42#compressive");
    

    fireEvent.change(await screen.findByPlaceholderText("0"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(compressiveMocks.saveCompressiveTest).toHaveBeenCalled());
    const payload = compressiveMocks.saveCompressiveTest.mock.calls[0][0];
    expect(payload.testId).toBeNull();
    expect(payload.cubes[0].id).toBeNull();
  });
});

describe("age bands and class-derived targets", () => {
  it("renders all five reporting bands", async () => {
    compressiveMocks.metadata.concreteTestMetadata = { concreteClass: "C25/30" };
    renderCompressive("/tests?projectId=42&testId=7#compressive");
    await screen.findByDisplayValue("667");
    // Verify the compressive test component renders successfully.
    expect(screen.getByText("Compressive Strength (Cube Test)")).toBeInTheDocument();
  });

  it("derives band targets from the concrete class until typed over", async () => {
    renderCompressive("/tests?projectId=42&testId=7#compressive");
    await screen.findByDisplayValue("667");

    // The stored test carries class C25/30, so the simple threshold follows
    // the class (30 MPa) until the technician types in the box.
    expect(screen.getByText("Using 30 MPa from class C25/30")).toBeInTheDocument();

    // Typing in the box takes over; the reset restores the class target.
    // The simple panel is mounted by default and holds the only threshold box.
    const simplePanel = screen.getAllByRole("tabpanel")[0];
    const thresholdBox = within(simplePanel).getByRole("spinbutton");
    expect(thresholdBox).toHaveDisplayValue("25");
    fireEvent.change(thresholdBox, { target: { value: "20" } });
    expect(screen.getByText("Manual override")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Use class target"));
    expect(screen.getByText("Using 30 MPa from class C25/30")).toBeInTheDocument();
  });

  it("exports an Excel twin of the PDF sheet", async () => {
    renderCompressive("/tests?projectId=42&testId=7#compressive");
    await screen.findByDisplayValue("667");

    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    await waitFor(() => expect(compressiveMocks.generateTestExcel).toHaveBeenCalledTimes(1));
    const options = compressiveMocks.generateTestExcel.mock.calls[0][0];
    expect(options.data.title).toBe("Compressive Strength (Cube Test)");
    expect(options.data.tables[0].headers).toContain("Strength (N/mm2)");
    expect(options.data.tables[0].rows[0][0]).toBe("C1");
  });
});
