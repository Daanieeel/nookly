import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { useTabGroupScope } from "#/components/tab-group-scope.ts";
import { syncRuntime } from "#/features/sync/sync-instance.ts";
import { qk } from "#/lib/query-keys.ts";
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
///
/// A page someone shared with this account to view only stays read only too.
export function usePageEditLock(entityId: string, spaceId?: string): boolean {
  const { groupId } = useTabGroupScope();
  const shared = spaceId?.startsWith("shared-") ?? false;
  const { data: role } = useQuery({
    queryKey: qk.sync.role(entityId),
    queryFn: () => syncRuntime.engine.roleOf(entityId),
    enabled: shared,
  });
  useEffect(() => {
    change(entityId, groupId, 1);
    return () => change(entityId, groupId, -1);
  }, [entityId, groupId]);
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  const openElsewhere = useOpenEditors((s) =>
    Object.keys(s.open[entityId] ?? {}).some((id) => id !== groupId),
  );
  return role === "viewer" || (openElsewhere && focusedGroupId !== groupId);
}
