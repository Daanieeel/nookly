import { describe, expect, it, vi } from "vitest";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { keychainTokens, reindexEntities, tauriBlobs, tauriSqlDriver } from "./sync.ts";

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

  it("hands the database one request at a time, in the order they were made", async () => {
    let finish = () => {};
    mockCommandWith(
      "sync_batch",
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ outcome: "done" });
        }),
    );
    mockCommand("sync_query", []);
    const write = tauriSqlDriver.batch([]);
    const read = tauriSqlDriver.query("SELECT 1", []);
    await vi.waitFor(() => expect(callsOf("sync_batch")).toHaveLength(1));
    expect(callsOf("sync_query")).toEqual([]);
    finish();
    await expect(write).resolves.toEqual({ outcome: "done" });
    await expect(read).resolves.toEqual([]);
  });

  // Whatever shows or logs a failure reads an `Error`; anything else prints as "[object Object]".
  it("says why Rust refused, and carries on with the next request", async () => {
    const refused = () => Promise.reject({ kind: "Db", message: "the disk is full" });
    mockCommandWith("sync_batch", refused);
    mockCommand("sync_query", []);
    const write = tauriSqlDriver.batch([]);
    await expect(write).rejects.toBeInstanceOf(Error);
    await expect(write).rejects.toThrow("the disk is full");
    await expect(tauriSqlDriver.query("SELECT 1", [])).resolves.toEqual([]);
  });

  it("says why a file couldn't be moved", async () => {
    const message = "This file isn't on the server.";
    const refused = () => Promise.reject({ kind: "Remote", message });
    for (const command of ["blob_hash", "blob_size", "blob_upload", "blob_download"]) {
      mockCommandWith(command, refused);
    }
    const files = tauriBlobs("https://sync.example.com");
    const target = { table: "files", pk: "f1", filename: "a.pdf" };
    const requests = [
      files.download("0".repeat(64), target),
      files.upload("0".repeat(64), "/a.pdf", "application/pdf"),
      files.hash("/a.pdf"),
      files.size("/a.pdf"),
    ];
    for (const failed of await Promise.allSettled(requests)) {
      expect(failed).toEqual({ status: "rejected", reason: expect.any(Error) });
      expect(failed).toHaveProperty("reason.message", message);
    }
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
