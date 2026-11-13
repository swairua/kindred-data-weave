import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import SchmidtHammerTest from "@/components/concrete/SchmidtHammerTest";

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

vi.mock("@/lib/chartCapture", () => ({
  captureChartAsBase64: vi.fn(async () => null),
}));

vi.mock("@/context/TestAccordionContext", () => ({
  TestAccordionProvider: ({ children }: { children: ReactElement }) => children,
  useTestAccordion: () => ({ openTestKey: "ndt", setOpenTestKey: vi.fn() }),
}));

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

beforeEach(() => { exported.payload = null; });
afterEach(cleanup);

const fillRow = (values: string[]) => {
  values.forEach((value, index) => {
    if (!value) return;
    fireEvent.change(screen.getByLabelText(`R${index + 1}, point 1`), { target: { value } });
  });
};

describe("NDT rebound hammer flow", () => {
  it("positions 10 reading cells per location row", async () => {
    render(createElement(MemoryRouter, null, createElement(TooltipProvider, null, createElement(SchmidtHammerTest, { testKey: "ndt" }))));
    expect(await screen.findByText("NDT (Rebound Hammer)")).toBeInTheDocument();
    expect(screen.getByLabelText("R10, point 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("R11, point 1")).not.toBeInTheDocument();
  });

  it("averages the 10 readings and reports in-progress until the documentation is complete", async () => {
    render(createElement(MemoryRouter, null, createElement(TooltipProvider, null, createElement(SchmidtHammerTest, { testKey: "ndt" }))));
    expect(await screen.findByText("NDT (Rebound Hammer)")).toBeInTheDocument();

    fillRow(["42", "44", "40", "43", "45", "41", "42", "38", "45", "44"]);

    // Average of [42,44,40,43,45,41,42,38,45,44] = 42.4
    expect(screen.getByDisplayValue("42.4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exported.payload).not.toBeNull());
    expect(exported.payload!.status).toBe("in-progress");
    expect(Array.isArray((exported.payload!.payload_json as { rows: unknown[] }).rows)).toBe(true);

    fireEvent.change(screen.getByLabelText("Impact orientation"), { target: { value: "Horizontal (perpendicular to surface)" } });
    fireEvent.change(screen.getByLabelText("Surface condition"), { target: { value: "Smooth (trowelled / formed)" } });
    fireEvent.change(screen.getByLabelText("Anvil calibration"), { target: { value: "58" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(exported.payload!.status).toBe("completed"));
  });

  it("marks all rows with discarded-cell highlighting when outliers exceed the 12% limit", async () => {
    render(createElement(MemoryRouter, null, createElement(TooltipProvider, null, createElement(SchmidtHammerTest, { testKey: "ndt" }))));
    expect(await screen.findByText("NDT (Rebound Hammer)")).toBeInTheDocument();

    fillRow(["42", "42", "42", "42", "42", "42", "42", "42", "42", "90"]);

    // The 90 outlier is discarded at the 12% rule; the retained average is 42.0 and cell R10 is flagged amber.
    expect(screen.getByDisplayValue("42.0")).toBeInTheDocument();
    expect(screen.getByLabelText("R10, point 1").className).toContain("border-amber-500");
  });
});
