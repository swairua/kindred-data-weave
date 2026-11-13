import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import PointLoadTest from "@/components/rock/PointLoadTest";

const exported = vi.hoisted(() => ({
  payload: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/testResultPersistence", () => ({
  loadTestResult: vi.fn(async () => null),
  saveTestResult: vi.fn(async (_projectId: number, _recordId: number | null, data: Record<string, unknown>) => {
    exported.payload = data;
    return 999;
  }),
}));

vi.mock("@/context/ProjectContext", () => ({
  useProject: () => ({
    projectName: "Export Project",
    clientName: "Export Client",
    date: "2025-02-01",
    projectDate: "2025-02-01",
    currentProjectId: 42,
    labOrganization: "Test Laboratory",
    dateReported: "2025-02-20",
    checkedBy: "R. Checker",
  }),
}));

vi.mock("@/context/TestDataContext", () => ({
  useTestData: () => ({ recordMetadata: {}, updateTest: vi.fn() }),
}));

vi.mock("@/context/TestAccordionContext", () => ({
  TestAccordionProvider: ({ children }: { children: ReactElement }) => children,
  useTestAccordion: () => ({ openTestKey: "pointload", setOpenTestKey: vi.fn() }),
}));

beforeEach(() => { exported.payload = null; });
afterEach(cleanup);

describe("Point load test flow", () => {
  it("computes Is and Is(50), reports in-progress, then completed after orientation and enough specimens are added", { timeout: 30000 }, async () => {
    render(createElement(MemoryRouter, null, createElement(TooltipProvider, null, createElement(PointLoadTest, { testKey: "pointload" }))));
    expect(await screen.findByText("Point Load Test")).toBeInTheDocument();

    // Add up to 10 specimens.
    for (let i = 1; i < 10; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add Specimen" }));
    }

    const loadInputs = screen.getAllByLabelText(/^Load, point/);
    const deInputs = screen.getAllByLabelText(/^De, point/);
    expect(loadInputs.length).toBe(10);
    expect(deInputs.length).toBe(10);

    loadInputs.forEach((el) => fireEvent.change(el, { target: { value: "2.5" } }));
    deInputs.forEach((el) => fireEvent.change(el, { target: { value: "54" } }));

    // Is = 2500/(54^2) ≈ 0.857 MPa; Is(50) ≈ 0.857 * (54/50)^0.75 ≈ 0.905 MPa
    const isCells = screen.getAllByDisplayValue(/0\.857/);
    expect(isCells.length).toBe(10);
    const is50Cells = screen.getAllByDisplayValue(/0\.908/);
    expect(is50Cells.length).toBe(10);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exported.payload).not.toBeNull());
    expect(exported.payload!.status).toBe("in-progress");

    fireEvent.change(screen.getByLabelText("Orientation to bedding"), { target: { value: "Parallel to bedding plane" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exported.payload!.status).toBe("completed"));
    expect(exported.payload!.data_points).toBe(10);
  });
});
