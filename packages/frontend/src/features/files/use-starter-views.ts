import { UNSORTED_VIEW, needsUnsortedView } from "@nookly/shared/file-views";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createView, listViews } from "#/lib/api/views.ts";
import { preferences } from "#/lib/preferences.ts";
import { qk } from "#/lib/query-keys.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

/// Gives a Space the Unsorted view on its first visit to Files, unless it has one like it.
/// Done once per Space on this device, so a view that was deleted stays deleted.
export function useStarterViews(spaceId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const key = `${STORAGE_KEYS.filesStarterViews}:${spaceId}`;
    if (preferences.get(key)) return;
    let cancelled = false;
    void (async () => {
      const views = await listViews(spaceId, "files");
      if (cancelled) return;
      preferences.set(key, "done");
      if (!needsUnsortedView(views.map((v) => ({ title: v.entity.title, config: v.config })))) {
        return;
      }
      await createView(spaceId, UNSORTED_VIEW.title, "files", UNSORTED_VIEW.config, null);
      await queryClient.invalidateQueries({ queryKey: qk.views.bySpace(spaceId) });
      await queryClient.invalidateQueries({ queryKey: qk.entity.root });
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, queryClient]);
}
