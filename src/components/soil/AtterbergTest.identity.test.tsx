import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtterbergTest from "@/components/soil/AtterbergTest";
import { ProjectContext } from "@/context/ProjectContext";
import { TestAccordionProvider } from "@/context/TestAccordionContext";
import { TooltipProvider } from "@/components/ui/tooltip";

const atterbergMocks = vi.hoisted(() => ({ listRecords: vi.fn() }));

vi.mock("@/lib/api", () => ({
  listRecords: atterbergMocks.listRecords,
  fetchFullProject: vi.fn(),
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  updateRecord: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("atterbergProjectState", JSON.stringify({
    projectName: "Different project",
    records: [{ title: "Stale sample", tests: [] }],
  }));
  atterbergMocks.listRecords.mockReset().mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Atterberg selected-project hydration", () => {
  it("does not reuse another project’s local draft when the selected project has no Atterberg row", async () => {
    render(
      <MemoryRouter initialEntries={["/tests?projectId=42#atterberg"]}>
        <ProjectContext.Provider value={{ projectName: "Grading project", clientName: "Client", date: "2026-06-12", currentProjectId: 42 }}>
          <TooltipProvider>
            <TestAccordionProvider>
              <AtterbergTest testKey="atterberg" />
            </TestAccordionProvider>
          </TooltipProvider>
        </ProjectContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("Atterberg Limits Testing"));

    expect(await screen.findByText("No records yet. Add a record to begin capturing Atterberg limit tests.")).toBeInTheDocument();
    expect(screen.queryByText("Stale sample")).not.toBeInTheDocument();
  });
});
