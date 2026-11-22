import { describe, expect, it } from "vitest";
import { requestFilters } from "#/features/views/pending-filters.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { UNREFINED_JOT_FILTERS, initialJotFilters } from "./JotsListView";

describe("initialJotFilters", () => {
  // The Refined and This week presets are gone: a device that last picked one opens on the
  // inbox, the Jots still to refine.
  it("opens on the inbox for a preset that no longer exists", () => {
    preferences.set(STORAGE_KEYS.jotsPreset, "week");
    expect(initialJotFilters()).toEqual(UNREFINED_JOT_FILTERS);
  });

  it("opens on the unrefined Jots a link asked for, whatever preset was picked before", () => {
    preferences.set(STORAGE_KEYS.jotsPreset, "all");
    expect(initialJotFilters()).toEqual([]);
    requestFilters(STORAGE_KEYS.jotsPreset, UNREFINED_JOT_FILTERS);
    expect(initialJotFilters()).toEqual(UNREFINED_JOT_FILTERS);
  });
});
