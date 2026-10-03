import { type GroupDef, type ViewGroup, buildGroups } from "./grouping.ts";

/// Splits `items` (already in display order) by the grouping and sub-grouping defs,
/// as `buildGroups` does, falling back to one group named `allName` without a
/// grouping, and dropping empty groups unless the layout shows them.
export function buildVisibleGroups<T>(
  items: T[],
  defs: GroupDef<T>[] | null,
  subDefs: GroupDef<T>[] | null,
  allName: string,
  showEmpty: boolean,
): ViewGroup<T>[] {
  return buildGroups(
    items,
    defs ?? [{ id: "all", name: allName, match: () => true }],
    subDefs,
  ).filter((g) => showEmpty || g.items.length > 0);
}
