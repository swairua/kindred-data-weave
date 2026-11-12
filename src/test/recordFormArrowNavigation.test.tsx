import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import CBRTest from "@/components/soil/CBRTest";
import SlumpTest from "@/components/concrete/SlumpTest";
import SPTTest from "@/components/special/SPTTest";
import { ProjectContext } from "@/context/ProjectContext";
import { TestAccordionProvider } from "@/context/TestAccordionContext";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The wizard's step 5 ("Record") hands over to whichever test form the technician
 * picked, so every one of them has to answer to the arrow keys — a technician
 * working down a column of blow counts or loads should not reach for the mouse
 * between rows. These cover the wiring on two table forms (one with a
 * calculated column) and one CSS-grid form.
 */
const persistenceMocks = vi.hoisted(() => ({
  loadTestResult: vi.fn(),
  saveTestResult: vi.fn(),
  loadCBRResult: vi.fn(),
  saveCBRResult: vi.fn(),
}));

vi.mock("@/lib/testResultPersistence", () => ({
  loadTestResult: persistenceMocks.loadTestResult,
  saveTestResult: persistenceMocks.saveTestResult,
}));

vi.mock("@/lib/cbrPersistence", () => ({
  loadCBRResult: persistenceMocks.loadCBRResult,
  saveCBRResult: persistenceMocks.saveCBRResult,
}));

const renderForm = (element: ReactElement, testKey: string) =>
  render(
    <MemoryRouter initialEntries={[`/tests?projectId=42#${testKey}`]}>
      <ProjectContext.Provider
        value={{ projectName: "Tower block", clientName: "Client", date: "2026-06-29", currentProjectId: 42 }}
      >
        <TooltipProvider>
          <TestAccordionProvider>{element}</TestAccordionProvider>
        </TooltipProvider>
      </ProjectContext.Provider>
    </MemoryRouter>,
  );

/** The editable cells of a record table, in row-major order. */
const cells = (container: HTMLElement): HTMLInputElement[] =>
  Array.from(container.querySelectorAll<HTMLInputElement>("table tbody tr td input"));

const press = (element: Element, key: string) => fireEvent.keyDown(element, { key });

beforeEach(() => {
  persistenceMocks.loadTestResult.mockReset().mockResolvedValue(null);
  persistenceMocks.loadCBRResult.mockReset().mockResolvedValue(null);
});

afterEach(cleanup);

describe("arrow keys in the record forms", () => {
  it("walks the SPT blow-count grid in both axes", async () => {
    const { container } = renderForm(<SPTTest testKey="spt" />, "spt");
    // The accordion opens on "compressive" by default, so expand this section.
    fireEvent.click(await screen.findByText("SPT (Standard Penetration Test)"));
    fireEvent.click(screen.getByRole("button", { name: /Add Row/ }));

    const [firstDepth, firstBlows, secondDepth, secondBlows] = cells(container)
      .filter((input) => !input.readOnly && input.tabIndex !== -1);
    firstDepth.focus();

    press(firstDepth, "ArrowDown");
    expect(document.activeElement).toBe(secondDepth);

    press(secondDepth, "ArrowRight");
    expect(document.activeElement).toBe(secondBlows);

    press(secondBlows, "ArrowUp");
    expect(document.activeElement).toBe(firstBlows);

    press(firstBlows, "ArrowLeft");
    expect(document.activeElement).toBe(firstDepth);
  });

  it("steps over the calculated CBR column instead of landing in it", async () => {
    const { container } = renderForm(<CBRTest testKey="cbr" />, "cbr");
    fireEvent.click(await screen.findByText("CBR (California Bearing Ratio)"));

    // The read-only CBR cell renders as an input too, but is taken out of the
    // grid with tabIndex -1 so the caret never parks in a value it cannot edit.
    const allCells = cells(container);
    expect(allCells.filter((input) => input.tabIndex === -1).length).toBeGreaterThan(0);

    // Penetration and load only: eight rows come pre-filled with the project selected.
    const [firstPen, firstLoad, secondPen, secondLoad] = allCells.filter((input) => input.tabIndex !== -1);

    firstPen.focus();
    press(firstPen, "ArrowDown");
    expect(document.activeElement).toBe(secondPen);

    press(secondPen, "ArrowRight");
    expect(document.activeElement).toBe(secondLoad);

    press(secondLoad, "ArrowUp");
    expect(document.activeElement).toBe(firstLoad);

    press(firstLoad, "ArrowLeft");
    expect(document.activeElement).toBe(firstPen);
  });

  it("moves through the grid-laid Slump form and leaves date pickers alone", async () => {
    const { container } = renderForm(<SlumpTest testKey="slump" />, "slump");
    fireEvent.click(await screen.findByText("Slump Test"));

    // Derived read-only fields carry tabIndex -1 and date pickers are
    // excluded from the grid, so the caret only visits editable inputs.
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>("input"))
      .filter((input) => input.tabIndex !== -1 && !input.readOnly && input.type !== "date");
    const [cone, subsidence, target, remarks, testedBy] = inputs;

    cone.focus();
    press(cone, "ArrowDown");
    expect(document.activeElement).toBe(subsidence);

    press(subsidence, "ArrowDown");
    expect(document.activeElement).toBe(target);

    press(target, "ArrowDown");
    expect(document.activeElement).toBe(remarks);

    press(remarks, "ArrowDown");
    expect(document.activeElement).toBe(testedBy);

    press(testedBy, "ArrowUp");
    expect(document.activeElement).toBe(remarks);

    // Date inputs are excluded from the grid so the picker keeps its own arrows.
    const dateTested = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    dateTested.focus();
    press(dateTested, "ArrowDown");
    expect(document.activeElement).toBe(dateTested);
  });
});
