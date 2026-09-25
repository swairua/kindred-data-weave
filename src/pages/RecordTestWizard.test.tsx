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
  testDefinitions: [
    { test_key: "proctor", name: "Density/Moisture Content Relationship", category: "soil", sort_order: 1, enabled: true },
    { test_key: "grading", name: "Particle Size Distribution", category: "soil", sort_order: 2, enabled: true },
    { test_key: "compressive", name: "Compressive Strength", category: "concrete", sort_order: 1, enabled: true },
  ],
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
    testDefinitions: wizardMocks.testDefinitions,
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

const renderWizard = (initialEntry = "/record?material=soil&test=proctor") => render(
  <MemoryRouter initialEntries={[initialEntry]}>
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

describe("RecordTestWizard selection flow", () => {
  it("shows materials without bottom navigation and opens the selected material's tests", async () => {
    renderWizard("/record");

    expect(screen.getByRole("heading", { name: "What are you testing today?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Soil/ }));

    expect(await screen.findByRole("heading", { name: "Which test are you reporting?" })).toBeInTheDocument();
    expect(screen.getByText("Soil", { selector: "p" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Want to leave without saving?");
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(await screen.findByRole("heading", { name: "What are you testing today?" })).toBeInTheDocument();
  });

  it("stays on the current step when backward navigation is dismissed and preserves the draft", async () => {
    renderWizard("/record");
    fireEvent.click(screen.getByRole("button", { name: /Soil/ }));
    await screen.findByRole("heading", { name: "Which test are you reporting?" });
    fireEvent.click(screen.getByRole("button", { name: /Density\/Moisture Content Relationship/ }));

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Want to leave without saving?");
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));

    expect(screen.getByRole("heading", { name: "Which test are you reporting?" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("cransfield_record_wizard") ?? "{}")).toMatchObject({
      material: "soil",
      testKey: "proctor",
    });
  });

  it("confirms backward navigation from an earlier stepper item", async () => {
    renderWizard("/record");
    fireEvent.click(screen.getByRole("button", { name: /Soil/ }));
    await screen.findByRole("heading", { name: "Which test are you reporting?" });
    fireEvent.click(screen.getByRole("button", { name: /Density\/Moisture Content Relationship/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByRole("combobox", { name: "Project" });

    fireEvent.click(screen.getByRole("button", { name: "Step 2: Test type" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Want to leave without saving?");
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(await screen.findByRole("heading", { name: "Which test are you reporting?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Density\/Moisture Content Relationship/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("requires selecting an available test before Continue advances", async () => {
    renderWizard("/record");
    fireEvent.click(screen.getByRole("button", { name: /Soil/ }));

    const continueButton = await screen.findByRole("button", { name: /Continue/ });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Density\/Moisture Content Relationship/ }));
    expect(screen.getByRole("heading", { name: "Which test are you reporting?" })).toBeInTheDocument();
    expect(continueButton).toBeEnabled();

    fireEvent.click(continueButton);
    expect(await screen.findByRole("combobox", { name: "Project" })).toBeInTheDocument();
  });

  it("keeps Concrete on Select test and opens project selection for a new test", async () => {
    renderWizard("/record");
    fireEvent.click(screen.getByRole("button", { name: /Concrete/ }));

    expect(await screen.findByRole("heading", { name: "Which test are you reporting?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Compressive Strength/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

    expect(await screen.findByRole("heading", { name: "Select test to edit" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step 3: Select test" })).toHaveAttribute("aria-current", "step");

    fireEvent.click(screen.getByRole("button", { name: /Create new test/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Choose a project");
    expect(screen.getByRole("combobox", { name: "Project" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New project" })).toBeEnabled();
  });

  it("routes a preselected Concrete test to Select test when existing compressive tests are available", async () => {
    wizardMocks.listCompressiveTests.mockResolvedValue({
      data: [{
        id: 7,
        project_id: 42,
        test_key: "compressive",
        date_tested: "2026-06-18",
        cement: "Cement",
        fine_aggregate: "Fine aggregate",
        coarse_aggregate: "Coarse aggregate",
        contractor: "Contractor",
        concrete_class: "C25",
        section: "Section A",
        made_by: "Technician",
        slump: "50",
        client_ref: "REF-7",
        created_at: "2026-06-18T00:00:00Z",
        updated_at: "2026-06-18T00:00:00Z",
      }],
    });

    renderWizard("/record?material=concrete&test=compressive");

    expect(await screen.findByRole("heading", { name: "Select test to edit" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step 3: Select test" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create new test/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  it("requires county details before continuing with a selected compressive test", async () => {
    wizardMocks.listCompressiveTests.mockResolvedValue({
      data: [{
        id: 7,
        project_id: 42,
        test_key: "compressive",
        date_tested: "2026-06-18",
        cement: "Cement",
        fine_aggregate: "Fine aggregate",
        coarse_aggregate: "Coarse aggregate",
        contractor: "Contractor",
        concrete_class: "C25",
        section: "Section A",
        made_by: "Technician",
        slump: "50",
        client_ref: "REF-7",
        created_at: "2026-06-18T00:00:00Z",
        updated_at: "2026-06-18T00:00:00Z",
      }],
    });
    renderWizard("/record?material=concrete&test=compressive");

    await screen.findByRole("heading", { name: "Select test to edit" });
    fireEvent.click(screen.getByRole("combobox", { name: "Existing tests" }));
    fireEvent.click(await screen.findByRole("option", { name: /REF-7/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled());
    fireEvent.change(screen.getByLabelText("County *"), { target: { value: "Nairobi" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Continue/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));

    expect(await screen.findByRole("heading", { name: "Concrete cube details" })).toBeInTheDocument();
  });

  it("opens project selection when creating a new compressive test", async () => {
    wizardMocks.listCompressiveTests.mockResolvedValue({
      data: [{
        id: 7,
        project_id: 42,
        test_key: "compressive",
        date_tested: "2026-06-18",
        cement: "Cement",
        fine_aggregate: "Fine aggregate",
        coarse_aggregate: "Coarse aggregate",
        contractor: "Contractor",
        concrete_class: "C25",
        section: "Section A",
        made_by: "Technician",
        slump: "50",
        client_ref: "REF-7",
        created_at: "2026-06-18T00:00:00Z",
        updated_at: "2026-06-18T00:00:00Z",
      }],
    });
    renderWizard("/record?material=concrete&test=compressive");

    await screen.findByRole("heading", { name: "Select test to edit" });
    fireEvent.click(screen.getByRole("button", { name: /Create new test/ }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Choose a project");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Select test to edit" })).toBeInTheDocument();
  });

  it("routes a preselected Concrete test to Select test when no existing tests are available", async () => {
    renderWizard("/record?material=concrete&test=compressive");

    expect(await screen.findByRole("heading", { name: "Select test to edit" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create new test" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Which project is this for?" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create new test" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Choose a project");
  });

  it("selects an existing project from the new-test modal", async () => {
    wizardMocks.listRecords.mockResolvedValue({
      data: [{ id: 42, name: "Concrete project", client_name: "Client", project_date: null, test_type: "compressive" }],
    });
    wizardMocks.fetchFullProject.mockResolvedValue({
      id: 42,
      name: "Concrete project",
      client_name: "Client",
      contractor: "Contractor Ltd",
      county: "Nairobi",
    });
    renderWizard("/record?material=concrete&test=compressive");
    await screen.findByRole("heading", { name: "Select test to edit" });
    fireEvent.click(screen.getByRole("button", { name: "Create new test" }));

    fireEvent.click(await screen.findByRole("combobox", { name: "Project" }));
    fireEvent.click(await screen.findByRole("option", { name: /Concrete project/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "Concrete cube details" })).toBeInTheDocument();
    expect(wizardMocks.updateProjectMetadata).toHaveBeenCalledWith(expect.objectContaining({
      projectName: "Concrete project",
      clientName: "Client",
      contractor: "Contractor Ltd",
      county: "Nairobi",
    }));
  });

  it("creates a project from the new-test modal and advances to cube details", async () => {
    renderWizard("/record?material=concrete&test=compressive");
    await screen.findByRole("heading", { name: "Select test to edit" });
    fireEvent.click(screen.getByRole("button", { name: "Create new test" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "New project" }));

    fireEvent.change(await screen.findByLabelText("Project name *"), { target: { value: "Concrete project" } });
    fireEvent.change(screen.getByLabelText("Client name *"), { target: { value: "Client" } });
    fireEvent.change(screen.getByLabelText("Contractor *"), { target: { value: "Contractor Ltd" } });
    fireEvent.change(screen.getByLabelText("County *"), { target: { value: "Nairobi" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("heading", { name: "Concrete cube details" })).toBeInTheDocument();
    expect(wizardMocks.createRecord).toHaveBeenCalledWith("projects", expect.objectContaining({
      name: "Concrete project",
      client_name: "Client",
      contractor: "Contractor Ltd",
      county: "Nairobi",
    }));
    expect(wizardMocks.updateProjectMetadata).toHaveBeenCalledWith(expect.objectContaining({
      currentProjectId: 43,
      contractor: "Contractor Ltd",
      county: "Nairobi",
    }));
  });
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

  it("shows and saves the project date when creating a grading project", async () => {
    renderWizard("/record?material=soil&test=grading");

    await screen.findByRole("combobox", { name: "Project" });
    fireEvent.click(screen.getByRole("button", { name: "New project" }));

    fireEvent.change(await screen.findByLabelText("Project date"), { target: { value: "2026-06-18" } });
    fireEvent.change(screen.getByLabelText("Project name *"), { target: { value: "Grading project" } });
    fireEvent.change(screen.getByLabelText("Client name *"), { target: { value: "Client" } });
    fireEvent.change(screen.getByLabelText("Contractor *"), { target: { value: "Contractor Ltd" } });
    fireEvent.change(screen.getByLabelText("County *"), { target: { value: "Nairobi" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(wizardMocks.createRecord).toHaveBeenCalledWith("projects", expect.objectContaining({
      name: "Grading project",
      client_name: "Client",
      project_date: "2026-06-18",
      test_type: "grading",
    })));
  });
});
