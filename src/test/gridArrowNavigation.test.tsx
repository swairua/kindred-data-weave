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
});