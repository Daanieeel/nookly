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
    mockCommand("plugin:store|entries", []);
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
});
