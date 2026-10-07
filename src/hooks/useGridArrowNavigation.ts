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

/** Selector for the editable controls we move between. Text-like inputs only: date
 * pickers, checkboxes and radios keep their native arrow behaviour. Native
 * inputs (Atterberg cells) are included alongside Radix-wrapped ones. */
const FIELD_SELECTOR =
  "input:not([type='hidden']):not([type='date']):not([type='checkbox']):not([type='radio']):not([type='file']):not([type='submit']):not([type='button']), textarea, select";

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
   * own rows. The column is the count of *cells* (th/td) before the field's
   * cell, not the field's position among inputs — so a data row with a label
   * cell lines up with neighbours, and a `-` muted cell still occupies its
   * column even though it holds no input.
   */
  const cellOf = useCallback((current: HTMLElement) => {
    const cell = current.closest("td, th");
    const row = current.closest("tr") ?? current.parentElement;
    const rowEl = row as HTMLElement | null;
    const cells = rowEl ? Array.from(rowEl.children) : [];
    let column = -1;
    let seen = 0;
    for (const child of cells) {
      if (child === cell) {
        column = seen;
        break;
      }
      if (child instanceof HTMLElement) {
        seen += Number.parseInt(child.getAttribute("colspan") ?? "1", 10) || 1;
      } else {
        seen += 1;
      }
    }
    const inRow = rowEl ? Array.from(rowEl.querySelectorAll<HTMLElement>(FIELD_SELECTOR)) : [];
    return { rowEl, column, indexInRow: inRow.indexOf(current) };
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

    const { rowEl, column, indexInRow } = cellOf(target);
    let next: HTMLElement | null = null;

    /** Visual column of a cell within its row, expanding colSpan. */
    const cellColumn = (row: HTMLElement, cell: Element): number => {
      let seen = 0;
      for (const child of Array.from(row.children)) {
        if (child === cell) return seen;
        if (child instanceof HTMLElement) {
          seen += Number.parseInt(child.getAttribute("colspan") ?? "1", 10) || 1;
        } else {
          seen += 1;
        }
      }
      return seen;
    };

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      // Stay on this row: the neighbouring input in reading order.
      const step = event.key === "ArrowRight" ? 1 : -1;
      const rowInputs = rowEl
        ? Array.from(rowEl.querySelectorAll<HTMLElement>(FIELD_SELECTOR))
        : [];
      // A row of a single input has no horizontal neighbour, so fall back to
      // flat document order for stacked (non-table) layouts.
      next = indexInRow >= 0 ? rowInputs[indexInRow + step] ?? null : all[index + step] ?? null;
    } else {
      // Same visual column: nearest input in the adjacent row holding that column.
      // Rows carry a label cell first, so target cells and exclude it from matching.
      const step = event.key === "ArrowDown" ? 1 : -1;
      const table = (rowEl as HTMLElement | null)?.closest("table");
      if (table) {
        const body = table.querySelector("tbody") ?? table;
        const rowList = Array.from(body.children) as HTMLElement[];
        let cursor = rowList.indexOf(rowEl as HTMLElement);
        while (cursor !== -1 && !next) {
          cursor += step;
          if (cursor < 0 || cursor >= rowList.length) break;
          const candidateRow = rowList[cursor];
          const fieldsInRow = Array.from(candidateRow.querySelectorAll<HTMLElement>(FIELD_SELECTOR));
          const pick = fieldsInRow.find((field) => {
            const cell = field.closest("td, th");
            return cell !== null && cellColumn(candidateRow, cell) === column;
          });
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