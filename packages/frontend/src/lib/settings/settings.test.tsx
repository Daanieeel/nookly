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
        "general.backupAuto": true,
        "general.effortScale": "bogus",
        "something.future": 1,
      },
    });
    const { settings, initSettings } = await launch();
    await initSettings();
    expect(settings.get("appearance.theme")).toBe("dark");
    expect(settings.get("general.backupAuto")).toBe(true);
    expect(settings.get("general.effortScale")).toBe("tshirt");
  });

  it("writes typed values to the store and resets by deleting", async () => {
    const { settings: file } = fakeFiles({});
    const { settings, initSettings } = await launch();
    await initSettings();
    settings.set("general.backupAuto", true);
    settings.set("calendar.sessionLengthMinutes", 45);
    expect(settings.get("general.backupAuto")).toBe(true);
    await vi.waitFor(() =>
      expect(file.memory).toEqual({
        "general.backupAuto": true,
        "calendar.sessionLengthMinutes": 45,
      }),
    );
    settings.reset("calendar.sessionLengthMinutes");
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(90);
    await vi.waitFor(() => expect(file.memory).toEqual({ "general.backupAuto": true }));
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
        "general.backupAuto": true,
        "general.backupFolder": "/Users/me/Backups",
      });
      expect(settings.get("general.backupAuto")).toBe(true);
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
