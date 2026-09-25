import { cleanup, render, screen } from "@testing-library/react";
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

const savedResults = [
  {
    id: 88,
    project_id: 42,
    test_key: "grading",
    payload_json: { project: { records: [{ sampleNumber: "Selected sample", samplePreparation: { initialDryMass: "123" } }] } },
  },
  {
    id: 89,
    project_id: 42,
    test_key: "grading",
    payload_json: { project: { records: [{ sampleNumber: "Newest sample", samplePreparation: { initialDryMass: "999" } }] } },
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
  it("loads the saved result ID from the project overview", async () => {
    render(
      <MemoryRouter initialEntries={["/tests?projectId=42&resultId=88#grading"]}>
        <ProjectContext.Provider value={{ projectName: "Grading project", clientName: "Client", date: "2026-06-12", currentProjectId: 42 }}>
          <GradingTest testKey="grading" />
        </ProjectContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("123")).toBeInTheDocument();
    expect(screen.getByText("Selected sample")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("999")).not.toBeInTheDocument();
  });
});
