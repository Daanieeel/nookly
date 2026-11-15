import { z } from "zod";
import { useDraftPreference } from "../data/preferences.ts";
import {
  ENTITY_FILTERS_NONE,
  ENTITY_FILTER_PICKS,
  type EntityFilterState,
} from "./entity-filters.tsx";
import { SaveBar } from "./SaveBar.tsx";

/// What a page picked in each of its own filters (by name), and in the filters every list
/// has (pinned, created, updated).
const pageFiltersSchema = z.object({
  picks: z.record(z.string(), z.array(z.string())).default({}),
  ...ENTITY_FILTER_PICKS,
});
type PageFilters = z.infer<typeof pageFiltersSchema>;
const NONE: PageFilters = { picks: {}, ...ENTITY_FILTERS_NONE };
const NOTHING: string[] = [];

/// The filters of a page that has no display options (Courses, Exams, Decks, Recipes, Trash),
/// kept like every other page's: a change waits in the save bar until saved or discarded.
export function usePageFilters(key: string) {
  const draft = useDraftPreference(key, pageFiltersSchema, NONE);
  const value = draft.value;
  return {
    /// The ids picked in the filter `name`; none means all.
    picked: (name: string) => value.picks[name] ?? NOTHING,
    pick: (name: string) => (next: string[]) =>
      draft.set({ ...value, picks: { ...value.picks, [name]: next } }),
    entity: value satisfies EntityFilterState,
    setEntity: (next: EntityFilterState) => draft.set({ ...value, ...next }),
    clear: () => draft.set(NONE),
    saveBar: <SaveBar dirty={draft.dirty} onDiscard={draft.discard} onSave={draft.save} />,
  };
}
