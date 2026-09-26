import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { cleanup } from "@testing-library/react";
import TestResults from "@/pages/TestResults";

const resultsMocks = vi.hoisted(() => ({ listRecords: vi.fn() }));
const contextMocks = vi.hoisted(() => ({ updateProjectMetadata: vi.fn() }));

vi.mock("@/lib/api", () => ({
  listRecords: resultsMocks.listRecords,
}));

vi.mock("@/context/TestDataContext", () => ({
  useTestData: () => ({
    tests: {},
    recordMetadata: {},
    projectMetadata: {},
    updateProjectMetadata: contextMocks.updateProjectMetadata,
  }),
}));

vi.mock("@/context/ProjectContext", () => ({
  useProject: () => ({ projectName: "", clientName: "", date: "2026-06-12", currentProjectId: 10 }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}${location.hash}`}</div>;
};

const renderResults = () =>
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(TestResults, null),
      createElement(LocationProbe, null),
    ),
  );

const gradingRow = (id: string, updatedAt: string, records: unknown[]) => ({
  id,
  project_id: "42",
  test_key: "grading",
  name: "Particle Size Distribution",
  project_name: "Grading project",
  updated_at: updatedAt,
  payload_json: { project: { records } },
});

afterEach(cleanup);

// Each test mounts the whole page, sidebar included, which is slow under parallel load.
// Passed as the waitFor options argument, not the matcher options.
const FIND = { timeout: 10000 };

beforeEach(() => {
  resultsMocks.listRecords.mockReset().mockResolvedValue({ data: [] });
  contextMocks.updateProjectMetadata.mockReset();
});

// Each test mounts the whole page, sidebar included, which is slow under parallel load.
describe("TestResults duplicate handling", () => {
  it("lists a test once when the database holds several rows for the same project and test", async () => {
    resultsMocks.listRecords.mockResolvedValue({
      data: [
        gradingRow("88", "2026-06-10 09:00:00", [{ sampleNumber: "Oldest" }]),
        gradingRow("90", "2026-06-12 09:00:00", [{ sampleNumber: "Newest" }]),
        gradingRow("89", "2026-06-11 09:00:00", [{ sampleNumber: "Middle" }]),
      ],
    });

    renderResults();

    // The depth cell renders as "Depth: <value>", so match on the value with a substring matcher.
    expect(await screen.findByText(/Newest/, undefined, FIND)).toBeInTheDocument();
    // The two older duplicates must not add extra lines to the table.
    expect(screen.queryByText(/Oldest/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Middle/)).not.toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: "Open →" }, FIND)).toHaveLength(1);
  });

  it("opens the newest row of each pair, identified by resultId", async () => {
    resultsMocks.listRecords.mockResolvedValue({
      data: [
        gradingRow("88", "2026-06-10 09:00:00", [{ sampleNumber: "Oldest" }]),
        gradingRow("90", "2026-06-12 09:00:00", [{ sampleNumber: "Newest" }]),
      ],
    });

    renderResults();
    fireEvent.click(await screen.findByRole("button", { name: "Open →" }, FIND));

    expect(await screen.findByTestId("current-location", undefined, FIND)).toHaveTextContent("/tests?projectId=42&resultId=90#grading");
  });

  it("falls back to a resumable row when the newest duplicate has no first record", async () => {
    resultsMocks.listRecords.mockResolvedValue({
      data: [
        gradingRow("88", "2026-06-10 09:00:00", [{ sampleNumber: "Resumable" }]),
        gradingRow("91", "2026-06-13 09:00:00", [null, {}]),
      ],
    });

    renderResults();

    expect(await screen.findByText(/Resumable/, undefined, FIND)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Open →" }, FIND));
    expect(await screen.findByTestId("current-location", undefined, FIND)).toHaveTextContent("/tests?projectId=42&resultId=88#grading");
  });

  it("keeps different tests of the same project as separate rows", async () => {
    resultsMocks.listRecords.mockResolvedValue({
      data: [
        gradingRow("88", "2026-06-10 09:00:00", [{ sampleNumber: "PSD" }]),
        { ...gradingRow("95", "2026-06-11 09:00:00", [{ sampleNumber: "Proctor" }]), test_key: "proctor", name: "Density/Moisture Content Relationship" },
      ],
    });

    renderResults();

    expect(await screen.findAllByRole("button", { name: "Open →" }, FIND)).toHaveLength(2);
    // Each test type is labelled on its own row.
    expect(screen.getAllByText("Particle Size Distribution").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Proctor Test").length).toBeGreaterThan(0);
  });
  it("leaves a different project's duplicate rows listed", async () => {
    resultsMocks.listRecords.mockResolvedValue({
      data: [
        gradingRow("88", "2026-06-10 09:00:00", [{ sampleNumber: "Project 42" }]),
        { ...gradingRow("99", "2026-06-11 09:00:00", [{ sampleNumber: "Project 43" }]), project_id: "43" },
      ],
    });

    renderResults();

    // Deduping is scoped to (project, test), so a second project still gets its own row.
    expect(await screen.findAllByRole("button", { name: "Open →" }, FIND)).toHaveLength(2);
  });

  it("orders the register newest first", async () => {
    // Three distinct projects, supplied oldest-first, so no dedup can collapse them and the
    // assertion cannot pass by accident through the order the rows happened to arrive in.
    resultsMocks.listRecords.mockResolvedValue({
      data: [
        { ...gradingRow("10", "2026-05-01 09:00:00", [{ sampleNumber: "Oldest" }]), project_id: "42" },
        { ...gradingRow("15", "2026-06-10 09:00:00", [{ sampleNumber: "Middle" }]), project_id: "43" },
        { ...gradingRow("20", "2026-06-20 09:00:00", [{ sampleNumber: "Newest" }]), project_id: "44" },
      ],
    });

    const { container } = renderResults();

    await screen.findByText(/Newest/, undefined, FIND);
    const depths = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
    expect(depths).toHaveLength(3);
    expect(depths[0]).toMatch(/Newest/);
    expect(depths[1]).toMatch(/Middle/);
    expect(depths[2]).toMatch(/Oldest/);
  });

  it("keeps the samples of one project together and in their stored order", async () => {
    // Both sample rows inherit the parent row's timestamp, so the stable sort has to leave
    // them adjacent and in sort_order rather than scattering them.
    const sample = (id: string, order: number, depth: string) => ({
      ...gradingRow(id, "2026-06-12 09:00:00", [{ sampleNumber: depth }]),
      project_id: "42",
      sample_key: `record-${id}`,
      sample_label: "BH01",
      sort_order: order,
    });
    resultsMocks.listRecords.mockResolvedValue({
      data: [sample("30", 0, "0.0-3.0"), sample("31", 1, "3.0-7.5"), sample("32", 2, "7.5-10.0")],
    });

    const { container } = renderResults();

    await screen.findByText(/0\.0-3\.0/, undefined, FIND);
    const depths = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent ?? "");
    expect(depths).toHaveLength(3);
    expect(depths[0]).toMatch(/0\.0-3\.0/);
    expect(depths[1]).toMatch(/3\.0-7\.5/);
    expect(depths[2]).toMatch(/7\.5-10\.0/);
  });
}, 30000);