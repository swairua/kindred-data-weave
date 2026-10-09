import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import Navigation from "@/components/Navigation";

vi.mock("@/lib/formulasReferencePdfGenerator", () => ({
  generateFormulasReferencePDF: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { generateFormulasReferencePDF } from "@/lib/formulasReferencePdfGenerator";
import { toast } from "sonner";

const renderNavigation = () =>
  render(
    <MemoryRouter>
      <SidebarProvider>
        <Navigation currentView="tests" onViewChange={() => {}} />
      </SidebarProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("sidebar navigation", () => {
  it("shows a single Formulas reference entry in the Lab group", () => {
    renderNavigation();
    const entries = screen.getAllByRole("button", { name: /formulas reference/i });
    expect(entries).toHaveLength(1);
  });

  it("downloads the formulas reference PDF when the entry is clicked", async () => {
    renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: /formulas reference/i }));
    await waitFor(() => expect(generateFormulasReferencePDF).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Formulas reference PDF downloaded");
  });
});
