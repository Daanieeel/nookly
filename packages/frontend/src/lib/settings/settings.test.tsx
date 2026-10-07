import { act, renderHook } from "@testing-library/react";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callsOf, mockCommandWith } from "#/test/tauri.ts";
import type { SettingJson } from "./registry.ts";

const PREFS_RID = 1;
const SETTINGS_RID = 2;

/// What the store plugin's commands are sent.
const StoreArgs = z.object({
  rid: z.number().optional(),
  path: z.string().optional(),
  key: z.string().default(""),
  value: z.json().optional(),
});

type FileContent = Record<string, SettingJson>;

interface FakeFile {
  disk: FileContent;
  memory: FileContent;
}

/// Fake `preferences.json` and `settings.json` behind the store plugin: `disk` is
/// the file, `memory` the plugin's cache. Only `save` copies memory to disk and
/// `reload` copies disk back, as the real plugin does (preferences autosave, so its
/// writes land on disk at once here). `order` logs every settings operation.
function fakeFiles(
  files: { settings?: FileContent; prefs?: FileContent },
  opts: { saveFails?: boolean } = {},
) {
  const prefs: FakeFile = { disk: { ...files.prefs }, memory: { ...files.prefs } };
  const settings: FakeFile = { disk: { ...files.settings }, memory: { ...files.settings } };
  const order: string[] = [];
  const parse = (args: InvokeArgs | undefined) => {
    const parsed = StoreArgs.parse(args);
    const file = parsed.rid === PREFS_RID ? prefs : settings;
    const log = (what: string) => {
      if (file === settings) order.push(what);
    };
    return { ...parsed, file, log, isPrefs: file === prefs };
  };
  mockCommandWith("plugin:store|load", (a) =>
    parse(a).path === "preferences.json" ? PREFS_RID : SETTINGS_RID,
  );
  mockCommandWith("plugin:store|entries", (a) => Object.entries(parse(a).file.memory));
  mockCommandWith("plugin:store|set", (a) => {
    const { key, value, file, log, isPrefs } = parse(a);
    file.memory[key] = value ?? null;
    if (isPrefs) file.disk[key] = value ?? null;
    log(`set:${key}`);
    return null;
  });
  mockCommandWith("plugin:store|delete", (a) => {
    const { key, file, log, isPrefs } = parse(a);
    delete file.memory[key];
    if (isPrefs) delete file.disk[key];
    log(`delete:${key}`);
    return true;
  });
  mockCommandWith("plugin:store|get", (a) => {
    const { key, file } = parse(a);
    return [file.memory[key] ?? null, key in file.memory];
  });
  mockCommandWith("plugin:store|save", (a) => {
    if (opts.saveFails) throw new Error("disk full");
    const { file, log } = parse(a);
    file.disk = { ...file.memory };
    log("save");
    return null;
  });
  mockCommandWith("plugin:store|reload", (a) => {
    const { file, log } = parse(a);
    file.memory = { ...file.disk };
    log("reload");
    return null;
  });
  return { prefs, settings, order };
}

/// Fresh modules and a started app, as on launch: preferences load, then settings.
async function launch() {
  vi.resetModules();
  const { initPreferences, preferences } = await import("#/lib/preferences.ts");
  await initPreferences();
  const mod = await import("./settings.ts");
  return { ...mod, preferences };
}

const MARKER = { "nookly:file-viewer-theme-backfill": "1" };

describe("settings", () => {
  it("falls back to the defaults before and without a file", async () => {
    fakeFiles({});
    const { settings, initSettings } = await launch();
    expect(settings.get("appearance.theme")).toBe("system");
    await initSettings();
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(90);
    const loads = callsOf("plugin:store|load").map((c) => StoreArgs.parse(c).path);
    expect(loads).toContain("settings.json");
  });

  it("reads saved values and validates them", async () => {
    fakeFiles({
      settings: {
        "appearance.theme": "dark",
        "backup.auto": true,
        "general.effortScale": "bogus",
        "something.future": 1,
      },
    });
    const { settings, initSettings } = await launch();
    await initSettings();
    expect(settings.get("appearance.theme")).toBe("dark");
    expect(settings.get("backup.auto")).toBe(true);
    expect(settings.get("general.effortScale")).toBe("tshirt");
  });

  it("writes typed values to the store and resets by deleting", async () => {
    const { settings: file } = fakeFiles({});
    const { settings, initSettings } = await launch();
    await initSettings();
    settings.set("backup.auto", true);
    settings.set("calendar.sessionLengthMinutes", 45);
    expect(settings.get("backup.auto")).toBe(true);
    await vi.waitFor(() =>
      expect(file.memory).toEqual({
        "backup.auto": true,
        "calendar.sessionLengthMinutes": 45,
      }),
    );
    settings.reset("calendar.sessionLengthMinutes");
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(90);
    await vi.waitFor(() => expect(file.memory).toEqual({ "backup.auto": true }));
  });

  it("stores an invalid value as the default instead", async () => {
    fakeFiles({});
    const { settings, initSettings } = await launch();
    await initSettings();
    // @ts-expect-error deliberately wrong at runtime
    settings.set("calendar.sessionLengthMinutes", "soon");
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(90);
  });

  it("notifies subscribers outside React", async () => {
    fakeFiles({});
    const { settings, initSettings, subscribeSetting } = await launch();
    await initSettings();
    const seen: unknown[] = [];
    const off = subscribeSetting("appearance.theme", (v) => seen.push(v));
    settings.set("appearance.theme", "dark");
    settings.set("general.effortScale", "fibonacci");
    off();
    settings.set("appearance.theme", "light");
    expect(seen).toEqual(["dark"]);
  });

  it("re-renders a hook when its setting changes", async () => {
    fakeFiles({});
    const { settings, initSettings, useSetting } = await launch();
    await initSettings();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useSetting("appearance.theme");
    });
    expect(result.current[0]).toBe("system");
    act(() => result.current[1]("dark"));
    expect(result.current[0]).toBe("dark");
    const before = renders;
    act(() => settings.set("general.effortScale", "fibonacci"));
    expect(renders).toBe(before);
    act(() => settings.set("appearance.theme", "light"));
    expect(result.current[0]).toBe("light");
  });

  describe("shortcut overrides", () => {
    it("keeps an explicit null, unassigned, apart from a missing value, the default", async () => {
      const { settings: file } = fakeFiles({ settings: { "shortcuts.search": null } });
      const { settings, initSettings } = await launch();
      await initSettings();
      expect(settings.get("shortcuts.search")).toBeNull();
      expect(settings.get("shortcuts.quickSwitcher")).toBe("Mod+P");
      settings.reset("shortcuts.search");
      expect(settings.get("shortcuts.search")).toBe("Mod+K");
      await vi.waitFor(() => expect(file.memory).toEqual({}));
    });

    it("applies several changes in one update and writes them in the order given", async () => {
      const { settings: file, order } = fakeFiles({ settings: { "shortcuts.search": "Mod+U" } });
      const { settings, initSettings, subscribeSetting } = await launch();
      await initSettings();
      const seen: string[] = [];
      subscribeSetting("shortcuts.search", (v) => seen.push(`search:${v}`));
      subscribeSetting("shortcuts.quickJot", (v) => seen.push(`jot:${v}`));
      order.length = 0;
      settings.apply([
        { id: "shortcuts.search", value: null },
        { id: "shortcuts.quickJot", value: "Mod+U" },
        { id: "shortcuts.commands", reset: true },
      ]);
      expect(settings.get("shortcuts.search")).toBeNull();
      expect(settings.get("shortcuts.quickJot")).toBe("Mod+U");
      await vi.waitFor(() =>
        expect(file.memory).toEqual({ "shortcuts.search": null, "shortcuts.quickJot": "Mod+U" }),
      );
      expect(order.filter((o) => o !== "save")).toEqual([
        "set:shortcuts.search",
        "set:shortcuts.quickJot",
        "delete:shortcuts.commands",
      ]);
      expect(seen).toEqual(["search:null", "jot:Mod+U"]);
    });

    it("stops writing at the first failure, leaving no later change behind", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { settings: file } = fakeFiles({});
      const { settings, initSettings } = await launch();
      await initSettings();
      mockCommandWith("plugin:store|set", (a) => {
        if (StoreArgs.parse(a).key === "shortcuts.search") throw new Error("disk full");
        return null;
      });
      settings.apply([
        { id: "shortcuts.search", value: null },
        { id: "shortcuts.quickJot", value: "Mod+U" },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(file.memory).toEqual({});
    });
  });

  describe("an unreadable file", () => {
    it("falls back to defaults, never writes and keeps the old preferences", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const files = fakeFiles({ prefs: { ...MARKER, "nookly:theme": "dark" } });
      mockCommandWith("plugin:store|load", (a) => {
        if (StoreArgs.parse(a).path === "settings.json") throw new Error("corrupt");
        return PREFS_RID;
      });
      const { settings, initSettings, preferences } = await launch();
      await expect(initSettings()).resolves.toBeUndefined();
      expect(settings.get("appearance.theme")).toBe("system");
      settings.set("general.effortScale", "fibonacci");
      expect(settings.get("general.effortScale")).toBe("fibonacci");
      expect(preferences.get("nookly:theme")).toBe("dark");
      expect(files.order).toEqual([]);
      expect(files.settings.disk).toEqual({});
    });
  });

  describe("renamed settings", () => {
    const OLD = { "general.backupFolder": "/Users/me/Backups", "general.backupAuto": true };

    it("copies to the new id, saves, reads back and only then deletes the old one", async () => {
      const files = fakeFiles({ settings: { ...OLD, "appearance.theme": "dark" }, prefs: MARKER });
      const { settings, initSettings } = await launch();
      await initSettings();
      expect(files.settings.disk).toEqual({
        "appearance.theme": "dark",
        "backup.folder": "/Users/me/Backups",
        "backup.auto": true,
      });
      expect(settings.get("backup.folder")).toBe("/Users/me/Backups");
      expect(settings.get("backup.auto")).toBe(true);
      const at = (what: string) => files.order.indexOf(what);
      expect(at("set:backup.folder")).toBeLessThan(at("save"));
      expect(at("save")).toBeLessThan(at("reload"));
      expect(at("reload")).toBeLessThan(at("delete:general.backupFolder"));
      expect(at("reload")).toBeLessThan(at("delete:general.backupAuto"));
    });

    it("lets a value already under the new id win", async () => {
      const files = fakeFiles({
        settings: { ...OLD, "backup.folder": "/new", "backup.auto": false },
        prefs: MARKER,
      });
      const { settings, initSettings } = await launch();
      await initSettings();
      expect(settings.get("backup.folder")).toBe("/new");
      expect(settings.get("backup.auto")).toBe(false);
      expect(files.settings.disk).toEqual({ "backup.folder": "/new", "backup.auto": false });
    });

    it("is idempotent", async () => {
      const files = fakeFiles({ settings: OLD, prefs: MARKER });
      const first = await launch();
      await first.initSettings();
      const disk = { ...files.settings.disk };
      files.order.length = 0;
      const second = await launch();
      await second.initSettings();
      expect(files.settings.disk).toEqual(disk);
      expect(files.order).toEqual([]);
    });

    it("keeps the old id when saving fails, and retries on the next launch", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const failed = fakeFiles({ settings: OLD, prefs: MARKER }, { saveFails: true });
      const run1 = await launch();
      await run1.initSettings();
      expect(failed.settings.disk).toEqual(OLD);
      expect(run1.settings.get("backup.folder")).toBeNull();

      const retry = fakeFiles({ settings: failed.settings.disk, prefs: MARKER });
      const run2 = await launch();
      await run2.initSettings();
      expect(retry.settings.disk).toEqual({
        "backup.folder": "/Users/me/Backups",
        "backup.auto": true,
      });
    });

    it("keeps the old id when the new one is not on disk after saving", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const files = fakeFiles({ settings: OLD, prefs: MARKER });
      mockCommandWith("plugin:store|save", () => null);
      const { initSettings } = await launch();
      await initSettings();
      expect(files.settings.disk).toEqual(OLD);
    });

    it("moves old preferences straight to the new ids", async () => {
      const files = fakeFiles({
        prefs: { ...MARKER, "nookly:backup-auto": "1", "nookly:backup-folder": "/b" },
      });
      const { settings, initSettings } = await launch();
      await initSettings();
      expect(files.settings.disk).toEqual({ "backup.auto": true, "backup.folder": "/b" });
      expect(settings.get("backup.folder")).toBe("/b");
    });
  });

  describe("moving old preferences over", () => {
    it("copies, saves, reads back and only then deletes the old key", async () => {
      const files = fakeFiles({
        prefs: {
          ...MARKER,
          "nookly:theme": "dark",
          "nookly:backup-auto": "1",
          "nookly:backup-folder": "/Users/me/Backups",
        },
      });
      const { settings, initSettings, preferences } = await launch();
      await initSettings();
      expect(files.settings.disk).toEqual({
        "appearance.theme": "dark",
        "backup.auto": true,
        "backup.folder": "/Users/me/Backups",
      });
      expect(settings.get("backup.auto")).toBe(true);
      await vi.waitFor(() => {
        expect(preferences.get("nookly:theme")).toBeNull();
        expect(files.prefs.disk).toEqual(MARKER);
      });
      // Each value is set, saved and read back from disk before its old key is
      // deleted from preferences.
      expect(files.order.indexOf("set:appearance.theme")).toBeLessThan(files.order.indexOf("save"));
      expect(files.order.indexOf("save")).toBeLessThan(files.order.indexOf("reload"));
    });

    it("deletes the old key only after the copy is verified", async () => {
      const seen: string[] = [];
      const files = fakeFiles({ prefs: { ...MARKER, "nookly:theme": "dark" } });
      mockCommandWith("plugin:store|reload", () => {
        seen.push(`reload with old key ${"nookly:theme" in files.prefs.memory ? "kept" : "gone"}`);
        files.settings.memory = { ...files.settings.disk };
        return null;
      });
      const { initSettings } = await launch();
      await initSettings();
      expect(seen).toEqual(["reload with old key kept"]);
      expect(files.prefs.disk).toEqual(MARKER);
    });

    it("validates what it copies", async () => {
      const files = fakeFiles({
        prefs: { ...MARKER, "nookly:file-viewer-theme": "system", "nookly:effort-scale": "weird" },
      });
      const { settings, initSettings } = await launch();
      await initSettings();
      expect(files.settings.disk["appearance.fileViewerTheme"]).toBe("defaults");
      expect(settings.get("general.effortScale")).toBe("tshirt");
    });

    it("leaves the old key when saving fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const files = fakeFiles(
        { prefs: { ...MARKER, "nookly:theme": "dark" } },
        { saveFails: true },
      );
      const { initSettings, preferences } = await launch();
      await initSettings();
      expect(preferences.get("nookly:theme")).toBe("dark");
      expect(files.prefs.disk["nookly:theme"]).toBe("dark");
    });

    it("leaves the old key when the value is not on disk after saving", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const files = fakeFiles({ prefs: { ...MARKER, "nookly:theme": "dark" } });
      // A save that silently does nothing: reload brings back the empty file.
      mockCommandWith("plugin:store|save", () => null);
      const { initSettings, preferences } = await launch();
      await initSettings();
      expect(preferences.get("nookly:theme")).toBe("dark");
      expect(files.prefs.disk["nookly:theme"]).toBe("dark");
    });

    it("retries a key an interrupted run left behind", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const first = fakeFiles(
        { prefs: { ...MARKER, "nookly:theme": "dark" } },
        { saveFails: true },
      );
      const run1 = await launch();
      await run1.initSettings();
      expect(first.settings.disk).toEqual({});

      const second = fakeFiles({ prefs: first.prefs.disk });
      const run2 = await launch();
      await run2.initSettings();
      expect(second.settings.disk).toEqual({ "appearance.theme": "dark" });
      await vi.waitFor(() => expect(run2.preferences.get("nookly:theme")).toBeNull());
    });

    it("is idempotent", async () => {
      const files = fakeFiles({
        settings: { "appearance.theme": "dark" },
        prefs: { ...MARKER },
      });
      const { initSettings } = await launch();
      await initSettings();
      await initSettings();
      expect(files.settings.disk).toEqual({ "appearance.theme": "dark" });
      expect(files.order).toEqual([]);
    });

    it("lets a value already in settings.json win over a leftover old key", async () => {
      const files = fakeFiles({
        settings: { "appearance.theme": "light" },
        prefs: { ...MARKER, "nookly:theme": "dark" },
      });
      const { settings, initSettings, preferences } = await launch();
      await initSettings();
      expect(settings.get("appearance.theme")).toBe("light");
      expect(files.settings.disk).toEqual({ "appearance.theme": "light" });
      await vi.waitFor(() => expect(preferences.get("nookly:theme")).toBeNull());
    });

    it("moves the file viewer theme after the one time light reset", async () => {
      const files = fakeFiles({ prefs: { "nookly:file-viewer-theme": "light" } });
      const { settings, initSettings } = await launch();
      await initSettings();
      expect(settings.get("appearance.fileViewerTheme")).toBe("defaults");
      expect(files.settings.disk["appearance.fileViewerTheme"]).toBe("defaults");
    });
  });
});
