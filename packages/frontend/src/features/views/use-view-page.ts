import { qk } from "#/lib/query-keys.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { getView, updateViewConfig, type ViewModule } from "#/lib/api/views.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { viewTarget } from "./view-target";
import { parseViewConfig, sameViewConfig, serializeViewConfig } from "./view-config";

/// The filters and display a list page (Tasks, Assignments) works with, on its own
/// or opened on a saved View. On a View both start as saved and edits are a draft
/// until `save`; off a View, the display is remembered per device through `remember`.
export function useViewPage<D>({
  spaceId,
  module,
  viewId,
  readDisplay,
  normalizeDisplay,
  remember,
  defaultFilters,
}: {
  /// The Space whose page this is; unused (any value) on a cross-Space page.
  spaceId: string;
  module: ViewModule;
  viewId: string | undefined;
  readDisplay: () => D;
  normalizeDisplay: (stored: Partial<D>) => D;
  remember: (display: D) => void;
  defaultFilters: ActiveFilter[];
}) {
  const queryClient = useQueryClient();
  const [display, setDisplayState] = useState<D>(readDisplay);
  const [filters, setFilters] = useState<ActiveFilter[]>(defaultFilters);

  const { data: view } = useQuery({
    queryKey: qk.views.byId(viewId),
    queryFn: () => getView(viewId ?? ""),
    enabled: !!viewId,
  });
  // A trashed View is gone as far as the page goes.
  const activeView = view && !view.entity.deletedAt ? view : undefined;
  const saved = useMemo(
    () => (activeView ? parseViewConfig(activeView.config, normalizeDisplay) : null),
    [activeView, normalizeDisplay],
  );

  // Opening a View, or leaving one for the plain page, resets the working state.
  const wasView = useRef(false);
  useEffect(() => {
    if (saved) {
      setFilters(saved.filters);
      setDisplayState(saved.display);
      wasView.current = true;
    } else if (!viewId && wasView.current) {
      setFilters(defaultFilters);
      setDisplayState(readDisplay());
      wasView.current = false;
    }
    // Only a different View, or a save of this one, resets what the user is editing.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, viewId]);

  useEffect(() => {
    if (!view?.entity.deletedAt) return;
    const { setView } = useNavStore.getState();
    setView(viewTarget(module, spaceId));
  }, [view, spaceId, module]);

  const setDisplay = (next: D) => {
    setDisplayState(next);
    if (!viewId) remember(next);
  };

  const dirty = !!saved && !sameViewConfig(saved, { filters, display });

  const save = useMutation({
    mutationFn: () => updateViewConfig(viewId ?? "", serializeViewConfig(filters, display)),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.views.byId(updated.entity.id), updated);
      // The View's own Space, which for a cross-Space page isn't `spaceId`.
      queryClient.invalidateQueries({ queryKey: qk.views.bySpace(updated.entity.spaceId) });
    },
  });

  return {
    display,
    setDisplay,
    filters,
    setFilters,
    view: activeView,
    dirty,
    save,
    discard: () => {
      if (!saved) return;
      setFilters(saved.filters);
      setDisplayState(saved.display);
    },
  };
}
