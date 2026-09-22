import { IconGripVertical } from "@tabler/icons-react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

interface HandleRect {
  top: number;
  left: number;
  height: number;
}

interface Indicator {
  top: number;
  left: number;
  width: number;
}

interface ResolvedRow {
  start: number;
  end: number;
  node: ProseMirrorNode;
}

function findEnclosingTableRow(node: ProseMirrorNode, pos: number): ResolvedRow | null {
  const $pos = node.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth--) {
    if ($pos.node(depth).type.name === "tableRow") {
      return { start: $pos.before(depth), end: $pos.after(depth), node: $pos.node(depth) };
    }
  }
  return null;
}

/// Row drag handles for tables (§ table block) — `@tiptap/extension-table` (the open-source
/// package this app uses, not the paid Tiptap Pro one) ships column resize but no row-reorder UI
/// at all, so this hand-rolls it: a floating grip tracks whichever `<tr>` the mouse is currently
/// over (measured the same way `TableControls` tracks the table itself, since a raw `<tr>` can't
/// host arbitrary child DOM without the browser hoisting it back out — HTML only allows
/// `<td>`/`<th>` inside a `<tr>`).
///
/// The drag itself is implemented entirely with plain `mousedown`/`mousemove`/`mouseup` — *not*
/// the native HTML5 `draggable`/`dragstart`/`dragover`/`drop` API, despite that being the more
/// obvious tool for "drag this to reorder it". That API turned out to be fundamentally
/// unreliable here: WebKit (the engine behind this app's Tauri webview on macOS) does not
/// consistently deliver `dragover`/`drop` for a drag ending inside a ProseMirror contentEditable
/// region — confirmed with an isolated, minimal reproduction where even ProseMirror's *own*
/// built-in native text-drag (no custom code at all — select text, drag it elsewhere) silently
/// drops the same two events in WebKit while working correctly in Chromium. Plain mouse events
/// have no such native-drag-session semantics to go wrong — same as the hover-tracking below,
/// which already relies on them.
export function TableRowHandles({ editor }: { editor: Editor | null }) {
  // The grip button is *always* mounted (never conditionally rendered) and toggled purely via
  // `visible`/CSS. A conditionally-rendered grip can unmount mid-gesture from a stray mousemove
  // landing outside the hover-tolerance zone below — confirmed as a real, reproducible failure
  // (in Chromium, before the mouse-event rewrite: "element was detached from the DOM, retrying")
  // — which cuts the interaction off outright. A stable DOM node removes that failure mode
  // entirely rather than trying to make the show/hide heuristic perfectly precise.
  const [handle, setHandle] = useState<HandleRect>({ top: -9999, left: -9999, height: 0 });
  const [visible, setVisible] = useState(false);
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  const hoveredRowRef = useRef<HTMLTableRowElement | null>(null);
  const draggingRef = useRef(false);
  const sourceRowRef = useRef<HTMLTableRowElement | null>(null);
  const gripRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const measure = (row: HTMLTableRowElement) => {
      const rowBox = row.getBoundingClientRect();
      const editorBox = dom.getBoundingClientRect();
      return {
        top: rowBox.top - editorBox.top,
        left: rowBox.left - editorBox.left,
        height: rowBox.height,
      };
    };

    // The grip itself renders *outside* `dom` (see the module doc comment), so it's a sibling
    // overlay, offset to the left of the row. A listener scoped to `dom` alone loses the row the
    // instant the cursor crosses that gap on its way to the grip: `mousemove`'s target stops
    // being inside any `<tr>`, and `mouseleave` fires on `dom` outright. Tracked on `document`
    // instead, with the gap itself treated as still "on" the row it belongs to, so the handle
    // survives the trip.
    //
    // The gutter's left boundary is read from the grip's *own* `getBoundingClientRect()`
    // (`gripRef`), not re-derived from `handle`/`gripLeft()` math: that math is relative to
    // `dom`'s own box, but the grip's actual CSS positioning ancestor is whatever
    // `position: relative` element wraps it in `BlockEditor.tsx` — a *different* box when
    // there's any padding/margin between the two. Reading the grip's real rect sidesteps needing
    // to know that ancestor at all.
    const GUTTER_SLOP_PX = 6;
    const inGutterOfCurrentRow = (event: MouseEvent) => {
      const row = hoveredRowRef.current;
      const grip = gripRef.current;
      if (!row || !grip || !dom.contains(row)) return false;
      const rowBox = row.getBoundingClientRect();
      const gripBox = grip.getBoundingClientRect();
      return (
        event.clientX >= gripBox.left - GUTTER_SLOP_PX &&
        event.clientX <= rowBox.right &&
        event.clientY >= rowBox.top &&
        event.clientY <= rowBox.bottom
      );
    };

    const updateIndicatorAt = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      const row = el?.closest("tr");
      if (!row || !dom.contains(row) || row === sourceRowRef.current) {
        setIndicator(null);
        return;
      }
      const rowBox = row.getBoundingClientRect();
      const editorBox = dom.getBoundingClientRect();
      const before = clientY < rowBox.top + rowBox.height / 2;
      setIndicator({
        top: (before ? rowBox.top : rowBox.bottom) - editorBox.top,
        left: rowBox.left - editorBox.left,
        width: rowBox.width,
      });
    };

    const onMouseMove = (event: MouseEvent) => {
      if (draggingRef.current) {
        updateIndicatorAt(event.clientX, event.clientY);
        return;
      }
      const target = event.target;
      const row = target instanceof Element ? target.closest("tr") : null;
      if (row && dom.contains(row)) {
        hoveredRowRef.current = row;
        setHandle(measure(row));
        setVisible(true);
        return;
      }
      if (inGutterOfCurrentRow(event)) return;
      hoveredRowRef.current = null;
      setVisible(false);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      setIndicator(null);
      setVisible(false);

      const sourceRow = sourceRowRef.current;
      sourceRowRef.current = null;
      if (!sourceRow) return;

      const el = document.elementFromPoint(event.clientX, event.clientY);
      const targetRow = el?.closest("tr");
      if (!targetRow || !dom.contains(targetRow) || targetRow === sourceRow) return;

      const sourcePos = editor.view.posAtDOM(sourceRow, 0);
      const targetPos = editor.view.posAtDOM(targetRow, 0);
      const source = findEnclosingTableRow(editor.state.doc, sourcePos);
      const target = findEnclosingTableRow(editor.state.doc, targetPos);
      if (!source || !target || source.start === target.start) return;

      const targetBox = targetRow.getBoundingClientRect();
      const before = event.clientY < targetBox.top + targetBox.height / 2;
      const insertPos = before ? target.start : target.end;

      const tr = editor.state.tr;
      tr.delete(source.start, source.end);
      tr.insert(tr.mapping.map(insertPos), source.node);
      editor.view.dispatch(tr);
      editor.commands.focus();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <>
      <button
        ref={gripRef}
        type="button"
        aria-label="Drag to reorder row"
        data-testid="table-row-grip"
        onMouseDown={(event) => {
          const row = hoveredRowRef.current;
          if (!row) return;
          event.preventDefault();
          // Plain mouse events don't have a native drag session to suppress text selection for
          // us — without this, sweeping the cursor across the page while the button is held
          // paints a text selection the whole way.
          document.body.style.userSelect = "none";
          draggingRef.current = true;
          sourceRowRef.current = row;
        }}
        className="absolute z-10 flex cursor-grab items-center justify-center rounded-sm border border-border bg-popover text-muted-foreground shadow-sm transition-opacity active:cursor-grabbing"
        style={{
          top: handle.top,
          left: Math.max(handle.left - 20, 2),
          height: handle.height,
          width: 16,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <IconGripVertical size={12} />
      </button>
      {indicator && (
        <div
          className="pointer-events-none absolute z-10 h-0.5 rounded-full bg-primary"
          style={{ top: indicator.top - 1, left: indicator.left, width: indicator.width }}
        />
      )}
    </>
  );
}
