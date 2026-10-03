import { qk } from "#/lib/query-keys.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { getView, updateViewConfig, type ViewModule } from "#/lib/api/views.ts";
import { preferences } from "#/lib/preferences.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { viewTarget } from "./view-target";
import {
  type ViewConfig,
  parseViewConfig,
  sameViewConfig,
  serializeViewConfig,
} from "./view-config";

/// The filters and display a list page (Tasks, Assignments) works with, on its own
/// or opened on a saved View. On a View both start as saved and edits are a draft
/// until `save`. Off a View the same holds against the page's own saved default: the
/// display through `remember` and the filters under `filtersKey` (per Space when the
/// page has one), both per device.
export function useViewPage<D>({
  spaceId,
  module,
  viewId,
  readDisplay,
  normalizeDisplay,
  remember,
  filtersKey,
  defaultFilters,
}: {
  /// The Space whose page this is; unused (any value) on a cross-Space page.
  spaceId: string;
  module: ViewModule;
  viewId: string | undefined;
  readDisplay: () => D;
  normalizeDisplay: (stored: Partial<D>) => D;
  remember: (display: D) => void;
  /// Preference key the page's saved default filters live under.
  filtersKey: string;
  defaultFilters: ActiveFilter[];
}) {
  const queryClient = useQueryClient();
  const key = spaceId ? `${filtersKey}:${spaceId}` : filtersKey;
  // The page's own saved default: what it opens as when it is not on a View.
  const readPlain = (): ViewConfig<D> => {
    const raw = preferences.get(key);
    return {
      filters: raw
        ? parseViewConfig(`{"filters":${raw}}`, normalizeDisplay).filters
        : defaultFilters,
      display: readDisplay(),
    };
  };
  const [plain, setPlain] = useState(readPlain);
  const [display, setDisplayState] = useState<D>(plain.display);
  const [filters, setFilters] = useState<ActiveFilter[]>(plain.filters);

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
      const fresh = readPlain();
      setPlain(fresh);
      setFilters(fresh.filters);
      setDisplayState(fresh.display);
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

  const baseline = saved ?? plain;
  // Until a View has loaded there is nothing to compare against.
  const dirty = (!viewId || !!saved) && !sameViewConfig(baseline, { filters, display });

  const save = useMutation({
    mutationFn: async () => {
      if (!viewId) {
        remember(display);
        preferences.set(key, JSON.stringify(filters));
        setPlain({ filters, display });
        return null;
      }
      return updateViewConfig(viewId, serializeViewConfig(filters, display));
    },
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData(qk.views.byId(updated.entity.id), updated);
      // The View's own Space, which for a cross-Space page isn't `spaceId`.
      queryClient.invalidateQueries({ queryKey: qk.views.bySpace(updated.entity.spaceId) });
    },
  });

  return {
    display,
    setDisplay: setDisplayState,
    filters,
    setFilters,
    view: activeView,
    dirty,
    save,
    discard: () => {
      setFilters(baseline.filters);
      setDisplayState(baseline.display);
    },
  };
}
