import { describe, expect, it, vi } from "vitest";
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
    mockCommand("plugin:store|entries", [
      ["nookly:file-viewer-theme-backfill", "1"],
      ["nookly:last-seen-version-backfill", "1"],
    ]);
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

  describe("file viewer theme backfill", () => {
    async function load(entries: [string, string][]) {
      mockCommand("plugin:store|load", 7);
      mockCommand("plugin:store|entries", [...entries, ["nookly:last-seen-version-backfill", "1"]]);
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

  describe("last seen version backfill", () => {
    const DONE: [string, string] = ["nookly:file-viewer-theme-backfill", "1"];

    async function load(entries: [string, string][]) {
      mockCommand("plugin:store|load", 7);
      mockCommand("plugin:store|entries", [DONE, ...entries]);
      mockCommand("plugin:store|set", null);
      const { initPreferences, preferences } = await freshPreferences();
      await initPreferences();
      return preferences;
    }

    it("sends everyone back to 0.18.46 once, so they see what changed since", async () => {
      const starts: [string, string][][] = [[["nookly:last-seen-version", "0.32.5"]], []];
      for (const entries of starts) {
        const preferences = await load(entries);
        expect(preferences.get("nookly:last-seen-version")).toBe("0.18.46");
        expect(preferences.get("nookly:last-seen-version-backfill")).toBe("1");
      }
    });

    it("keeps an older last seen version, which already shows more", async () => {
      const preferences = await load([["nookly:last-seen-version", "0.10.2"]]);
      expect(preferences.get("nookly:last-seen-version")).toBe("0.10.2");
      expect(preferences.get("nookly:last-seen-version-backfill")).toBe("1");
    });

    it("does not run again once it has", async () => {
      const preferences = await load([
        ["nookly:last-seen-version-backfill", "1"],
        ["nookly:last-seen-version", "0.33.0"],
      ]);
      expect(preferences.get("nookly:last-seen-version")).toBe("0.33.0");
      expect(callsOf("plugin:store|set")).toEqual([]);
    });
  });
});
