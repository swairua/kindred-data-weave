import { useCallback, useRef } from "react";

/**
 * Arrow-key navigation for the measurement grids on the soil test forms.
 *
 * A technician filling a Proctor or sieve sheet works down a column of
 * weighings, and the grids are wide enough that reaching the next row with the
 * mouse is the slowest part of data entry. The arrow keys move between inputs
 * instead.
 *
 * Movement is grid-aware rather than a flat list:
 *   Up/Down     move to the nearest input in the same column, skipping rows that
 *               hold no input. Calculated rows (bulk density, moisture content)
 *               are therefore stepped over rather than trapping the caret.
 *   Left/Right  move to the adjacent input on the same row.
 *
 * Movement stops at the edge of the grid instead of wrapping, so an accidental
 * double-tap cannot silently re-enter the first measurement.
 *
 * The handler is attached to the grid element rather than each input, so it works
 * for rows added later without touching every input.
 */

/** Selector for the editable controls we move between. */
const FIELD_SELECTOR = "input:not([type='hidden']), textarea, select";

const isField = (node: Element | null): node is HTMLElement =>
  !!node && node.matches(FIELD_SELECTOR);

export const useGridArrowNavigation = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);

  /** Every enabled input inside the grid, in visual row-major order. */
  const fields = useCallback((): HTMLElement[] => {
    const root = ref.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(
      (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
    );
  }, []);

  /**
   * The cell holding `current`, expressed as row and column over the grid's
   * own rows. Using each field's position within its row (rather than a global
   * index) is what lets a row with fewer inputs still line up with its
   * neighbours.
   */
  const cellOf = useCallback((current: HTMLElement) => {
    const row = current.closest("tr") ?? current.parentElement;
    const rowEl = row as HTMLElement | null;
    const inRow = rowEl ? Array.from(rowEl.querySelectorAll<HTMLElement>(FIELD_SELECTOR)) : [];
    return { rowEl, column: inRow.indexOf(current) };
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent<T>) => {
    const target = event.target as HTMLElement | null;
    if (!isField(target)) return;

    // Never steal a keystroke the user is using to edit the value itself.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    const all = fields();
    const index = all.indexOf(target);
    if (index === -1) return;

    const { rowEl, column } = cellOf(target);
    let next: HTMLElement | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      // Stay on this row: the neighbouring input in reading order.
      const step = event.key === "ArrowRight" ? 1 : -1;
      const rowInputs = rowEl
        ? Array.from(rowEl.querySelectorAll<HTMLElement>(FIELD_SELECTOR))
        : [];
      // A row of a single input has no horizontal neighbour, so fall back to
      // flat document order for stacked (non-table) layouts.
      next = column >= 0 ? rowInputs[column + step] ?? null : all[index + step] ?? null;
    } else {
      // Same column, nearest input in the adjacent row that actually has one.
      const step = event.key === "ArrowDown" ? 1 : -1;
      const table = (rowEl as HTMLElement | null)?.closest("table");
      if (table) {
        const body = table.querySelector("tbody") ?? table;
        const rowList = Array.from(body.children) as HTMLElement[];
        let cursor = rowList.indexOf(rowEl as HTMLElement);
        while (cursor !== -1 && !next) {
          cursor += step;
          if (cursor < 0 || cursor >= rowList.length) break;
          const candidate = rowList[cursor].querySelectorAll<HTMLElement>(FIELD_SELECTOR);
          const pick = column >= 0 ? candidate[column] : undefined;
          if (pick && isField(pick)) next = pick;
        }
      }
      // Outside a table, fall back to flat order.
      if (!next) next = all[index + step] ?? null;
    }

    if (!next) return;
    event.preventDefault();
    next.focus();
    // Select the value so typing replaces it, which is what a technician moving
    // between weighings expects. Not every control type exposes select().
    if (typeof (next as HTMLInputElement).select === "function") {
      (next as HTMLInputElement).select();
    }
  }, [fields, cellOf]);

  return { ref, onKeyDown };
};