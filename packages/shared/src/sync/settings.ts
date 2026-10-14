import { z } from "zod";
import type { JsonValue } from "../api/client.ts";
import { type SqlDriver, run } from "./sql.ts";

/// Settings that describe the person, not the device: they follow the account to
/// every device. Theme, backups, the server address, Vim keys and shortcuts stay
/// per device (DECISIONS.md D9). Ids are the desktop's `settings.json` ids.
export const SYNCED_SETTINGS = [
  "general.displayName",
  "general.timezone",
  "general.dateFormat",
  "general.timeFormat",
  "general.effortScale",
  "calendar.sessionLengthMinutes",
  "calendar.calendarEntryLengthMinutes",
  "calendar.weekStart",
  "calendar.dayStartHour",
  "calendar.todayColor",
  "calendar.todayIntensity",
  "calendar.snapMinutes",
  "notes.defaultCodeLanguage",
  "notes.formatCodeOnPaste",
  "notes.latexMacros",
  "notes.arrowLigatures",
] as const;
export type SyncedSetting = (typeof SYNCED_SETTINGS)[number];

const SYNCED: ReadonlySet<string> = new Set(SYNCED_SETTINGS);
export const isSyncedSetting = (key: string): key is SyncedSetting => SYNCED.has(key);

/// A device's own settings store, as account settings sync sees it.
export interface SettingsBridge {
  /// The current value; the default when it was never changed.
  get(key: SyncedSetting): JsonValue;
  isDefault(key: SyncedSetting): boolean;
  /// `undefined` puts the setting back to its default.
  set(key: SyncedSetting, value: JsonValue | undefined): void;
  /// Called with the key whenever a setting changes on this device.
  subscribe(listener: (key: string) => void): () => void;
}

/// The oldest possible time: a value this device had before it ever synced loses
/// to any value the account already has, and is kept as a conflict instead.
const BEFORE_SYNC = "1970-01-01T00:00:00.000Z";

/// How a setting back at its default is stored, so a reset syncs like any change.
const DEFAULT = "null";

const jsonSchema = z.json();

const same = (stored: string | null, value: JsonValue) =>
  stored !== null && stored === JSON.stringify(value);

/// Mirrors the synced settings into the `account_settings` table, which syncs per
/// setting like any row, and puts settings changed elsewhere back into the device's
/// store. A setting this device never changed has no row; one put back to its
/// default stores `null`. A missing row never resets anything here.
export class AccountSettingsSync {
  private readonly driver: SqlDriver;
  private readonly bridge: SettingsBridge;
  private readonly now: () => number;
  /// While a setting from elsewhere is being applied, its echo isn't written back.
  private applying = false;
  /// Bumped on every change made here, so a pull that read the table before a
  /// change never undoes it.
  private readonly versions = new Map<string, number>();

  constructor(options: { driver: SqlDriver; bridge: SettingsBridge; now?: () => number }) {
    this.driver = options.driver;
    this.bridge = options.bridge;
    this.now = options.now ?? Date.now;
  }

  private async stored(): Promise<Map<string, string>> {
    const rows = await this.driver.query("SELECT key, value FROM account_settings", []);
    return new Map(rows.map((r) => [String(r.key), String(r.value)]));
  }

  /// Writes what this device has that the table doesn't, dated before any sync.
  async seed(): Promise<void> {
    const stored = await this.stored();
    const statements = SYNCED_SETTINGS.filter(
      (key) => !this.bridge.isDefault(key) && !stored.has(key),
    ).map((key) =>
      run(
        "INSERT INTO account_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING",
        key,
        JSON.stringify(this.bridge.get(key)),
        BEFORE_SYNC,
      ),
    );
    if (statements.length > 0) await this.driver.batch(statements);
  }

  /// A setting changed on this device: the table follows.
  async record(key: string): Promise<void> {
    if (this.applying || !isSyncedSetting(key)) return;
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    const stored = (await this.stored()).get(key) ?? null;
    if (this.bridge.isDefault(key)) {
      if (stored === null || stored === DEFAULT) return;
    }
    const value = this.bridge.isDefault(key) ? null : this.bridge.get(key);
    if (same(stored, value)) return;
    await this.driver.batch([
      run(
        "INSERT INTO account_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        key,
        JSON.stringify(value),
        new Date(this.now()).toISOString(),
      ),
    ]);
  }

  /// Puts settings changed elsewhere into this device's store.
  async apply(): Promise<string[]> {
    const before = new Map(this.versions);
    const stored = await this.stored();
    const changed: string[] = [];
    this.applying = true;
    try {
      for (const key of SYNCED_SETTINGS) {
        const raw = stored.get(key);
        if (raw === undefined) continue;
        // Changed here while the table was read: this device's value stands.
        if ((this.versions.get(key) ?? 0) !== (before.get(key) ?? 0)) continue;
        if (raw === DEFAULT) {
          if (!this.bridge.isDefault(key)) {
            this.bridge.set(key, undefined);
            changed.push(key);
          }
          continue;
        }
        if (same(raw, this.bridge.get(key))) continue;
        let parsed: ReturnType<typeof jsonSchema.safeParse>;
        try {
          parsed = jsonSchema.safeParse(JSON.parse(raw));
        } catch {
          continue;
        }
        if (!parsed.success) continue;
        this.bridge.set(key, parsed.data);
        changed.push(key);
      }
    } finally {
      this.applying = false;
    }
    return changed;
  }

  /// Follows this device's changes until the returned function is called.
  start(onError: (error: Error) => void = () => {}): () => void {
    return this.bridge.subscribe((key) => {
      this.record(key).catch(onError);
    });
  }
}
