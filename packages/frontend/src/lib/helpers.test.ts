import { describe, expect, it } from "vitest";
import { freezeTime, setDateTimeSettings } from "#/test/time.ts";
import { effortLabel, useEffortSettings } from "./effort.ts";
import {
  compareKeys,
  isKeyQuery,
  keyKeywords,
  matchesKey,
  matchesTitleOrKey,
} from "./entity-key.ts";
import { displayTitle, labelForType } from "./entity-title.ts";
import { preferences } from "./preferences.ts";
import { formatEditedAt } from "./relative-time.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";

describe("entity titles", () => {
  it("names every entity type", () => {
    expect(labelForType("task")).toBe("Task");
    expect(labelForType("sub_task")).toBe("Task");
    expect(labelForType("index_card_deck")).toBe("Deck");
    expect(labelForType("course_notes")).toBe("Course Notes");
  });

  it("calls an unknown type an Item", () => {
    expect(labelForType("hologram")).toBe("Item");
  });

  it("keeps a real title", () => {
    expect(displayTitle({ title: "Buy milk", type: "task" })).toBe("Buy milk");
  });

  it("falls back for an empty or blank title", () => {
    expect(displayTitle({ title: "", type: "note" })).toBe("Untitled Note");
    expect(displayTitle({ title: "   \n", type: "exam" })).toBe("Untitled Exam");
    expect(displayTitle({ title: "", type: "mystery" })).toBe("Untitled Item");
  });

  it("trims surrounding whitespace", () => {
    expect(displayTitle({ title: "  Spaced  ", type: "task" })).toBe("Spaced");
  });
});

describe("entity keys", () => {
  it.each([
    ["TSK-14", "TSK-14", true],
    ["TSK-14", "tsk14", true],
    ["TSK-14", "tsk 1", true],
    ["TSK-10", "TSK-1", true],
    ["TSK-14", "TSK-", true],
    ["TSK-14", "TSK-2", false],
    ["NOT-1", "NOT-1", true],
    ["TSK-14", "not", false],
    ["TSK-14", "tsk", false],
    ["TSK-14", "NOT-14", false],
    ["TSK-14", "  tsk-14  ", true],
  ])("%s matches %s: %s", (key, query, matches) => {
    expect(matchesKey(key, query)).toBe(matches);
  });

  it("tells a key lookup from a title search", () => {
    expect(isKeyQuery("tsk-3")).toBe(true);
    expect(isKeyQuery("TSK-")).toBe(true);
    expect(isKeyQuery("note")).toBe(false);
    expect(isKeyQuery("task 3")).toBe(false);
  });

  it("orders the shortest number first", () => {
    const keys = [{ key: "FIL-233" }, { key: "FIL-3" }, { key: "FIL-23" }, { key: "FIL-1" }];
    expect([...keys].sort(compareKeys).map((k) => k.key)).toEqual([
      "FIL-1",
      "FIL-3",
      "FIL-23",
      "FIL-233",
    ]);
  });

  it("matches by title or key", () => {
    const entity = { title: "Write Thesis", key: "TSK-7" };
    expect(matchesTitleOrKey(entity, "thesis")).toBe(true);
    expect(matchesTitleOrKey(entity, "tsk7")).toBe(true);
    expect(matchesTitleOrKey(entity, "")).toBe(true);
    expect(matchesTitleOrKey(entity, "exam")).toBe(false);
    expect(matchesTitleOrKey(entity, "untitled", "Untitled Task")).toBe(true);
  });

  it("gives an entity row keywords for both key spellings", () => {
    expect(keyKeywords("TSK-14")).toEqual(["TSK-14", "TSK14"]);
  });
});

describe("effort", () => {
  it("labels a step in either scale", () => {
    expect(effortLabel(1, "tshirt")).toBe("XS");
    expect(effortLabel(13, "tshirt")).toBe("XXL");
    expect(effortLabel(8, "fibonacci")).toBe("8");
  });

  it("shows an off scale value as its number", () => {
    expect(effortLabel(4, "tshirt")).toBe("4");
  });

  it("remembers the chosen scale", () => {
    useEffortSettings.getState().update({ scale: "fibonacci" });
    expect(useEffortSettings.getState().scale).toBe("fibonacci");
    expect(preferences.get(STORAGE_KEYS.effortScale)).toBe("fibonacci");
    useEffortSettings.getState().update({ scale: "tshirt" });
  });
});

describe("formatEditedAt", () => {
  const now = new Date("2026-03-11T12:00:00Z");

  it.each([
    ["2026-03-11T11:59:30Z", "Just now"],
    ["2026-03-11T11:55:00Z", "5m ago"],
    ["2026-03-11T09:00:00Z", "3h ago"],
    ["2026-03-09T12:00:00Z", "2d ago"],
    ["2026-03-04T12:00:01Z", "6d ago"],
  ])("writes %s as %s", (iso, text) => {
    expect(formatEditedAt(iso, now)).toBe(text);
  });

  it("switches to a date after a week", () => {
    setDateTimeSettings({ dateFormat: "american" });
    expect(formatEditedAt("2026-03-01T12:00:00Z", now)).toBe("Mar 1");
    expect(formatEditedAt("2025-03-01T12:00:00Z", now)).toBe("Mar 1, 2025");
  });

  it("treats a future time as just now", () => {
    freezeTime("2026-03-11T12:00:00Z");
    expect(formatEditedAt("2026-03-11T13:00:00Z")).toBe("Just now");
  });
});
