import { describe, expect, it } from "vitest";
import { HOTKEYS } from "#/lib/hotkeys.ts";
import { SHORTCUT_META, SHORTCUT_NAMES, shortcutSettingId } from "#/lib/shortcuts.ts";
import {
  SETTINGS,
  SETTING_CATEGORIES,
  SETTING_IDS,
  definitionOf,
  parseFileViewerTheme,
} from "./registry.ts";

describe("settings registry", () => {
  it("keys every setting by its own unique id", () => {
    const ids = SETTING_IDS.map((id) => definitionOf(id).id);
    expect(ids).toEqual(SETTING_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses a valid category, matching the id prefix", () => {
    for (const id of SETTING_IDS) {
      const def = definitionOf(id);
      expect(SETTING_CATEGORIES).toContain(def.category);
      expect(id.startsWith(`${def.category}.`)).toBe(true);
    }
  });

  it("describes every setting for search", () => {
    for (const id of SETTING_IDS) {
      const def = definitionOf(id);
      expect(def.title).not.toBe("");
      expect(def.description).not.toBe("");
      expect(def.synonyms.length).toBeGreaterThan(0);
    }
  });

  it("keeps every default valid and every legacy key unique", () => {
    for (const id of SETTING_IDS) {
      const def = definitionOf(id);
      expect(def.parse(def.default)).toEqual(def.default);
    }
    const legacy = SETTING_IDS.map((id) => definitionOf(id).legacyKey).filter(Boolean);
    expect(new Set(legacy).size).toBe(legacy.length);
  });

  it("falls back to the default for garbage", () => {
    for (const id of SETTING_IDS) {
      const def = definitionOf(id);
      for (const junk of [null, 42.5, {}, [], false, ""]) {
        if ((id === "backup.auto" || id === "notes.arrowLigatures") && junk === false) {
          continue;
        }
        // A shortcut's null means unassigned, which is a value of its own.
        if (id.startsWith("shortcuts.") && junk === null) continue;
        expect(def.parse(junk)).toEqual(def.default);
      }
    }
  });

  it("parses typed values", () => {
    expect(SETTINGS["appearance.theme"].parse("dark")).toBe("dark");
    expect(SETTINGS["general.effortScale"].parse("fibonacci")).toBe("fibonacci");
    expect(SETTINGS["backup.auto"].parse(true)).toBe(true);
    expect(SETTINGS["backup.auto"].parse("1")).toBe(false);
    expect(SETTINGS["backup.folder"].parse("")).toBeNull();
    expect(SETTINGS["general.timezone"].parse("")).toBe("system");
    expect(SETTINGS["calendar.sessionLengthMinutes"].parse(45)).toBe(45);
    expect(SETTINGS["calendar.sessionLengthMinutes"].parse(0)).toBe(90);
    expect(SETTINGS["calendar.calendarEntryLengthMinutes"].parse("30")).toBe(60);
  });

  it("defaults the new calendar lengths", () => {
    expect(SETTINGS["calendar.sessionLengthMinutes"].default).toBe(90);
    expect(SETTINGS["calendar.calendarEntryLengthMinutes"].default).toBe(60);
  });

  it("keeps lengths to whole steps of five minutes between 5 and 720", () => {
    const length = SETTINGS["calendar.sessionLengthMinutes"];
    expect(length.parse(5)).toBe(5);
    expect(length.parse(720)).toBe(720);
    for (const bad of [0, 4, 7, 722, 725, -5]) expect(length.parse(bad)).toBe(90);
    expect(SETTINGS["calendar.calendarEntryLengthMinutes"].parse(47)).toBe(60);
  });

  it("defaults the calendar layout and editor settings to today's behaviour", () => {
    expect(SETTINGS["calendar.weekStart"].default).toBe("auto");
    expect(SETTINGS["calendar.dayStartHour"].default).toBe(7);
    expect(SETTINGS["calendar.snapMinutes"].default).toBe(15);
    expect(SETTINGS["notes.arrowLigatures"].default).toBe(true);
  });

  it("validates the calendar layout and editor settings", () => {
    const week = SETTINGS["calendar.weekStart"];
    for (const ok of ["auto", "monday", "sunday", "saturday"]) expect(week.parse(ok)).toBe(ok);
    expect(week.parse("friday")).toBe("auto");
    const hour = SETTINGS["calendar.dayStartHour"];
    expect(hour.parse(0)).toBe(0);
    expect(hour.parse(23)).toBe(23);
    expect(hour.parse(24)).toBe(7);
    expect(hour.parse(-1)).toBe(7);
    const snap = SETTINGS["calendar.snapMinutes"];
    for (const ok of [5, 10, 15, 30]) expect(snap.parse(ok)).toBe(ok);
    expect(snap.parse(20)).toBe(15);
    expect(SETTINGS["notes.arrowLigatures"].parse(false)).toBe(false);
  });

  it("registers one setting per shortcut, defaulting to its current key", () => {
    for (const name of SHORTCUT_NAMES) {
      const def = SETTINGS[shortcutSettingId(name)];
      expect(def.category).toBe("shortcuts");
      expect(def.default).toBe(HOTKEYS[name]);
      expect(def.title).toBe(SHORTCUT_META[name].title);
    }
    expect(SETTING_IDS.filter((id) => id.startsWith("shortcuts."))).toHaveLength(
      SHORTCUT_NAMES.length,
    );
  });

  it("validates a shortcut: a known hotkey, a string or null, nothing else", () => {
    const search = SETTINGS["shortcuts.search"];
    expect(search.parse("Mod+Shift+K")).toBe("Mod+Shift+K");
    expect(search.parse(null)).toBeNull();
    expect(search.parse("")).toBe("Mod+K");
    expect(search.parse("Mod+Nonsense")).toBe("Mod+K");
    expect(search.parse("Foo+K")).toBe("Mod+K");
    expect(search.parse(42)).toBe("Mod+K");
    expect(search.parse(["Mod+K"])).toBe("Mod+K");
    // A bare letter is only for shortcuts that are a bare key today.
    expect(search.parse("K")).toBe("Mod+K");
    expect(SETTINGS["shortcuts.today"].parse("G")).toBe("G");
  });

  it("turns the legacy backup flag into a boolean", () => {
    const def = SETTINGS["backup.auto"];
    expect(def.fromLegacy?.("1")).toBe(true);
    expect(def.fromLegacy?.("0")).toBe(false);
  });

  it("reads the old system file viewer theme as the defaults", () => {
    expect(parseFileViewerTheme("system")).toBe("defaults");
    expect(parseFileViewerTheme(null)).toBe("defaults");
    expect(parseFileViewerTheme("light")).toBe("light");
  });
});
