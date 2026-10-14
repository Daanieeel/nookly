import { describe, expect, it } from "vitest";
import { SHARED_SETTINGS } from "./settings.ts";
import { SYNCED_SETTINGS } from "./sync/settings.ts";

describe("shared settings", () => {
  it("define every setting that follows the account, so every device knows them", () => {
    for (const id of SYNCED_SETTINGS) expect(Object.hasOwn(SHARED_SETTINGS, id), id).toBe(true);
  });

  it("have defaults that pass their own check, and ids that match their keys", () => {
    for (const [key, def] of Object.entries(SHARED_SETTINGS)) {
      expect(def.id).toBe(key);
      expect(def.schema.safeParse(def.default).success, key).toBe(true);
      expect(def.title).not.toBe("");
    }
  });

  it("refuse values outside their range", () => {
    expect(SHARED_SETTINGS["calendar.dayStartHour"].schema.safeParse(24).success).toBe(false);
    expect(SHARED_SETTINGS["calendar.sessionLengthMinutes"].schema.safeParse(7).success).toBe(
      false,
    );
    expect(SHARED_SETTINGS["calendar.snapMinutes"].schema.safeParse(15).success).toBe(true);
  });
});
