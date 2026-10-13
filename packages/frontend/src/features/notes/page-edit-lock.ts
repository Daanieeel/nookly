import { useEffect } from "react";
import { create } from "zustand";
import { useTabGroupScope } from "#/components/tab-group-scope.ts";
import { useNavStore } from "#/lib/store/nav.ts";

/// How many editors of each page are open, per tab group.
const useOpenEditors = create<{ open: Record<string, Record<string, number>> }>(() => ({
  open: {},
}));

function change(entityId: string, groupId: string, delta: 1 | -1) {
  useOpenEditors.setState(({ open }) => {
    const groups = { ...open[entityId] };
    const count = (groups[groupId] ?? 0) + delta;
    if (count > 0) groups[groupId] = count;
    else delete groups[groupId];
    return { open: { ...open, [entityId]: groups } };
  });
}

/// Whether this page's editor must stay read only: the same page is open in the other
/// tab group too, and that group is the focused one. Each editor keeps its own copy of
/// the document and saves it block by block, so two of them typing at once would
/// overwrite each other. Only the focused group's copy writes; the other follows
/// along from what it saves, and takes over when its group is focused.
export function usePageEditLock(entityId: string): boolean {
  const { groupId } = useTabGroupScope();
  useEffect(() => {
    change(entityId, groupId, 1);
    return () => change(entityId, groupId, -1);
  }, [entityId, groupId]);
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  const openElsewhere = useOpenEditors((s) =>
    Object.keys(s.open[entityId] ?? {}).some((id) => id !== groupId),
  );
  return openElsewhere && focusedGroupId !== groupId;
}
