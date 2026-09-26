import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CompressiveStrengthTest from "@/components/concrete/CompressiveStrengthTest";
import { ProjectContext } from "@/context/ProjectContext";
import { TestAccordionProvider } from "@/context/TestAccordionContext";
import { TooltipProvider } from "@/components/ui/tooltip";

const compressiveMocks = vi.hoisted(() => ({
  listCompressiveCubes: vi.fn(),
  saveCompressiveTest: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  listCompressiveCubes: compressiveMocks.listCompressiveCubes,
  saveCompressiveTest: compressiveMocks.saveCompressiveTest,
  listRecords: vi.fn(),
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  updateRecord: vi.fn(),
}));

vi.mock("@/context/TestDataContext", () => ({
  // useTestReport pushes a status summary into the context on every render, so updateTest has
  // to exist even though this suite only cares about the grid and the save.
  useTestData: () => ({ projectMetadata: {}, concreteTestMetadata: {}, updateTest: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

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
  compressiveMocks.saveCompressiveTest
    .mockReset()
    .mockResolvedValue({ testId: 7, cubeIds: [5] });
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
