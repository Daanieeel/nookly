import type { EntityRecord } from "@nookly/shared/data";
import { MODULE_LABELS, type ModuleKey, moduleForEntityType } from "@nookly/shared/modules";

export interface PinnedGroup {
  /// A module's key, or null for items that belong to none ("Other").
  module: ModuleKey | null;
  label: string;
  items: EntityRecord[];
}

export interface PinnedSpace {
  spaceId: string;
  groups: PinnedGroup[];
  count: number;
}

/// What is pinned, by Space in the sidebar's order and within each Space by module, the way
/// the desktop's Pinned page lays it out. Pinned items of a Space that no longer shows
/// (a Space that is gone) are left out.
export function groupPinned(pinned: EntityRecord[], spaceIds: string[]): PinnedSpace[] {
  return spaceIds.flatMap((spaceId) => {
    const mine = pinned.filter((e) => e.spaceId === spaceId);
    if (mine.length === 0) return [];
    const groups: PinnedGroup[] = [];
    for (const entity of mine) {
      const module = moduleForEntityType(entity.type) ?? null;
      let group = groups.find((g) => g.module === module);
      if (!group) {
        group = { module, label: module ? MODULE_LABELS[module] : "Other", items: [] };
        groups.push(group);
      }
      group.items.push(entity);
    }
    // "Other" last, the rest in the module order of the sidebar.
    groups.sort(
      (a, b) =>
        Number(a.module === null) - Number(b.module === null) || a.label.localeCompare(b.label),
    );
    return [{ spaceId, groups, count: mine.length }];
  });
}

/// "Note", "Task", "Sub-task": what kind of item a row is, in words.
const TYPE_LABELS = new Map([
  ["note", "Note"],
  ["jot", "Jot"],
  ["task", "Task"],
  ["sub_task", "Sub-task"],
  ["course", "Course"],
  ["course_notes", "Course notes"],
  ["semester", "Semester"],
  ["session", "Session"],
  ["session_template", "Session series"],
  ["calendar_entry", "Calendar entry"],
  ["calendar_entry_template", "Calendar series"],
  ["exam", "Exam"],
  ["study_block", "Study block"],
  ["index_card_deck", "Deck"],
  ["assignment", "Assignment"],
  ["file", "File"],
  ["bookmark", "Bookmark"],
  ["recipe", "Recipe"],
]);

export const typeLabel = (type: string) => TYPE_LABELS.get(type) ?? "Item";
