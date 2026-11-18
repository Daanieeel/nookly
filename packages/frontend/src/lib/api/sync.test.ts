import { describe, expect, it } from "vitest";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { keychainTokens, reindexEntities, tauriSqlDriver } from "./sync.ts";

describe("sync on the desktop", () => {
  it("runs the engine's reads and writes through Rust", async () => {
    mockCommand("sync_query", [{ n: 1 }]);
    mockCommand("sync_batch", { outcome: "stale", index: 2 });
    expect(await tauriSqlDriver.query("SELECT 1 AS n WHERE ? = ?", ["a", 1])).toEqual([{ n: 1 }]);
    const result = await tauriSqlDriver.batch([
      { sql: "DELETE FROM sync_dirty", params: [] },
      { sql: "SELECT version FROM sync_dirty", params: [], expect: null },
    ]);
    expect(result).toEqual({ outcome: "stale", index: 2 });
    expect(callsOf("sync_query")).toEqual([{ sql: "SELECT 1 AS n WHERE ? = ?", params: ["a", 1] }]);
    // A guard's `expect: null` has to survive the trip, unlike a missing one.
    expect(callsOf("sync_batch")).toEqual([
      {
        statements: [
          { sql: "DELETE FROM sync_dirty", params: [] },
          { sql: "SELECT version FROM sync_dirty", params: [], expect: null },
        ],
      },
    ]);
  });

  it("keeps the refresh token in the keychain", async () => {
    mockCommand("sync_refresh_token", "token-1");
    mockCommand("sync_set_refresh_token", null);
    expect(await keychainTokens.load()).toBe("token-1");
    await keychainTokens.save(null);
    expect(callsOf("sync_set_refresh_token")).toEqual([{ token: null }]);
  });

  it("rebuilds search for entities that changed elsewhere", async () => {
    mockCommand("sync_reindex", null);
    await reindexEntities(["e1"]);
    expect(callsOf("sync_reindex")).toEqual([{ entityIds: ["e1"] }]);
  });
});
