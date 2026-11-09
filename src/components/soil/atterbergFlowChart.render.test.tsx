import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/**
 * jsdom has no layout engine, so recharts' ResponsiveContainer always measures
 * 0×0 and renders nothing. Report a realistic box instead, the way a browser
 * would after the panel has been laid out.
 */
const CHART_WIDTH = 700;
const CHART_HEIGHT = 420;

class ResizeObserverStub {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback(
      [{ contentRect: { width: CHART_WIDTH, height: CHART_HEIGHT } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

const LL_TRIALS = [
  { id: "ll-1", trialNo: "1", penetration: "15.8", containerNo: "A", containerWetMass: "23.4", containerDryMass: "17.01", containerMass: "0", moisture: "" },
  { id: "ll-2", trialNo: "2", penetration: "17.95", containerNo: "B", containerWetMass: "24", containerDryMass: "17.2", containerMass: "0", moisture: "" },
  { id: "ll-3", trialNo: "3", penetration: "20.13", containerNo: "C", containerWetMass: "25.22", containerDryMass: "17.82", containerMass: "0", moisture: "" },
];

const PL_TRIALS = [
  { id: "pl-1", trialNo: "1", containerNo: "P1", containerWetMass: "10.28", containerDryMass: "7.58", containerMass: "0", moisture: "" },
  { id: "pl-2", trialNo: "2", containerNo: "P2", containerWetMass: "11.4", containerDryMass: "7.74", containerMass: "0", moisture: "" },
];

const projectRow = {
  id: 5,
  project_id: 19,
  test_key: "atterberg",
  name: "KIKUYU",
  sample_key: "record-a",
  sample_label: "BH01",
  sample_depth: "1.0-2.0",
  sort_order: 1,
  updated_at: "2026-06-12 09:00:00",
  payload_json: {
    project: {
      title: "KIKUYU",
      projectName: "KIKUYU",
      clientName: "AHP",
      date: "2026-06-12",
      records: [
        {
          id: "record-a",
          title: "Record 1",
          label: "BH01",
          isExpanded: false,
          tests: [
            { id: "test-ll", title: "Liquid Limit 1", type: "liquidLimit", isExpanded: true, trials: LL_TRIALS, result: {} },
            { id: "test-pl", title: "Plastic Limit 1", type: "plasticLimit", isExpanded: true, trials: PL_TRIALS, result: {} },
          ],
        },
      ],
    },
  },
};

const renderAtterberg = () =>
  render(
    <MemoryRouter initialEntries={["/tests?projectId=19&resultId=5#atterberg"]}>
      <ProjectContext.Provider value={{ projectName: "KIKUYU", clientName: "AHP", date: "2026-06-12", currentProjectId: 19 }}>
        <TooltipProvider>
          <TestAccordionProvider>
            <AtterbergTest testKey="atterberg" />
          </TestAccordionProvider>
        </TooltipProvider>
      </ProjectContext.Provider>
    </MemoryRouter>,
  );

const openRecord = async (container: HTMLElement) => {
  fireEvent.click(await screen.findByText("Atterberg Limits Testing"));
  await waitFor(() => expect(container.querySelector("[data-testid='atterberg-trials-grid']")).not.toBeNull());
  await waitFor(() => expect(container.querySelector("[data-record-chart]")).not.toBeNull());
};

/** Column letters across the unified trial table (empty corner cell excluded). */
const columnLetters = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-testid='atterberg-trials-grid'] thead tr:nth-child(2) th"))
    .map((th) => th.textContent?.trim())
    .filter((text) => text !== "");

const flowCurveDots = (container: HTMLElement) =>
  container.querySelectorAll("[data-record-chart] .recharts-line-dots circle");

beforeEach(() => {
  localStorage.clear();
  atterbergMocks.listRecords.mockReset().mockResolvedValue({ data: [projectRow] });
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: CHART_WIDTH, height: CHART_HEIGHT, top: 0, left: 0, right: CHART_WIDTH, bottom: CHART_HEIGHT, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

describe("Atterberg trial table", () => {
  it("offers exactly two plastic limit columns, not three", async () => {
    const { container } = renderAtterberg();
    await openRecord(container);

    // LL is padded to four columns (A–D), PL to two (E–F).
    expect(columnLetters(container)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});

describe("Atterberg flow curve", () => {
  it("draws the curve as soon as the record's trials are loaded", async () => {
    const { container } = renderAtterberg();
    await openRecord(container);

    await waitFor(() => expect(flowCurveDots(container).length).toBe(3));
    expect(screen.queryByText("Enter penetration & moisture to view the flow curve")).not.toBeInTheDocument();
  });

  it("adds the point as the next determination is fed in", async () => {
    const { container } = renderAtterberg();
    await openRecord(container);
    await waitFor(() => expect(flowCurveDots(container).length).toBe(3));

    const grid = container.querySelector("[data-testid='atterberg-trials-grid']");
    const rows = Array.from(grid?.querySelectorAll("tbody tr") ?? []);
    const cellsOf = (row: Element | undefined) => Array.from(row?.querySelectorAll("td") ?? []);
    const type = (cell: Element | undefined, value: string) => {
      const input = cell?.querySelector("input");
      expect(input).not.toBeNull();
      fireEvent.change(input as HTMLInputElement, { target: { value } });
    };

    // Penetration, then the three masses of a fourth liquid-limit determination.
    type(cellsOf(rows[1])[4], "22.0");
    type(cellsOf(rows[2])[4], "26.00");
    type(cellsOf(rows[3])[4], "18.00");
    type(cellsOf(rows[4])[4], "0");

    await waitFor(() => expect(flowCurveDots(container).length).toBe(4));
  });
});
