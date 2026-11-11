import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import Index from "@/pages/Index";

const indexMocks = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  listRecords: vi.fn(),
  fetchFullProject: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchCurrentUser: indexMocks.fetchCurrentUser,
  listRecords: indexMocks.listRecords,
  fetchFullProject: indexMocks.fetchFullProject,
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  debugAuthState: vi.fn(),
  debugApiConnectivity: vi.fn(),
  updateRecord: vi.fn(),
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
}));

vi.mock("@/context/TestDataContext", () => ({
  useTestData: () => ({
    tests: {
      atterberg: { id: "atterberg", name: "Atterberg Limits", category: "soil", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 1 },
      grading: { id: "grading", name: "Particle Size Distribution", category: "soil", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 2 },
      compressive: { id: "compressive", name: "Compressive Strength Test", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 1 },
      coring: { id: "coring", name: "Coring", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 2 },
      ndt: { id: "ndt", name: "NDT (Rebound Hammer)", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 3 },
      schmidt_rock: { id: "schmidt_rock", name: "Schmidt Hammer Test", category: "rock", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 1 },
      ucs: { id: "ucs", name: "UCS Test", category: "rock", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 2 },
      pointload: { id: "pointload", name: "Point Load Test", category: "rock", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 3 },
      // A disabled test must never be listed.
      porosity: { id: "porosity", name: "Porosity Test", category: "rock", status: "not-started", dataPoints: 0, keyResults: [], enabled: false, sortOrder: 99 },
    },
    testDefinitions: [],
    testDefinitionsLoading: false,
    testDefinitionsError: null,
    refreshTestDefinitions: vi.fn(),
    updateProjectMetadata: vi.fn(),
    updateTest: vi.fn(),
    updateRecordMetadata: vi.fn(),
    updateConcreteTestMetadata: vi.fn(),
    projectMetadata: {},
    recordMetadata: {},
    concreteTestMetadata: null,
    resetProjectData: vi.fn(),
    currentProjectId: null,
  }),
}));

vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/hooks/useSessionKeepAlive", () => ({ useSessionKeepAlive: () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderIndex = (initialEntry = "/tests") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SidebarProvider>
        <Index initialTab="soil" />
      </SidebarProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("Record test page layout", () => {
  it("opens only Coring from its test hash even when the result ID is stale", async () => {
    indexMocks.fetchCurrentUser.mockResolvedValue({ id: 1, name: "Tester", email: "t@e.com" });
    indexMocks.listRecords.mockResolvedValue({ data: [] });
    indexMocks.fetchFullProject.mockResolvedValue({});

    renderIndex("/tests?projectId=59&resultId=418#coring&reload=1794402157314");

    expect(await screen.findByText("Concrete Core Testing (BS EN 12504-1:2009)")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Soil Tests" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Result 418 was not found for this project/)).not.toBeInTheDocument();
  });

  it("does not fall back to unrelated tests for an unavailable test hash", async () => {
    indexMocks.fetchCurrentUser.mockResolvedValue({ id: 1, name: "Tester", email: "t@e.com" });
    indexMocks.listRecords.mockResolvedValue({ data: [] });
    indexMocks.fetchFullProject.mockResolvedValue({});

    renderIndex("/tests#unavailable-test");

    expect(await screen.findByText("Test component not available: unavailable-test")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Soil Tests" })).not.toBeInTheDocument();
  });

  it("stacks the three classes vertically, each with its catalogue tests", async () => {
    indexMocks.fetchCurrentUser.mockResolvedValue({ id: 1, name: "Tester", email: "t@e.com" });
    indexMocks.listRecords.mockResolvedValue({ data: [] });
    indexMocks.fetchFullProject.mockResolvedValue({});

    renderIndex();

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // The three classes are stacked vertically, one after the other.
    const headings = screen.getAllByRole("heading").map((h) => h.textContent?.trim());
    const classHeadings = headings.filter((h) => h?.endsWith("Tests"));
    expect(classHeadings).toEqual(["Soil Tests", "Concrete Tests", "Rock Tests"]);

    const soil = screen.getByRole("heading", { name: "Soil Tests" });
    const concrete = screen.getByRole("heading", { name: "Concrete Tests" });
    const rock = screen.getByRole("heading", { name: "Rock Tests" });

    // Vertical stack: soil comes before concrete, which comes before rock.
    expect(soil.compareDocumentPosition(concrete) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(concrete.compareDocumentPosition(rock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Each class lists its own catalogue tests.
    expect(screen.getByText("Atterberg Limits Testing")).toBeInTheDocument();
    expect(screen.getByText("Compressive Strength (Cube Test)")).toBeInTheDocument();
    expect(screen.getByText("Point Load Test")).toBeInTheDocument();

    // A disabled test is not listed.
    expect(screen.queryByText("Porosity Test")).not.toBeInTheDocument();
  });
});
