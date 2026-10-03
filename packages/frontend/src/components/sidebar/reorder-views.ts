import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { SavedView } from "#/lib/api/views.ts";

/// `views` with the dragged one moved onto the one it was dropped on, or null when the
/// drop changes nothing.
export function reorderedViews(
  views: SavedView[],
  { active, over }: DragEndEvent,
): SavedView[] | null {
  if (!over || active.id === over.id) return null;
  const ids = views.map((v) => v.entity.id);
  const from = ids.indexOf(String(active.id));
  const to = ids.indexOf(String(over.id));
  if (from === -1 || to === -1) return null;
  return arrayMove(views, from, to);
}
