import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Projects from "@/pages/Projects";
import ProjectOverview from "@/pages/ProjectOverview";

const overviewMocks = vi.hoisted(() => ({
  fetchFullProject: vi.fn(),
  listRecords: vi.fn(),
  updateRecord: vi.fn(),
  updateProjectMetadata: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchFullProject: overviewMocks.fetchFullProject,
  listRecords: overviewMocks.listRecords,
  updateRecord: overviewMocks.updateRecord,
}));

vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ user: { id: 1, name: "Test User", email: "test@example.com" }, logout: vi.fn() }),
}));

vi.mock("@/context/TestDataContext", () => ({
  useTestData: () => ({ updateProjectMetadata: overviewMocks.updateProjectMetadata }),
}));

vi.mock("@/components/Navigation", () => ({ default: () => null }));

const project = {
  id: 42,
  name: "Grading project",
  client_name: "Client",
  project_date: "2026-06-01",
  lab_organization: "Cransfield Lab",
  date_reported: "2026-06-10",
  checked_by: "Reviewer",
  contractor: "Contractor Ltd",
  county: "Nairobi",
};

const Location = () => {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}${location.hash}`}</div>;
};

const renderOverview = (initialEntry = "/projects/42") => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Location />
    <Routes>
      <Route path="/projects" element={<Projects />} />
      <Route path="/projects/:projectId" element={<ProjectOverview />} />
      <Route path="/tests" element={<div>Test editor</div>} />
    </Routes>
  </MemoryRouter>,
);

afterEach(cleanup);

beforeEach(() => {
  overviewMocks.fetchFullProject.mockReset().mockResolvedValue(project);
  overviewMocks.listRecords.mockReset().mockResolvedValue({
    data: [{
      id: 88,
      project_id: 42,
      test_key: "grading",
      name: "Particle Size Distribution",
      status: "in-progress",
      updated_at: "2026-06-12 10:00:00",
    }],
  });
  overviewMocks.updateRecord.mockReset().mockResolvedValue({ data: project });
  overviewMocks.updateProjectMetadata.mockReset();
});

describe("ProjectOverview", () => {
  it("opens a selected project from the main list into its overview", async () => {
    overviewMocks.listRecords.mockImplementation((table: string) => Promise.resolve({ data: table === "projects" ? [project] : [] }));
    renderOverview("/projects");

    fireEvent.click(await screen.findByRole("button", { name: /Open/ }));
    expect(await screen.findByTestId("current-location")).toHaveTextContent("/projects/42");
  });

  it("shows saved test records and opens the selected test for the same project", async () => {
    renderOverview();

    expect(await screen.findByRole("heading", { name: "Grading project" })).toBeInTheDocument();
    expect(screen.getByText("Particle Size Distribution")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit test" }));
    expect(await screen.findByTestId("current-location")).toHaveTextContent("/tests?projectId=42&resultId=88#grading");
  });

  it("opens Atterberg with the selected project ID", async () => {
    renderOverview();

    fireEvent.click(await screen.findByRole("button", { name: "Add Atterberg" }));
    expect(await screen.findByTestId("current-location")).toHaveTextContent("/tests?projectId=42#atterberg");
  });

  it("updates project metadata by ID and syncs the saved values", async () => {
    overviewMocks.updateRecord.mockResolvedValue({ data: { ...project, name: "Updated grading project" } });
    renderOverview();

    fireEvent.click(await screen.findByRole("button", { name: "Edit project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Updated grading project" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(overviewMocks.updateRecord).toHaveBeenCalledWith("projects", 42, expect.objectContaining({
      name: "Updated grading project",
      client_name: "Client",
      project_date: "2026-06-01",
    })));
    expect(await screen.findByRole("heading", { name: "Updated grading project" })).toBeInTheDocument();
    expect(overviewMocks.updateProjectMetadata).toHaveBeenCalledWith(expect.objectContaining({
      projectName: "Updated grading project",
      currentProjectId: 42,
    }));
  });

  it("keeps unsaved values visible when the project update fails", async () => {
    overviewMocks.updateRecord.mockRejectedValue(new Error("Save failed"));
    renderOverview();

    fireEvent.click(await screen.findByRole("button", { name: "Edit project" }));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Unsaved name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByLabelText("Project name")).toHaveValue("Unsaved name");
  });
});
