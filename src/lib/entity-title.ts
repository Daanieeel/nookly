import type { Entity } from "@/lib/api/types";

/// Mirrors the entity `type` list in `src/components/entity-icon.tsx`'s
/// `DEFAULT_ICONS` map — the one place that enumerates every type string used
/// across the app. Same `Map` shape as that file, for the same reason: an
/// arbitrary `string` key needs a lookup that isn't a plain object index.
const TYPE_LABELS = new Map<string, string>([
  ["task", "Task"],
  ["sub_task", "Task"],
  ["note", "Note"],
  ["jot", "Jot"],
  ["course", "Course"],
  ["course_notes", "Course Notes"],
  ["semester", "Semester"],
  ["session", "Session"],
  ["session_template", "Session"],
  ["exam", "Exam"],
  ["index_card_deck", "Deck"],
  ["study_block", "Study Block"],
  ["assignment", "Assignment"],
  ["file", "File"],
  ["bookmark", "Bookmark"],
  ["space", "Space"],
]);

export function labelForType(type: string): string {
  return TYPE_LABELS.get(type) ?? "Item";
}

/// The title to render for an entity, falling back to "Untitled {Type}" when
/// the real title is empty/whitespace-only — every read-only render site
/// should go through this rather than rendering `entity.title` raw.
export function displayTitle(entity: Pick<Entity, "title" | "type">): string {
  return entity.title.trim() || `Untitled ${labelForType(entity.type)}`;
}
