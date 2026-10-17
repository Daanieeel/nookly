import type { InvokeArgs } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";

/// A fresh preferences module, as on launch.
async function freshPreferences() {
  vi.resetModules();
  return import("./preferences.ts");
}

describe("preferences", () => {
  it("loads every saved preference from the store", async () => {
    mockCommand("plugin:store|load", 7);
    mockCommand("plugin:store|entries", [
      ["nookly:theme", "dark"],
      ["nookly:timezone", "Europe/Berlin"],
    ]);
    const { initPreferences, preferences } = await freshPreferences();
    await initPreferences();
    expect(preferences.get("nookly:theme")).toBe("dark");
    expect(preferences.get("nookly:timezone")).toBe("Europe/Berlin");
    expect(callsOf("plugin:store|load")[0]).toMatchObject({ path: "preferences.json" });
  });

  it("falls back to defaults when the store can't load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCommandWith("plugin:store|load", () => {
      throw new Error("corrupt preferences.json");
    });
    const { initPreferences, preferences } = await freshPreferences();
    await expect(initPreferences()).resolves.toBeUndefined();
    expect(preferences.get("nookly:theme")).toBeNull();
    preferences.set("nookly:theme", "light");
    expect(preferences.get("nookly:theme")).toBe("light");
  });

  it("writes changes through to the store", async () => {
    mockCommand("plugin:store|load", 7);
    mockCommand("plugin:store|entries", [["nookly:file-viewer-theme-backfill", "1"]]);
    mockCommand("plugin:store|set", null);
    mockCommand("plugin:store|delete", true);
    const { initPreferences, preferences } = await freshPreferences();
    await initPreferences();
    preferences.set("nookly:theme", "dark");
    preferences.remove("nookly:theme");
    expect(preferences.get("nookly:theme")).toBeNull();
    await vi.waitFor(() => {
      expect(callsOf("plugin:store|set")).toEqual([{ rid: 7, key: "nookly:theme", value: "dark" }]);
      expect(callsOf("plugin:store|delete")).toEqual([{ rid: 7, key: "nookly:theme" }]);
    });
  });

  it("keeps the value in memory when saving fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCommand("plugin:store|load", 7);
    mockCommand("plugin:store|entries", []);
    mockCommandWith("plugin:store|set", () => {
      throw new Error("disk full");
    });
    const { initPreferences, preferences } = await freshPreferences();
    await initPreferences();
    preferences.set("nookly:theme", "dark");
    expect(preferences.get("nookly:theme")).toBe("dark");
    await vi.waitFor(() =>
      expect(logged).toHaveBeenCalledWith("Couldn't save preferences", expect.anything()),
    );
  });

  describe("a dev build next to the installed app", () => {
    const storeCall = z.looseObject({ path: z.string().optional(), rid: z.number().optional() });
    const callOf = (args: InvokeArgs | undefined) => storeCall.parse(args ?? {});
    const PROD = 7;
    const DEV = 8;

    /// Both builds share the app data folder, and each writes its whole copy of a file, so
    /// the dev build keeps its own file instead of overwriting the installed app's tabs.
    async function loadDev(files: { prod: [string, string][]; dev: [string, string][] }) {
      vi.stubEnv("MODE", "development");
      const stored = new Map([
        [PROD, files.prod],
        [DEV, files.dev],
      ]);
      mockCommandWith("plugin:store|load", (args) =>
        callOf(args).path === "preferences.dev.json" ? DEV : PROD,
      );
      mockCommandWith("plugin:store|entries", (args) => stored.get(callOf(args).rid ?? 0));
      mockCommand("plugin:store|set", null);
      mockCommand("plugin:store|delete", true);
      const { initPreferences, preferences } = await freshPreferences();
      await initPreferences();
      return preferences;
    }

    const backfilled: [string, string] = ["nookly:file-viewer-theme-backfill", "1"];

    afterEach(() => vi.unstubAllEnvs());

    it("keeps the installed app's tabs and split out of the dev build", async () => {
      const preferences = await loadDev({
        prod: [backfilled, ["nookly:tabs", "installed tabs"], ["nookly:split-ratio", "0.3"]],
        dev: [backfilled, ["nookly:tabs", "dev tabs"]],
      });
      expect(preferences.get("nookly:tabs")).toBe("dev tabs");
      expect(preferences.get("nookly:split-ratio")).toBeNull();
    });

    it("writes only to its own file", async () => {
      const preferences = await loadDev({ prod: [backfilled], dev: [backfilled] });
      preferences.set("nookly:tabs", "x");
      preferences.set("nookly:theme", "dark");
      preferences.remove("nookly:theme");
      await vi.waitFor(() => expect(callsOf("plugin:store|delete")).toHaveLength(1));
      expect(callsOf("plugin:store|set").every((call) => callOf(call).rid === DEV)).toBe(true);
      expect(callsOf("plugin:store|delete")).toEqual([{ rid: DEV, key: "nookly:theme" }]);
    });

    it("starts from the installed app's preferences, without its tabs, the first time", async () => {
      const preferences = await loadDev({
        prod: [
          backfilled,
          ["nookly:sidebar-collapsed", "1"],
          ["nookly:tabs", "installed tabs"],
          ["nookly:split-ratio", "0.3"],
        ],
        dev: [],
      });
      expect(preferences.get("nookly:sidebar-collapsed")).toBe("1");
      expect(preferences.get("nookly:tabs")).toBeNull();
      expect(preferences.get("nookly:split-ratio")).toBeNull();
      await vi.waitFor(() =>
        expect(callsOf("plugin:store|set")).toContainEqual({
          rid: DEV,
          key: "nookly:sidebar-collapsed",
          value: "1",
        }),
      );
    });

    it("does not copy again once it has a file of its own", async () => {
      const preferences = await loadDev({
        prod: [backfilled, ["nookly:sidebar-collapsed", "1"]],
        dev: [backfilled],
      });
      expect(preferences.get("nookly:sidebar-collapsed")).toBeNull();
    });
  });

  describe("file viewer theme backfill", () => {
    async function load(entries: [string, string][]) {
      mockCommand("plugin:store|load", 7);
      mockCommand("plugin:store|entries", entries);
      mockCommand("plugin:store|set", null);
      const { initPreferences, preferences } = await freshPreferences();
      await initPreferences();
      return preferences;
    }

    it("resets a saved light theme to the defaults once", async () => {
      const preferences = await load([["nookly:file-viewer-theme", "light"]]);
      expect(preferences.get("nookly:file-viewer-theme")).toBe("defaults");
      expect(preferences.get("nookly:file-viewer-theme-backfill")).toBe("1");
      await vi.waitFor(() => {
        expect(callsOf("plugin:store|set")).toEqual([
          { rid: 7, key: "nookly:file-viewer-theme", value: "defaults" },
          { rid: 7, key: "nookly:file-viewer-theme-backfill", value: "1" },
        ]);
      });
    });

    it("leaves every other theme alone", async () => {
      for (const value of ["dark", "defaults", "system", "Light"]) {
        const preferences = await load([["nookly:file-viewer-theme", value]]);
        expect(preferences.get("nookly:file-viewer-theme")).toBe(value);
        expect(preferences.get("nookly:file-viewer-theme-backfill")).toBe("1");
      }
    });

    it("does not invent a theme when none was saved", async () => {
      const preferences = await load([]);
      expect(preferences.get("nookly:file-viewer-theme")).toBeNull();
      expect(preferences.get("nookly:file-viewer-theme-backfill")).toBe("1");
    });

    it("keeps a light theme picked after the backfill ran", async () => {
      const preferences = await load([
        ["nookly:file-viewer-theme", "light"],
        ["nookly:file-viewer-theme-backfill", "1"],
      ]);
      expect(preferences.get("nookly:file-viewer-theme")).toBe("light");
      expect(callsOf("plugin:store|set")).toEqual([]);
    });
  });

  describe("assignment status rename", () => {
    async function load(entries: [string, string][]) {
      mockCommand("plugin:store|load", 7);
      mockCommand("plugin:store|entries", [["nookly:file-viewer-theme-backfill", "1"], ...entries]);
      mockCommand("plugin:store|set", null);
      const { initPreferences, preferences } = await freshPreferences();
      await initPreferences();
      return preferences;
    }

    const filters = (fieldId: string, ...values: string[]) =>
      JSON.stringify([{ fieldId, operator: "is", values }]);

    it("renames graded in the saved status filters of every space and of the overview", async () => {
      const preferences = await load([
        ["nookly:assignments-filters:space-1", filters("status", "graded", "submitted")],
        ["nookly:assignments-filters:space-2", filters("status", "graded")],
        ["nookly:assignments-overview-filters", filters("status", "graded")],
      ]);
      expect(preferences.get("nookly:assignments-filters:space-1")).toBe(
        filters("status", "evaluated", "submitted"),
      );
      expect(preferences.get("nookly:assignments-filters:space-2")).toBe(
        filters("status", "evaluated"),
      );
      expect(preferences.get("nookly:assignments-overview-filters")).toBe(
        filters("status", "evaluated"),
      );
    });

    it("leaves the grade filter, other filters and other pages alone", async () => {
      const grade = filters("grade", "graded");
      const tasks = filters("status", "graded");
      const preferences = await load([
        ["nookly:assignments-filters:space-1", grade],
        ["nookly:tasks-filters:space-1", tasks],
      ]);
      expect(preferences.get("nookly:assignments-filters:space-1")).toBe(grade);
      expect(preferences.get("nookly:tasks-filters:space-1")).toBe(tasks);
      expect(callsOf("plugin:store|set")).toEqual([]);
    });

    it("renames a hidden column only when the board is grouped by status", async () => {
      const preferences = await load([
        [
          "nookly:assignments-display",
          JSON.stringify({ layout: "board", grouping: "status", hiddenColumns: ["graded"] }),
        ],
        [
          "nookly:assignments-overview",
          JSON.stringify({ layout: "board", grouping: "grade", hiddenColumns: ["graded"] }),
        ],
      ]);
      expect(JSON.parse(preferences.get("nookly:assignments-display") ?? "")).toMatchObject({
        hiddenColumns: ["evaluated"],
      });
      expect(JSON.parse(preferences.get("nookly:assignments-overview") ?? "")).toMatchObject({
        hiddenColumns: ["graded"],
      });
    });

    it("skips what is not JSON", async () => {
      const preferences = await load([["nookly:assignments-filters:space-1", "nope"]]);
      expect(preferences.get("nookly:assignments-filters:space-1")).toBe("nope");
    });
  });

  describe("filter field renames", () => {
    async function load(entries: [string, string][]) {
      mockCommand("plugin:store|load", 7);
      mockCommand("plugin:store|entries", [["nookly:file-viewer-theme-backfill", "1"], ...entries]);
      mockCommand("plugin:store|set", null);
      const { initPreferences, preferences } = await freshPreferences();
      await initPreferences();
      return preferences;
    }

    const filters = (...fieldIds: string[]) =>
      JSON.stringify(fieldIds.map((fieldId) => ({ fieldId, operator: "is", values: ["today"] })));

    it("renames the completed filter of the Tasks pages and the evaluated one of the Assignments pages", async () => {
      const preferences = await load([
        ["nookly:tasks-filters:space-1", filters("status", "completed")],
        ["nookly:tasks-overview-filters", filters("completed")],
        ["nookly:assignments-filters:space-1", filters("evaluated", "grade")],
        ["nookly:assignments-overview-filters", filters("evaluated")],
      ]);
      expect(preferences.get("nookly:tasks-filters:space-1")).toBe(
        filters("status", "completedAt"),
      );
      expect(preferences.get("nookly:tasks-overview-filters")).toBe(filters("completedAt"));
      expect(preferences.get("nookly:assignments-filters:space-1")).toBe(
        filters("evaluatedAt", "grade"),
      );
      expect(preferences.get("nookly:assignments-overview-filters")).toBe(filters("evaluatedAt"));
    });

    it("leaves the other pages and the renamed filters alone", async () => {
      const notes = filters("completed");
      const done = filters("completedAt");
      const preferences = await load([
        ["nookly:notes-filters:space-1", notes],
        ["nookly:tasks-filters:space-1", done],
        ["nookly:assignments-filters:space-1", "nope"],
      ]);
      expect(preferences.get("nookly:notes-filters:space-1")).toBe(notes);
      expect(preferences.get("nookly:tasks-filters:space-1")).toBe(done);
      expect(preferences.get("nookly:assignments-filters:space-1")).toBe("nope");
      expect(callsOf("plugin:store|set")).toEqual([]);
    });
  });
});
