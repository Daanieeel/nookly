import type { SyncStatus } from "@nookly/shared/sync";
import { statusText } from "./sync-status.ts";

const status = (patch: Partial<SyncStatus>): SyncStatus => ({
  state: "idle",
  pending: 0,
  conflicts: 0,
  parked: 0,
  lastSyncedAt: null,
  error: null,
  live: true,
  ...patch,
});

describe("the sync line", () => {
  it("says synced only while the live channel is open", () => {
    expect(statusText(status({}))).toBe("Synced");
    // Bug: with the live channel down, rounds still went through and the phone said
    // "Synced" although nothing from the other devices arrived until the next round.
    expect(statusText(status({ live: false }))).toBe(
      "Synced, but not live. Changes from your other devices may take a minute.",
    );
  });
});
