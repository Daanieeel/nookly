import { describe, expect, it } from "vitest";
import { requestFilters } from "#/features/views/pending-filters.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { UNREFINED_JOT_FILTERS, initialJotFilters } from "./JotsListView";

describe("initialJotFilters", () => {
  it("opens on the unrefined Jots a link asked for, whatever preset was picked before", () => {
    preferences.set(STORAGE_KEYS.jotsPreset, "refined");
    expect(initialJotFilters()).toEqual([{ fieldId: "link", operator: "is", values: ["linked"] }]);
    requestFilters(STORAGE_KEYS.jotsPreset, UNREFINED_JOT_FILTERS);
    expect(initialJotFilters()).toEqual(UNREFINED_JOT_FILTERS);
  });
});
