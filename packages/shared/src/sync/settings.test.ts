import { describe, expect, it } from "vitest";
import type { JsonValue } from "../api/client.ts";
import { AccountSettingsSync, type SettingsBridge, type SyncedSetting } from "./settings.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";

const DEFAULTS = new Map<string, JsonValue>([
  ["general.dateFormat", "auto"],
  ["calendar.weekStart", "monday"],
  ["general.displayName", ""],
]);

class FakeSettings implements SettingsBridge {
  readonly values = new Map<string, JsonValue>();
  private readonly listeners = new Set<(key: string) => void>();

  get(key: SyncedSetting) {
    return this.values.get(key) ?? DEFAULTS.get(key) ?? null;
  }
  isDefault(key: SyncedSetting) {
    return !this.values.has(key) || this.values.get(key) === DEFAULTS.get(key);
  }
  set(key: SyncedSetting, value: JsonValue | undefined) {
    if (value === undefined) this.values.delete(key);
    else this.values.set(key, value);
    for (const listener of this.listeners) listener(key);
  }
  subscribe(listener: (key: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function device() {
  const driver = new NodeSqliteDriver();
  const settings = new FakeSettings();
  const sync = new AccountSettingsSync({ driver, bridge: settings, now: () => 1_791_900_000_000 });
  return { driver, settings, sync };
}

const rows = (d: ReturnType<typeof device>) =>
  d.driver.rows("SELECT key, value, updated_at FROM account_settings ORDER BY key");

describe("settings that follow the account", () => {
  it("seeds only what this device changed, dated before any sync", async () => {
    const d = device();
    d.settings.values.set("calendar.weekStart", "sunday");
    await d.sync.seed();
    expect(rows(d)).toEqual([
      { key: "calendar.weekStart", value: '"sunday"', updated_at: "1970-01-01T00:00:00.000Z" },
    ]);
  });

  it("writes a change made here with its time, and a reset as null", async () => {
    const d = device();
    const stop = d.sync.start();
    d.settings.set("general.dateFormat", "dmy");
    await new Promise((r) => setTimeout(r, 10));
    expect(rows(d)).toEqual([
      { key: "general.dateFormat", value: '"dmy"', updated_at: "2026-10-13T14:00:00.000Z" },
    ]);
    d.settings.set("general.dateFormat", undefined);
    await new Promise((r) => setTimeout(r, 10));
    expect(rows(d)[0].value).toBe("null");
    stop();
  });

  it("ignores settings that stay on the device", async () => {
    const d = device();
    await d.sync.record("appearance.theme");
    await d.sync.record("backup.folder");
    expect(rows(d)).toEqual([]);
  });

  it("brings in a setting changed elsewhere without writing it back", async () => {
    const d = device();
    const stop = d.sync.start();
    d.driver.exec(
      "INSERT INTO account_settings (key, value, updated_at) VALUES ('calendar.weekStart', '\"sunday\"', '2026-10-14T00:00:00.000Z')",
    );
    expect(await d.sync.apply()).toEqual(["calendar.weekStart"]);
    expect(d.settings.get("calendar.weekStart")).toBe("sunday");
    await new Promise((r) => setTimeout(r, 10));
    // The table still holds the remote row as it came, not an echo with a new time.
    expect(rows(d)[0].updated_at).toBe("2026-10-14T00:00:00.000Z");
    stop();
  });

  it("puts a setting reset elsewhere back to its default", async () => {
    const d = device();
    d.settings.values.set("calendar.weekStart", "sunday");
    d.driver.exec(
      "INSERT INTO account_settings (key, value, updated_at) VALUES ('calendar.weekStart', 'null', '2026-10-14T00:00:00.000Z')",
    );
    await d.sync.apply();
    expect(d.settings.isDefault("calendar.weekStart")).toBe(true);
  });

  it("never resets a setting just because the account has no row for it", async () => {
    const d = device();
    d.settings.values.set("calendar.weekStart", "sunday");
    expect(await d.sync.apply()).toEqual([]);
    expect(d.settings.get("calendar.weekStart")).toBe("sunday");
  });

  it("keeps a change made here while the account's settings were being read", async () => {
    const d = device();
    d.driver.exec(
      "INSERT INTO account_settings (key, value, updated_at) VALUES ('calendar.weekStart', '\"saturday\"', '2026-10-14T00:00:00.000Z')",
    );
    const applying = d.sync.apply();
    // Typed here before the read finished.
    d.settings.values.set("calendar.weekStart", "sunday");
    void d.sync.record("calendar.weekStart");
    await applying;
    expect(d.settings.get("calendar.weekStart")).toBe("sunday");
  });
});
