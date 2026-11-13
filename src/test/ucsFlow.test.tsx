import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import UCSTest from "@/components/rock/UCSTest";

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
  useTestAccordion: () => ({ openTestKey: "ucs", setOpenTestKey: vi.fn() }),
}));

beforeEach(() => { exported.payload = null; });
afterEach(cleanup);

describe("UCS test flow", () => {
  it("computes strength from diameter/length/load and reports in-progress until the set conforms", async () => {
    render(createElement(MemoryRouter, null, createElement(TooltipProvider, null, createElement(UCSTest, { testKey: "ucs" }))));
    expect(await screen.findByText("UCS (Unconfined Compressive Strength)")).toBeInTheDocument();

    // Start: add three more specimens and zero specimens "conform" yet.
    const addSpecimens = Array.from({ length: 2 });
    for (const _ of addSpecimens) {
      fireEvent.click(screen.getByRole("button", { name: "Add Specimen" }));
    }

    const diameterInputs = screen.getAllByLabelText(/^Diameter, point/);
    const lengthInputs = screen.getAllByLabelText(/^Length, point/);
    const loadInputs = screen.getAllByLabelText(/^Load, point/);
    expect(diameterInputs.length).toBe(3);
    expect(lengthInputs.length).toBe(3);
    expect(loadInputs.length).toBe(3);

    // 50 mm dia, 125 mm length (L/D=2.5), 100 kN -> qu ~= 50.93 MPa
    diameterInputs.forEach((el) => fireEvent.change(el, { target: { value: "50" } }));
    lengthInputs.forEach((el) => fireEvent.change(el, { target: { value: "125" } }));
    loadInputs.forEach((el) => fireEvent.change(el, { target: { value: "100" } }));

    expect(screen.getAllByDisplayValue("2.50")).toHaveLength(3);
    expect(screen.getAllByDisplayValue("50.93").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exported.payload).not.toBeNull());
    expect(exported.payload!.status).toBe("in-progress");

    fireEvent.change(screen.getByLabelText("Orientation to bedding"), { target: { value: "Parallel to bedding plane" } });
    fireEvent.change(screen.getByLabelText("Stress rate (MPa/s)"), { target: { value: "0.75" } });
    fireEvent.change(screen.getByLabelText("Failure mode"), { target: { value: "Through midsection" } });
    fireEvent.change(screen.getByLabelText("Specimen ends"), { target: { value: "pass" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exported.payload!.status).toBe("completed"));
    expect(exported.payload!.data_points).toBe(3);
  });
});
