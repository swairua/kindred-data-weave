import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useGridArrowNavigation } from "@/hooks/useGridArrowNavigation";

/**
 * A miniature of the Proctor weighing grid: two input rows either side of a
 * calculated row that holds no input, across three points.
 */
const Grid = () => {
  const nav = useGridArrowNavigation<HTMLDivElement>();
  return (
    <div ref={nav.ref} onKeyDown={nav.onKeyDown}>
      <table>
        <tbody>
          <tr>
            <td>Moisture addition</td>
            <td><input aria-label="moisture-1" /></td>
            <td><input aria-label="moisture-2" /></td>
            <td><input aria-label="moisture-3" /></td>
          </tr>
          <tr>
            <td>Bulk density</td>
            <td colSpan={3}>auto</td>
          </tr>
          <tr>
            <td>Wet material mass</td>
            <td><input aria-label="wet-1" /></td>
            <td><input aria-label="wet-2" /></td>
            <td><input aria-label="wet-3" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

/**
 * A miniature of the Atterberg A–G trial table: a label cell first, a muted
 * "-" cell holding a column with no input, and an auto row with none at all.
 */
const LabelledGrid = () => {
  const nav = useGridArrowNavigation<HTMLDivElement>();
  return (
    <div ref={nav.ref} onKeyDown={nav.onKeyDown}>
      <table>
        <tbody>
          <tr>
            <td>Container No</td>
            <td><input aria-label="cn-a" /></td>
            <td><input aria-label="cn-b" /></td>
            <td><input aria-label="cn-c" /></td>
          </tr>
          <tr>
            <td>Penetration (mm)</td>
            <td><input aria-label="pen-a" /></td>
            <td><input aria-label="pen-b" /></td>
            <td>-</td>
          </tr>
          <tr>
            <td>Wt of Moisture (g)</td>
            <td colSpan={3}>auto</td>
          </tr>
          <tr>
            <td>Wt of Container (g)</td>
            <td><input aria-label="c-a" /></td>
            <td><input aria-label="c-b" /></td>
            <td><input aria-label="c-c" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const press = (label: string, key: string) =>
  fireEvent.keyDown(screen.getByLabelText(label), { key });

describe("useGridArrowNavigation", () => {
  it("moves down to the next row holding an input, skipping calculated rows", () => {
    render(<Grid />);
    const start = screen.getByLabelText("moisture-1");
    start.focus();
    press("moisture-1", "ArrowDown");
    // The Bulk density row has no input, so it must be stepped over.
    expect(document.activeElement).toBe(screen.getByLabelText("wet-1"));
  });

  it("moves back up to the previous row holding an input", () => {
    render(<Grid />);
    screen.getByLabelText("wet-1").focus();
    press("wet-1", "ArrowUp");
    expect(document.activeElement).toBe(screen.getByLabelText("moisture-1"));
  });

  it("moves right and left along the same row", () => {
    render(<Grid />);
    screen.getByLabelText("moisture-1").focus();
    press("moisture-1", "ArrowRight");
    expect(document.activeElement).toBe(screen.getByLabelText("moisture-2"));
    press("moisture-2", "ArrowLeft");
    expect(document.activeElement).toBe(screen.getByLabelText("moisture-1"));
  });

  it("keeps the column when moving down", () => {
    render(<Grid />);
    screen.getByLabelText("moisture-3").focus();
    press("moisture-3", "ArrowDown");
    expect(document.activeElement).toBe(screen.getByLabelText("wet-3"));
  });

  it("stops at the edges instead of wrapping", () => {
    render(<Grid />);
    screen.getByLabelText("moisture-1").focus();
    press("moisture-1", "ArrowUp");
    expect(document.activeElement).toBe(screen.getByLabelText("moisture-1"));

    screen.getByLabelText("moisture-3").focus();
    press("moisture-3", "ArrowRight");
    expect(document.activeElement).toBe(screen.getByLabelText("moisture-3"));
  });

  it("ignores arrow keys carrying a modifier, so shortcuts still work", () => {
    render(<Grid />);
    screen.getByLabelText("moisture-1").focus();
    fireEvent.keyDown(screen.getByLabelText("moisture-1"), { key: "ArrowDown", ctrlKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText("moisture-1"));
  });

  it("does not move when the key is not an arrow", () => {
    render(<Grid />);
    screen.getByLabelText("moisture-1").focus();
    fireEvent.keyDown(screen.getByLabelText("moisture-1"), { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByLabelText("moisture-1"));
  });

  it("ignores date inputs so pickers keep their native arrow behaviour", () => {
    const WithDate = () => {
      const nav = useGridArrowNavigation<HTMLDivElement>();
      return (
        <div ref={nav.ref} onKeyDown={nav.onKeyDown}>
          <input aria-label="text-1" />
          <input aria-label="date-1" type="date" />
          <input aria-label="text-2" />
        </div>
      );
    };
    render(<WithDate />);
    screen.getByLabelText("text-1").focus();
    fireEvent.keyDown(screen.getByLabelText("text-1"), { key: "ArrowDown" });
    // Flat-order fallback skips the date input entirely.
    expect(document.activeElement).toBe(screen.getByLabelText("text-2"));
  });

  it("aligns columns past a label cell, skipping muted and auto rows", () => {
    render(<LabelledGrid />);
    // Down from column B lands on the same column, not shifted by the label cell.
    screen.getByLabelText("cn-b").focus();
    press("cn-b", "ArrowDown");
    expect(document.activeElement).toBe(screen.getByLabelText("pen-b"));

    // Down again steps over the auto row to the next weighing.
    press("pen-b", "ArrowDown");
    expect(document.activeElement).toBe(screen.getByLabelText("c-b"));

    // Column C has a "-" cell below: Down steps over it to the next input.
    screen.getByLabelText("cn-c").focus();
    press("cn-c", "ArrowDown");
    expect(document.activeElement).toBe(screen.getByLabelText("c-c"));

    // Left/Right cross the LL/PL-style columns on the same row.
    press("c-c", "ArrowLeft");
    expect(document.activeElement).toBe(screen.getByLabelText("c-b"));
    press("c-b", "ArrowRight");
    expect(document.activeElement).toBe(screen.getByLabelText("c-c"));
  });
});