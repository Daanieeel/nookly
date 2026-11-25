import type { SyncStatus } from "@nookly/shared/sync";
import { statusText } from "./sync-status.ts";

const status = (patch: Partial<SyncStatus>): SyncStatus => ({
  state: "idle",
  pending: 0,
  conflicts: 0,
  parked: 0,
  held: 0,
  lastSyncedAt: null,
  error: null,
  live: true,
  lastChangedAt: null,
  ...patch,
});

describe("the sync line", () => {
  it("says that a change couldn't sync, and that it is safe", () => {
    expect(statusText(status({ pending: 2, held: 2 }))).toBe(
      "2 changes couldn't sync yet. They're saved on this device and Nookly keeps trying.",
    );
  });

  it("says synced only while the live channel is open", () => {
    expect(statusText(status({}))).toBe("Synced");
    // Bug: with the live channel down, rounds still went through and the phone said
    // "Synced" although nothing from the other devices arrived until the next round.
    expect(statusText(status({ live: false }))).toBe(
      "Synced, but not live. Changes from your other devices may take a minute.",
    );
  });
});
