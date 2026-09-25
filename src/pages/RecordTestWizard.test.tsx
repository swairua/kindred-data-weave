import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RecordTestWizard from "@/pages/RecordTestWizard";

const wizardMocks = vi.hoisted(() => ({
  listRecords: vi.fn(),
  fetchFullProject: vi.fn(),
  createRecord: vi.fn(),
  listCompressiveTests: vi.fn(),
  refreshTestDefinitions: vi.fn(),
  updateProjectMetadata: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  listRecords: wizardMocks.listRecords,
  fetchFullProject: wizardMocks.fetchFullProject,
  createRecord: wizardMocks.createRecord,
  listCompressiveTests: wizardMocks.listCompressiveTests,
  setSessionToken: vi.fn(),
  logoutUser: vi.fn(),
}));

vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ user: { id: 1, name: "Test User", email: "test@example.com" }, logout: vi.fn() }),
}));

vi.mock("@/context/TestDataContext", () => ({
  useTestData: () => ({
    testDefinitions: [{ test_key: "proctor", name: "Density/Moisture Content Relationship", category: "soil", sort_order: 1, enabled: true }],
    testDefinitionsLoading: false,
    testDefinitionsError: null,
    refreshTestDefinitions: wizardMocks.refreshTestDefinitions,
    updateProjectMetadata: wizardMocks.updateProjectMetadata,
    updateRecordMetadata: vi.fn(),
    updateConcreteTestMetadata: vi.fn(),
  }),
}));

vi.mock("@/lib/testRegistry", () => ({ registry: { hasTest: () => true } }));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const renderWizard = () => render(
  <MemoryRouter initialEntries={["/record?material=soil&test=proctor"]}>
    <RecordTestWizard />
  </MemoryRouter>,
);

afterEach(cleanup);

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  sessionStorage.clear();
  wizardMocks.listRecords.mockReset().mockResolvedValue({ data: [] });
  wizardMocks.fetchFullProject.mockReset().mockResolvedValue({ id: 42, name: "Existing project", client_name: "Client" });
  wizardMocks.createRecord.mockReset().mockResolvedValue({ data: { id: 43 } });
  wizardMocks.listCompressiveTests.mockReset().mockResolvedValue({ data: [] });
  wizardMocks.refreshTestDefinitions.mockReset().mockResolvedValue(undefined);
  wizardMocks.updateProjectMetadata.mockReset();
});

describe("RecordTestWizard project loading", () => {
  it("does not reload a successful empty result and keeps project creation available", async () => {
    renderWizard();

    const selector = await screen.findByRole("combobox", { name: "Project" });
    expect(await screen.findByText("No existing projects for this test. Create a new project to continue.")).toBeInTheDocument();
    expect(selector).toBeDisabled();
    expect(wizardMocks.listRecords).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "New project" })).toBeEnabled();
  });

  it("treats projects filtered out by the selected test as an empty successful result", async () => {
    wizardMocks.listRecords.mockResolvedValue({
      data: [{ id: 41, name: "Grading project", client_name: "Client", project_date: null, test_type: "grading" }],
    });
    renderWizard();

    const selector = await screen.findByRole("combobox", { name: "Project" });
    expect(await screen.findByText("No existing projects for this test. Create a new project to continue.")).toBeInTheDocument();
    expect(selector).toBeDisabled();
    expect(wizardMocks.listRecords).toHaveBeenCalledTimes(1);
  });

  it("allows selecting an existing project after a non-empty response", async () => {
    wizardMocks.listRecords.mockResolvedValue({
      data: [{ id: 42, name: "Existing project", client_name: "Client", project_date: null, test_type: "proctor" }],
    });
    renderWizard();

    const selector = await screen.findByRole("combobox", { name: "Project" });
    await waitFor(() => expect(wizardMocks.listRecords).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(selector).toBeEnabled());
    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole("option", { name: /Existing project/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Continue/ })).toBeEnabled());
    expect(wizardMocks.listRecords).toHaveBeenCalledTimes(1);
  });

  it("only retries a rejected request after the user clicks Retry", async () => {
    wizardMocks.listRecords
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce({ data: [] });
    renderWizard();

    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    expect(wizardMocks.listRecords).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(wizardMocks.listRecords).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No existing projects for this test. Create a new project to continue.")).toBeInTheDocument();
    expect(wizardMocks.listRecords).toHaveBeenCalledTimes(2);
  });
});
