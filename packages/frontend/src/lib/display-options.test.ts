import { describe, expect, it } from "vitest";
import {
  type BaseDisplay,
  normalizeBaseDisplay,
  normalizeCardDisplay,
  pick,
  readStoredDisplay,
  validSubGrouping,
} from "./display-options.ts";
import { preferences } from "./preferences.ts";

type G = "status" | "due" | "none";
type O = "due" | "title";
const GROUPINGS: { id: G }[] = [{ id: "status" }, { id: "due" }, { id: "none" }];
const ORDERINGS: { id: O }[] = [{ id: "due" }, { id: "title" }];
const DEFAULTS: BaseDisplay<G, O> = {
  layout: "list",
  grouping: "due",
  subGrouping: "none",
  ordering: "due",
  showEmpty: { board: true, list: false },
  hiddenColumns: [],
};
const normalize = (stored: Partial<BaseDisplay<G, O>>) =>
  normalizeBaseDisplay(stored, DEFAULTS, GROUPINGS, ORDERINGS);

/// A stored value as read back from disk, possibly hand edited or outdated.
function fromDisk(json: string): Partial<BaseDisplay<G, O>> {
  return JSON.parse(json);
}

describe("pick", () => {
  it("keeps an allowed value", () => {
    expect(pick("title", ORDERINGS, "due")).toBe("title");
  });

  it("falls back for an unknown value", () => {
    expect(pick("priority", ORDERINGS, "due")).toBe("due");
  });

  it("falls back for a missing value", () => {
    expect(pick(undefined, ORDERINGS, "due")).toBe("due");
  });
});

describe("validSubGrouping", () => {
  it("keeps a different sub-grouping", () => {
    expect(validSubGrouping<G>("status", "due")).toBe("due");
  });

  it("drops a sub-grouping equal to the grouping", () => {
    expect(validSubGrouping<G>("status", "status")).toBe("none");
  });

  it("drops any sub-grouping without a grouping", () => {
    expect(validSubGrouping<G>("none", "due")).toBe("none");
  });
});

describe("normalizeBaseDisplay", () => {
  it("returns the defaults for an empty value", () => {
    expect(normalize({})).toEqual(DEFAULTS);
  });

  it("keeps every valid field", () => {
    const display: BaseDisplay<G, O> = {
      layout: "board",
      grouping: "status",
      subGrouping: "due",
      ordering: "title",
      showEmpty: { board: false, list: true },
      hiddenColumns: ["done"],
    };
    expect(normalize(display)).toEqual(display);
  });

  it("falls back field by field for invalid values", () => {
    const stored = fromDisk('{"layout":"table","grouping":"priority","ordering":3}');
    expect(normalize(stored)).toEqual(DEFAULTS);
  });

  it("gives a board a grouping when stored without one", () => {
    expect(normalize({ layout: "board", grouping: "none" }).grouping).toBe("status");
  });

  it("lets a list go without grouping", () => {
    expect(normalize({ layout: "list", grouping: "none" }).grouping).toBe("none");
  });

  it("drops a sub-grouping that repeats the grouping", () => {
    expect(normalize({ grouping: "due", subGrouping: "due" }).subGrouping).toBe("none");
  });

  it("drops the sub-grouping of an ungrouped list", () => {
    expect(normalize({ layout: "list", grouping: "none", subGrouping: "due" }).subGrouping).toBe(
      "none",
    );
  });

  it("checks the sub-grouping against the board's forced grouping", () => {
    expect(normalize({ layout: "board", grouping: "none", subGrouping: "status" })).toMatchObject({
      grouping: "status",
      subGrouping: "none",
    });
  });

  it("shows empty board groups unless turned off, and empty list groups only when turned on", () => {
    expect(normalize({}).showEmpty).toEqual({ board: true, list: false });
    const stored = fromDisk('{"showEmpty":{"board":"no","list":1}}');
    expect(normalize(stored).showEmpty).toEqual({ board: true, list: false });
  });

  it("keeps only the string ids of hidden columns", () => {
    const stored = fromDisk('{"hiddenColumns":["a",2,null,"b"]}');
    expect(normalize(stored).hiddenColumns).toEqual(["a", "b"]);
  });

  it("ignores hidden columns that aren't a list", () => {
    const stored = fromDisk('{"hiddenColumns":"done"}');
    expect(normalize(stored).hiddenColumns).toEqual([]);
  });
});

describe("readStoredDisplay", () => {
  const KEY = "nookly:test-display";

  it("returns the fallback when nothing is stored", () => {
    expect(readStoredDisplay(KEY, normalize, DEFAULTS)).toBe(DEFAULTS);
  });

  it("normalizes a stored value", () => {
    preferences.set(KEY, JSON.stringify({ layout: "board", grouping: "none" }));
    expect(readStoredDisplay(KEY, normalize, DEFAULTS)).toMatchObject({
      layout: "board",
      grouping: "status",
    });
    preferences.remove(KEY);
  });

  it("returns the fallback for corrupt JSON", () => {
    preferences.set(KEY, "{not json");
    expect(readStoredDisplay(KEY, normalize, DEFAULTS)).toBe(DEFAULTS);
    preferences.remove(KEY);
  });

  it("returns the fallback for an empty string", () => {
    preferences.set(KEY, "");
    expect(readStoredDisplay(KEY, normalize, DEFAULTS)).toBe(DEFAULTS);
    preferences.remove(KEY);
  });

  it("returns the fallback when the stored JSON is null", () => {
    preferences.set(KEY, "null");
    expect(readStoredDisplay(KEY, normalize, DEFAULTS)).toBe(DEFAULTS);
    preferences.remove(KEY);
  });
});

describe("normalizeCardDisplay", () => {
  const defaults = { grouping: "none", ordering: "due" } satisfies { grouping: G; ordering: O };

  it("defaults to a grid", () => {
    expect(normalizeCardDisplay({}, defaults, GROUPINGS, ORDERINGS)).toEqual({
      layout: "grid",
      grouping: "none",
      ordering: "due",
    });
  });

  it("keeps a list layout and valid choices", () => {
    expect(
      normalizeCardDisplay(
        { layout: "list", grouping: "status", ordering: "title" },
        defaults,
        GROUPINGS,
        ORDERINGS,
      ),
    ).toEqual({ layout: "list", grouping: "status", ordering: "title" });
  });

  it("turns any other layout into a grid", () => {
    expect(normalizeCardDisplay({ layout: "board" }, defaults, GROUPINGS, ORDERINGS).layout).toBe(
      "grid",
    );
  });

  it("falls back for unknown groupings and orderings", () => {
    expect(
      normalizeCardDisplay({ grouping: "kind", ordering: "size" }, defaults, GROUPINGS, ORDERINGS),
    ).toMatchObject({ grouping: "none", ordering: "due" });
  });
});
