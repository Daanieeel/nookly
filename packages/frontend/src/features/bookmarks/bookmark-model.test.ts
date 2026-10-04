import { describe, expect, it } from "vitest";
import { buildGroups } from "#/components/grouped-view/grouping.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeBookmark, makeLabel } from "#/test/fixtures.ts";
import { freezeTime } from "#/test/time.ts";
import {
  bookmarkGroupDefs,
  bookmarkTitle,
  hostOf,
  orderBookmarks,
  readDisplay,
  writeDisplay,
} from "./bookmark-model.ts";

const DEFAULTS = {
  layout: "grid",
  grouping: "none",
  ordering: "newest",
  showPreviews: true,
  showDescriptions: true,
};
const ids = (items: { entity: { id: string } }[]) => items.map((b) => b.entity.id);

describe("hostOf", () => {
  it("drops the www", () => {
    expect(hostOf("https://www.example.com/a/b?c")).toBe("example.com");
  });

  it("keeps other subdomains", () => {
    expect(hostOf("https://docs.example.com")).toBe("docs.example.com");
  });

  it("returns the raw text for something that isn't a URL", () => {
    expect(hostOf("not a url")).toBe("not a url");
  });
});

describe("readDisplay", () => {
  it("reads the defaults when nothing is saved", () => {
    expect(readDisplay()).toEqual(DEFAULTS);
  });

  it("reads back what was written, switched off toggles included", () => {
    const display = {
      layout: "list" as const,
      grouping: "site" as const,
      ordering: "title" as const,
      showPreviews: false,
      showDescriptions: false,
    };
    writeDisplay(display);
    expect(readDisplay()).toEqual(display);
  });

  it("falls back for an unreadable value", () => {
    preferences.set(STORAGE_KEYS.bookmarksDisplay, "{");
    expect(readDisplay()).toEqual(DEFAULTS);
  });

  it("falls back field by field", () => {
    preferences.set(
      STORAGE_KEYS.bookmarksDisplay,
      JSON.stringify({ layout: "board", grouping: "added", ordering: "popular" }),
    );
    expect(readDisplay()).toEqual({ ...DEFAULTS, grouping: "added" });
  });

  it("falls back to the defaults for a stored null", () => {
    preferences.set(STORAGE_KEYS.bookmarksDisplay, "null");
    expect(readDisplay()).toEqual(DEFAULTS);
  });
});

describe("bookmarkTitle", () => {
  it("uses the typed title", () => {
    expect(bookmarkTitle(makeBookmark({ fetchedTitle: "Fetched" }, { title: "Mine" }))).toBe(
      "Mine",
    );
  });

  it("uses the page's title when the title is only the URL", () => {
    const bookmark = makeBookmark(
      { url: "https://example.com", fetchedTitle: "Example Domain" },
      { title: "https://example.com" },
    );
    expect(bookmarkTitle(bookmark)).toBe("Example Domain");
  });

  it("falls back to the placeholder for an empty title", () => {
    expect(bookmarkTitle(makeBookmark({}, { title: " " }))).toBe("Untitled Bookmark");
  });
});

describe("orderBookmarks", () => {
  const bookmarks = [
    makeBookmark({}, { id: "mid", title: "beta", createdAt: "2026-02-01T00:00:00Z" }),
    makeBookmark({}, { id: "old", title: "Alpha", createdAt: "2026-01-01T00:00:00Z" }),
    makeBookmark({}, { id: "new", title: "gamma", createdAt: "2026-03-01T00:00:00Z" }),
  ];

  it("orders newest and oldest first", () => {
    expect(ids(orderBookmarks(bookmarks, "newest"))).toEqual(["new", "mid", "old"]);
    expect(ids(orderBookmarks(bookmarks, "oldest"))).toEqual(["old", "mid", "new"]);
  });

  it("orders by title", () => {
    expect(ids(orderBookmarks(bookmarks, "title"))).toEqual(["old", "mid", "new"]);
  });

  it("never reorders the input", () => {
    orderBookmarks(bookmarks, "oldest");
    expect(ids(bookmarks)).toEqual(["mid", "old", "new"]);
  });
});

describe("bookmarkGroupDefs", () => {
  it("has no groups without a grouping", () => {
    expect(bookmarkGroupDefs("none", [], [])).toBeNull();
  });

  it("groups by site in order of first appearance", () => {
    const bookmarks = [
      makeBookmark({ url: "https://b.com/1" }, { id: "1" }),
      makeBookmark({ url: "https://www.a.com" }, { id: "2" }),
      makeBookmark({ url: "https://b.com/2" }, { id: "3" }),
    ];
    const groups = buildGroups(bookmarks, bookmarkGroupDefs("site", bookmarks, []) ?? [], null);
    expect(groups.map((g) => [g.name, ids(g.items)])).toEqual([
      ["b.com", ["1", "3"]],
      ["a.com", ["2"]],
    ]);
  });

  it("groups by label with unlabelled ones last", () => {
    const bookmarks = [
      makeBookmark({ labelIds: ["l1"] }, { id: "1" }),
      makeBookmark({ labelIds: [] }, { id: "2" }),
    ];
    const labels = [makeLabel({ id: "l1", name: "Read later" })];
    const groups = buildGroups(
      bookmarks,
      bookmarkGroupDefs("label", bookmarks, labels) ?? [],
      null,
    );
    expect(groups.map((g) => [g.name, ids(g.items)])).toEqual([
      ["Read later", ["1"]],
      ["No label", ["2"]],
    ]);
  });

  it("groups by when they were added", () => {
    freezeTime("2026-03-31T12:00:00");
    const bookmarks = [
      makeBookmark({}, { id: "today", createdAt: "2026-03-31T08:00:00Z" }),
      makeBookmark({}, { id: "week", createdAt: "2026-03-25T08:00:00Z" }),
      makeBookmark({}, { id: "month", createdAt: "2026-03-01T08:00:00Z" }),
      makeBookmark({}, { id: "old", createdAt: "2025-12-01T08:00:00Z" }),
    ];
    const groups = buildGroups(bookmarks, bookmarkGroupDefs("added", bookmarks, []) ?? [], null);
    expect(groups.map((g) => [g.id, ids(g.items)])).toEqual([
      ["today", ["today"]],
      ["week", ["week"]],
      ["month", ["month"]],
      ["earlier", ["old"]],
    ]);
  });
});
