import { IconGripHorizontal } from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { DragPreview, trackDocumentMouse, useDragHandleState } from "./drag-overlays";
import { keepIfEqual } from "./pointer-frame";
import { dropIndex, moveColumn } from "./table-column-move";

/// Where the grip sits: above one column of the hovered table, as wide as the column.
interface ColumnGrip {
  top: number;
  left: number;
  width: number;
}

/// The vertical line showing between which columns a dragged column will land.
interface ColumnIndicator {
  top: number;
  left: number;
  height: number;
}

type Cell = HTMLTableCellElement;

function cellOf(target: EventTarget | null): Cell | null {
  const cell = target instanceof Element ? target.closest("td, th") : null;
  return cell instanceof HTMLTableCellElement ? cell : null;
}

function columnIndex(cell: Cell): number {
  const row = cell.parentElement;
  return row instanceof HTMLTableRowElement ? Array.from(row.cells).indexOf(cell) : -1;
}

/// Column drag handles for tables, the counterpart of `TableRowHandles` (read its doc
/// comment for why the drag is built from plain mouse events and why the grip is always
/// mounted). A grip floats over the top edge of whichever column the mouse is over; dragging
/// it onto another column moves the whole column, in every row, through `moveColumn`. The
/// table is stored row by row, so the new order saves as it is.
export function TableColumnHandles({ editor }: { editor: Editor | null }) {
  const { visible, setVisible, dragPreview, setDragPreview, draggingRef } = useDragHandleState();
  const [grip, setGrip] = useState<ColumnGrip>({ top: -9999, left: -9999, width: 0 });
  const [indicator, setIndicator] = useState<ColumnIndicator | null>(null);
  const hoveredRef = useRef<Cell | null>(null);
  const sourceRef = useRef<Cell | null>(null);
  const gripRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const measure = (cell: Cell) => {
      const table = cell.closest("table");
      if (!table) return null;
      const cellBox = cell.getBoundingClientRect();
      const tableBox = table.getBoundingClientRect();
      const editorBox = dom.getBoundingClientRect();
      return {
        top: tableBox.top - editorBox.top,
        left: cellBox.left - editorBox.left,
        width: cellBox.width,
      };
    };

    // The grip pokes out above the table, where the mouse is over no cell. That strip counts
    // as still being on the column it belongs to, so the grip survives the trip up to it.
    const GUTTER_SLOP_PX = 6;
    const inGutterOfCurrentColumn = (event: MouseEvent) => {
      const cell = hoveredRef.current;
      const button = gripRef.current;
      if (!cell || !button || !dom.contains(cell)) return false;
      const cellBox = cell.getBoundingClientRect();
      const gripBox = button.getBoundingClientRect();
      return (
        event.clientX >= cellBox.left &&
        event.clientX <= cellBox.right &&
        event.clientY >= gripBox.top - GUTTER_SLOP_PX &&
        event.clientY <= cellBox.bottom
      );
    };

    const updateIndicatorAt = (clientX: number, clientY: number) => {
      const source = sourceRef.current;
      const target = cellOf(document.elementFromPoint(clientX, clientY));
      const table = source?.closest("table");
      if (!source || !target || !table || target.closest("table") !== table) {
        setIndicator(null);
        return;
      }
      const targetBox = target.getBoundingClientRect();
      const tableBox = table.getBoundingClientRect();
      const editorBox = dom.getBoundingClientRect();
      const before = clientX < targetBox.left + targetBox.width / 2;
      setIndicator((prev) =>
        keepIfEqual(prev, {
          top: tableBox.top - editorBox.top,
          left: (before ? targetBox.left : targetBox.right) - editorBox.left,
          height: tableBox.height,
        }),
      );
    };

    const onMouseMove = (event: MouseEvent) => {
      if (draggingRef.current) {
        updateIndicatorAt(event.clientX, event.clientY);
        setDragPreview((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
        return;
      }
      const cell = cellOf(event.target);
      if (cell && dom.contains(cell)) {
        const next = measure(cell);
        if (next) {
          hoveredRef.current = cell;
          setGrip((prev) => keepIfEqual(prev, next));
          setVisible(true);
          return;
        }
      }
      if (inGutterOfCurrentColumn(event)) return;
      hoveredRef.current = null;
      setVisible(false);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      setIndicator(null);
      setVisible(false);
      setDragPreview(null);

      const source = sourceRef.current;
      sourceRef.current = null;
      const table = source?.closest("table");
      const target = cellOf(document.elementFromPoint(event.clientX, event.clientY));
      if (!source || !table || !target || target.closest("table") !== table) return;

      const from = columnIndex(source);
      const targetIndex = columnIndex(target);
      if (from < 0 || targetIndex < 0) return;
      const targetBox = target.getBoundingClientRect();
      const before = event.clientX < targetBox.left + targetBox.width / 2;
      const to = dropIndex(from, targetIndex, before);
      if (to === from) return;

      // Resolved from the DOM into the document, then up to the table node.
      const $pos = editor.state.doc.resolve(editor.view.posAtDOM(table, 0));
      let tablePos = -1;
      for (let depth = $pos.depth; depth >= 0; depth--) {
        if ($pos.node(depth).type.name === "table") {
          tablePos = $pos.before(depth);
          break;
        }
      }
      if (tablePos < 0) return;
      moveColumn(editor.state, (tr) => editor.view.dispatch(tr), tablePos, from, to);
      editor.view.focus();
    };

    return trackDocumentMouse(onMouseMove, onMouseUp);
  }, [editor, draggingRef, setDragPreview, setVisible]);

  if (!editor) return null;

  return (
    <>
      <button
        ref={gripRef}
        type="button"
        aria-label="Drag to reorder column"
        data-testid="table-column-grip"
        onMouseDown={(event) => {
          const cell = hoveredRef.current;
          const table = cell?.closest("table");
          if (!cell || !table) return;
          event.preventDefault();
          // Plain mouse events have no native drag session to stop text selection for us.
          document.body.style.userSelect = "none";
          draggingRef.current = true;
          sourceRef.current = cell;
          const index = columnIndex(cell);
          // The column as markup, one cell per row, to follow the cursor.
          const rows = Array.from(table.rows)
            .map((row) => row.cells[index]?.outerHTML ?? "")
            .map((html) => `<tr>${html}</tr>`)
            .join("");
          setDragPreview({
            html: `<table><tbody>${rows}</tbody></table>`,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        className={cn(
          "absolute top-(--grip-top) left-(--grip-left) z-10 flex h-3 w-(--grip-width) cursor-grab items-center justify-center rounded-sm border border-white/20 bg-accent text-muted-foreground shadow-sm transition-opacity active:cursor-grabbing",
          visible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        // SAFETY: pixel lengths measured from the hovered cell's DOM box, which
        // `CSSProperties` can't name as custom properties.
        style={
          {
            "--grip-top": `${grip.top - 6}px`,
            "--grip-left": `${grip.left}px`,
            "--grip-width": `${grip.width}px`,
          } as CSSProperties
        }
      >
        <IconGripHorizontal size={12} />
      </button>
      {indicator && (
        <div
          className="pointer-events-none absolute top-(--indicator-top) left-(--indicator-left) z-10 h-(--indicator-height) w-0.5 rounded-full bg-primary"
          // SAFETY: pixel lengths measured from the drop target's DOM box.
          style={
            {
              "--indicator-top": `${indicator.top}px`,
              "--indicator-left": `${indicator.left - 1}px`,
              "--indicator-height": `${indicator.height}px`,
            } as CSSProperties
          }
        />
      )}
      {dragPreview && <DragPreview preview={dragPreview} />}
    </>
  );
}
