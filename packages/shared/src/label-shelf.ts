/// The label shelf atop the Files page on both apps (D74): browsing files by their labels
/// the way folders would be browsed, without a file living in only one of them.

/// The shelf's pick for the files that carry no label at all.
export const UNLABELLED = "none";

export interface ShelfLabel {
  id: string;
  /// How many of the files shown carry it.
  count: number;
}

export interface Shelf<T> {
  /// The files the pick leaves.
  shown: T[];
  /// The labels those files carry besides the picked ones, most used first.
  labels: ShelfLabel[];
  /// How many files carry no label, for the quiet nudge at the shelf's end.
  unlabelled: number;
}

/// Narrows `items` to those carrying every picked label (or none at all, for
/// `UNLABELLED`) and counts what the rest of the shelf offers. A picked label no item
/// carries anymore is left out, so a stale pick never empties the page.
export function labelShelf<T>(
  items: T[],
  labelsOf: (item: T) => string[],
  picked: string[],
  nameOf: (id: string) => string,
): Shelf<T> {
  const unlabelled = items.filter((item) => labelsOf(item).length === 0);
  if (picked.includes(UNLABELLED)) {
    return { shown: unlabelled, labels: [], unlabelled: unlabelled.length };
  }
  const known = new Set(items.flatMap(labelsOf));
  const live = picked.filter((id) => known.has(id));
  const shown = items.filter((item) => live.every((id) => labelsOf(item).includes(id)));
  const counts = new Map<string, number>();
  for (const item of shown) {
    for (const id of labelsOf(item)) {
      if (!live.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const labels = [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || nameOf(a.id).localeCompare(nameOf(b.id)));
  return { shown, labels, unlabelled: unlabelled.length };
}

/// Every label with how many items carry it, most used first, and how many carry none:
/// what a View of some labels is made from (D81).
export interface LabelCounts<L> {
  labels: { label: L; count: number }[];
  unlabelled: number;
}

export function labelCounts<T, L extends { id: string; name: string }>(
  items: T[],
  labelsOf: (item: T) => string[],
  labels: L[],
): LabelCounts<L> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const id of labelsOf(item)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    labels: labels
      .map((label) => ({ label, count: counts.get(label.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.name.localeCompare(b.label.name)),
    unlabelled: items.filter((item) => labelsOf(item).length === 0).length,
  };
}

/// Ticks or unticks `id`. Picking a label leaves the files without one, and those leave
/// every label: a file can't be both.
export function togglePick(picked: string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  if (id === UNLABELLED) return [UNLABELLED];
  return [...picked.filter((x) => x !== UNLABELLED), id];
}
