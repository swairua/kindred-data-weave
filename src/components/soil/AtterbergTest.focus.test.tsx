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
 * The shape the database holds after migrate_atterberg_samples.sql: one test_results row per
 * sample, each carrying the record id in sample_key.
 */
const sampleRow = (id: number, recordId: string, label: string, sortOrder: number) => ({
  id,
  project_id: 19,
  test_key: "atterberg",
  name: "KIKUYU",
  sample_key: recordId,
  sample_label: label,
  sample_depth: `${sortOrder}.0-1.5`,
  sort_order: sortOrder,
  updated_at: "2026-06-12 09:00:00",
  payload_json: {
    project: {
      title: "KIKUYU",
      projectName: "KIKUYU",
      clientName: "AHP",
      date: "2026-06-12",
      records: [{ id: recordId, title: `Record ${sortOrder + 1}`, label, tests: [], isExpanded: false }],
    },
  },
});

const twoSamples = [sampleRow(2, "record-a", "BH01", 0), sampleRow(3, "record-b", "BH02", 1)];

const renderAtterberg = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ProjectContext.Provider
        value={{ projectName: "KIKUYU", clientName: "AHP", date: "2026-06-12", currentProjectId: 19 }}
      >
        <TooltipProvider>
          <TestAccordionProvider>
            <AtterbergTest testKey="atterberg" />
          </TestAccordionProvider>
        </TooltipProvider>
      </ProjectContext.Provider>
    </MemoryRouter>,
  );

/** The id of the single record form on screen, or null when none is rendered. */
const visibleRecordIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-atterberg-record-id]")).map(
    (node) => node.getAttribute("data-atterberg-record-id") ?? "",
  );

beforeEach(() => {
  localStorage.clear();
  atterbergMocks.listRecords.mockReset().mockResolvedValue({ data: twoSamples });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Atterberg single-sample editing", () => {
  it("opens the sample that was selected in Test Results, not every sample of the project", async () => {
    const { container } = renderAtterberg("/tests?projectId=19&resultId=3&sampleKey=record-b#atterberg");

    fireEvent.click(await screen.findByText("Atterberg Limits Testing"));

    await waitFor(() => expect(visibleRecordIds(container)).toEqual(["record-b"]));
    // The strip lists both samples so the other one is still reachable.
    expect(screen.getByTestId("atterberg-sample-record-a")).toBeInTheDocument();
    expect(screen.getByTestId("atterberg-sample-record-b")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("atterberg-sample-record-a")).toHaveAttribute("data-active", "false");
  });

  it("falls back to the row id when the sample key is not in the URL", async () => {
    const { container } = renderAtterberg("/tests?projectId=19&resultId=2#atterberg");

    fireEvent.click(await screen.findByText("Atterberg Limits Testing"));

    await waitFor(() => expect(visibleRecordIds(container)).toEqual(["record-a"]));
  });

  it("moves between samples from the strip without stacking the forms", async () => {
    const { container } = renderAtterberg("/tests?projectId=19&resultId=2#atterberg");

    fireEvent.click(await screen.findByText("Atterberg Limits Testing"));
    await waitFor(() => expect(visibleRecordIds(container)).toEqual(["record-a"]));

    fireEvent.click(screen.getByTestId("atterberg-sample-record-b"));

    await waitFor(() => expect(visibleRecordIds(container)).toEqual(["record-b"]));
  });

  it("adds the next sample in series, in the same window", async () => {
    const { container } = renderAtterberg("/tests?projectId=19&resultId=2#atterberg");

    fireEvent.click(await screen.findByText("Atterberg Limits Testing"));
    await waitFor(() => expect(visibleRecordIds(container)).toEqual(["record-a"]));

    fireEvent.click(screen.getByTestId("atterberg-add-sample"));

    // The new sample takes over the screen: still exactly one form, and the previous one is
    // no longer stacked below it.
    await waitFor(() => expect(visibleRecordIds(container)).toHaveLength(1));
    expect(visibleRecordIds(container)[0]).not.toBe("record-a");
    expect(screen.getByText("Sample 3 of 3")).toBeInTheDocument();
  });
});

describe("Atterberg new-record launch", () => {
  it("keeps the project's samples as options but opens them with blank data", async () => {
    atterbergMocks.listRecords.mockResolvedValue({
      data: [
        {
          ...sampleRow(2, "record-a", "BH01", 0),
          payload_json: {
            project: {
              title: "KIKUYU",
              projectName: "KIKUYU",
              clientName: "AHP",
              date: "2026-06-12",
              records: [{
                id: "record-a",
                title: "Record 1",
                label: "BH01",
                isExpanded: false,
                note: "Old note",
                dateTested: "2026-06-01",
                testedBy: "Old technician",
                results: { liquidLimit: 26 },
                tests: [{
                  id: "test-ll-1",
                  title: "Liquid Limit 1",
                  type: "liquidLimit",
                  isExpanded: true,
                  trials: [
                    { id: "trial-1", trialNo: "1", penetration: "7", containerNo: "201", containerWetMass: "45.50", containerDryMass: "39.20", containerMass: "12.00", moisture: "18.6" },
                  ],
                  result: { liquidLimit: 26 },
                }],
              }],
            },
          },
        },
        sampleRow(3, "record-b", "BH02", 1),
      ],
    });

    const { container } = renderAtterberg("/tests?newRecord=1&fromProject=19&sourceProjectId=19#atterberg");

    fireEvent.click(await screen.findByText("Atterberg Limits Testing"));

    // Both samples stay listed as the options to choose from...
    await waitFor(() => expect(screen.getByTestId("atterberg-sample-record-a")).toBeInTheDocument());
    expect(screen.getByTestId("atterberg-sample-record-b")).toBeInTheDocument();

    // ...and opening one shows the trial grid with none of the saved report data.
    fireEvent.click(screen.getByTestId("atterberg-sample-record-a"));
    await waitFor(() => expect(visibleRecordIds(container)).toEqual(["record-a"]));
    expect(container.querySelector("[data-testid='atterberg-trials-grid'] input")).not.toBeNull();
    expect(screen.queryByDisplayValue("45.50")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("39.20")).not.toBeInTheDocument();
    expect(screen.queryByText("Old technician")).not.toBeInTheDocument();
  });
});
