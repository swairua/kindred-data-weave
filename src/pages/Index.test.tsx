import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SessionContext } from "@/context/SessionContext";
import { toast } from "sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import Index from "@/pages/Index";

const indexMocks = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  listRecords: vi.fn(),
  fetchFullProject: vi.fn(),
  logout: vi.fn(),
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

vi.mock("@/context/TestDataContext", () => {
  const testData = {
    tests: {
      atterberg: { id: "atterberg", name: "Atterberg Limits", category: "soil", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 1 },
      grading: { id: "grading", name: "Particle Size Distribution", category: "soil", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 2 },
      compressive: { id: "compressive", name: "Compressive Strength Test", category: "concrete", status: "not-started", dataPoints: 0, keyResults: [], enabled: true, sortOrder: 1 },
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
  };
  return { useTestData: () => testData };
});

vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}{location.hash}</div>;
};

const renderIndex = (path = "/tests") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={{
        user: { id: 1, name: "Tester", email: "t@e.com" },
        logout: indexMocks.logout,
        refreshUser: vi.fn(),
      }}>
        <SidebarProvider>
          <LocationDisplay />
          <Index initialTab="soil" />
        </SidebarProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  indexMocks.fetchCurrentUser.mockResolvedValue({ id: 1, name: "Tester", email: "t@e.com" });
  indexMocks.listRecords.mockResolvedValue({ data: [] });
  indexMocks.fetchFullProject.mockResolvedValue({});
  indexMocks.logout.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("Record test page layout", () => {
  it("stacks the three classes vertically, each with its catalogue tests", async () => {
    renderIndex();

    await screen.findByRole("heading", { name: "Soil Tests" });

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

  it("preserves a focused URL when the background session ping fails", async () => {
    indexMocks.fetchCurrentUser.mockRejectedValue(new Error("Failed to fetch"));
    indexMocks.fetchFullProject.mockResolvedValue({ id: 42, name: "Focused project" });
    const path = "/tests?projectId=42&debug=1#atterberg";

    renderIndex(path);

    await waitFor(() => expect(indexMocks.fetchFullProject).toHaveBeenCalledWith(42));
    await waitFor(() => expect(indexMocks.listRecords).toHaveBeenCalledWith("projects", { limit: 100 }));
    await waitFor(() => expect(indexMocks.fetchCurrentUser).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Loaded project: Focused project"));
    expect(screen.getByTestId("location")).toHaveTextContent(path);
    expect(screen.getByText("Atterberg Limits Testing")).toBeInTheDocument();
    expect(screen.getByText("Tester")).toBeInTheDocument();
    expect(screen.getByText("t@e.com")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Soil Tests" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(indexMocks.logout).toHaveBeenCalledTimes(1);
  });
});
