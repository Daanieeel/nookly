import type { EditorView } from "@tiptap/pm/view";

type Rect = { top: number; bottom: number };

/// Whether two caret rectangles sit on the same visual line: the middle of one falls
/// inside the other. Tall neighbours, like a formula, make the rectangles differ in height.
function sameLine(a: Rect, b: Rect): boolean {
  const mid = (r: Rect) => (r.top + r.bottom) / 2;
  return (mid(a) >= b.top && mid(a) <= b.bottom) || (mid(b) >= a.top && mid(b) <= a.bottom);
}

/// The position at the start (`-1`) or end (`1`) of the visual line `head` is on, between
/// `min` and `max` (the bounds of its text block). Walks outwards one position at a time
/// until the line changes, because a line with an inline formula is where the browser's
/// own "start of line" gets lost.
export function lineEdge(
  view: Pick<EditorView, "coordsAtPos">,
  head: number,
  min: number,
  max: number,
  direction: -1 | 1,
): number {
  let origin: Rect;
  try {
    origin = view.coordsAtPos(head);
  } catch {
    return head;
  }
  let edge = head;
  for (let pos = head + direction; pos >= min && pos <= max; pos += direction) {
    try {
      if (!sameLine(origin, view.coordsAtPos(pos))) break;
    } catch {
      break;
    }
    edge = pos;
  }
  return edge;
}
