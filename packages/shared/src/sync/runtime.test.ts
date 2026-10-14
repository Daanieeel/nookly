import type { DeviceInfo, SignUp, User } from "../api/index.ts";
import { NetworkError, type SyncTransport } from "./client.ts";
import { MemoryServer } from "./testing/memory-server.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";
import { describe, expect, it, vi } from "vitest";
import { type AccountApi, SyncRuntime } from "./runtime.ts";

const ADA: User = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "ada",
  email: "ada@example.com",
  emailVerified: true,
  createdAt: "2026-10-14T00:00:00Z",
};

/// The account API against an in-memory server: what the runtime calls, nothing more.
class FakeAccount implements AccountApi {
  signedIn = false;
  readonly server: MemoryServer;
  readonly calls: string[] = [];

  constructor(server: MemoryServer) {
    this.server = server;
  }

  async signUp(input: SignUp, device: DeviceInfo) {
    this.calls.push(`signUp ${input.username} ${device.platform}`);
    this.signedIn = true;
    return ADA;
  }
  async signIn(identifier: string) {
    this.calls.push(`signIn ${identifier}`);
    if (identifier !== ADA.username) throw new Error("The username or the password is wrong.");
    this.signedIn = true;
    return ADA;
  }
  async signOut() {
    this.calls.push("signOut");
    this.signedIn = false;
  }
  async me() {
    return ADA;
  }
  async isSignedIn() {
    return this.signedIn;
  }
  async sessionToken() {
    return this.signedIn ? "token" : null;
  }
  /// Pushes fail from this many on, like a connection that drops mid sync.
  failPushesAfter = Number.POSITIVE_INFINITY;
  pushes = 0;
  syncTransport(): SyncTransport {
    return {
      push: async (r) => {
        this.pushes += 1;
        if (this.pushes > this.failPushesAfter) throw new NetworkError("connection lost");
        this.calls.push("push");
        return this.server.push(r);
      },
      pull: async (r) => this.server.pull(r),
    };
  }
  async missing(table: string, pks: string[]) {
    return pks.filter((pk) => !this.server.records.has(`${table}\u0000${pk}`));
  }
}

function runtime(
  server = new MemoryServer(),
  driver = new NodeSqliteDriver(),
  backup?: () => Promise<{ path: string }>,
) {
  const account = new FakeAccount(server);
  const reindex = vi.fn(async (_ids: string[]) => {});
  const onApplied = vi.fn();
  const sync = new SyncRuntime({
    driver,
    connect: () => account,
    device: { name: "Nookly on macOS", platform: "macos" },
    reindex,
    onApplied,
    backup,
  });
  return { sync, account, driver, server, reindex, onApplied };
}

const now = () => new Date().toISOString();

describe("the desktop's sync", () => {
  it("is off until someone signs in", async () => {
    const { sync, driver } = runtime();
    await sync.restore("https://sync.example.com");
    expect(sync.store.getState().user).toBeNull();
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).toEqual([]);
  });

  it("signs up, turns sync on and sends what is already here", async () => {
    const { sync, account, driver, server } = runtime();
    driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    await sync.signUp("https://sync.example.com/", {
      username: "ada",
      password: "a long password",
    });
    expect(account.calls[0]).toBe("signUp ada macos");
    expect(sync.store.getState()).toMatchObject({
      user: ADA,
      serverUrl: "https://sync.example.com",
    });
    await sync.syncNow();
    expect(server.records.has("spaces\u0000s1")).toBe(true);
    expect(sync.store.getState().status.state).toBe("idle");
    sync.stop();
  });

  it("brings in changes from elsewhere, refreshes the views and the search index", async () => {
    const server = new MemoryServer();
    const other = runtime(server);
    other.driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    other.driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at) VALUES ('n1', 's1', 'note', 'From the phone', ?, ?)",
      now(),
      now(),
    );
    await other.sync.signIn("https://sync.example.com", "ada", "a long password");
    await other.sync.syncNow();
    other.sync.stop();

    const here = runtime(server);
    await here.sync.signIn("https://sync.example.com", "ada", "a long password");
    await here.sync.syncNow();
    expect(here.driver.rows("SELECT title FROM entities")).toEqual([{ title: "From the phone" }]);
    expect(here.reindex).toHaveBeenCalledWith(expect.arrayContaining(["n1"]));
    expect(here.onApplied).toHaveBeenCalled();
    here.sync.stop();
  });

  it("keeps a failed sign in visible and sync off", async () => {
    const { sync } = runtime();
    await expect(sync.signIn("https://sync.example.com", "nobody", "x")).rejects.toThrow("wrong");
    expect(sync.store.getState().user).toBeNull();
  });

  it("signs out, forgets the server's state and keeps every row here", async () => {
    const { sync, account, driver } = runtime();
    driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.syncNow();
    await sync.signOut();
    expect(account.calls.at(-1)).toBe("signOut");
    expect(sync.store.getState()).toMatchObject({ user: null, status: { state: "off" } });
    expect(driver.rows("SELECT name FROM spaces")).toEqual([{ name: "Personal" }]);
    expect(driver.rows("SELECT COUNT(*) AS n FROM sync_rows")[0].n).toBe(0);
  });

  it("picks up again after a restart with the saved sign in", async () => {
    const server = new MemoryServer();
    const driver = new NodeSqliteDriver();
    const first = runtime(server, driver);
    await first.sync.signIn("https://sync.example.com", "ada", "a long password");
    first.sync.stop();
    const second = runtime(server, driver);
    second.account.signedIn = true;
    await second.sync.restore("https://sync.example.com");
    expect(second.sync.store.getState().user).toEqual(ADA);
    second.sync.stop();
  });
});

function addNotes(driver: NodeSqliteDriver, count: number) {
  driver.exec(
    "INSERT OR IGNORE INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
    now(),
    now(),
  );
  for (let i = 0; i < count; i++) {
    driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 's1', 'note', ?, ?, ?, 'NOT', ?)",
      `n${i}`,
      `Note ${i}`,
      now(),
      now(),
      i + 1,
    );
  }
}

const serverCount = (server: MemoryServer, table: string) =>
  [...server.records.values()].filter((r) => r.table === table).length;

describe("a first sync of a device with data", () => {
  it("backs up before anything is sent, then sends everything and checks it", async () => {
    const order: string[] = [];
    const { sync, account, driver, server } = runtime(undefined, undefined, async () => {
      order.push(`backup with ${account.calls.filter((c) => c === "push").length} pushes`);
      return { path: "/backups/before-sync.zip" };
    });
    addNotes(driver, 30);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    expect(order).toEqual(["backup with 0 pushes"]);
    expect(serverCount(server, "entities")).toBe(30);
    const migration = sync.store.getState().migration;
    expect(migration).toMatchObject({
      phase: "done",
      backupPath: "/backups/before-sync.zip",
      error: null,
    });
    expect(migration?.items).toBeGreaterThanOrEqual(31);
    expect(migration?.itemsSent).toBe(migration?.items);
    // Local data stays.
    expect(driver.rows("SELECT COUNT(*) AS n FROM entities")[0].n).toBe(30);
    sync.stop();
  });

  it("sends nothing when the backup fails, and tries again on request", async () => {
    let fail = true;
    const { sync, account, driver, server } = runtime(undefined, undefined, async () => {
      if (fail) throw new Error("The disk is full.");
      return { path: "/backups/b.zip" };
    });
    addNotes(driver, 3);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    expect(sync.store.getState().migration).toMatchObject({ phase: "failed" });
    expect(sync.store.getState().migration?.error).toContain("The disk is full.");
    expect(account.calls).not.toContain("push");
    expect(server.records.size).toBe(0);
    expect(driver.rows("SELECT * FROM sync_meta WHERE key = 'enabled'")).toEqual([]);
    fail = false;
    await sync.retryFirstSync();
    await sync.settled();
    expect(serverCount(server, "entities")).toBe(3);
    expect(sync.store.getState().migration?.phase).toBe("done");
    sync.stop();
  });

  it("carries on after the app dies halfway, without losing or doubling anything", async () => {
    const server = new MemoryServer();
    const driver = new NodeSqliteDriver();
    addNotes(driver, 1200);
    const first = runtime(server, driver, async () => ({ path: "/b.zip" }));
    // The first batch of 500 arrives, then the connection (and the app) dies.
    first.account.failPushesAfter = 1;
    await first.sync.signIn("https://sync.example.com", "ada", "a long password");
    await first.sync.settled().catch(() => {});
    first.sync.stop();
    const sentBefore = serverCount(server, "entities");
    expect(sentBefore).toBeGreaterThan(0);
    expect(sentBefore).toBeLessThan(1200);
    expect(first.sync.store.getState().migration?.phase).toBe("sending");

    // Restart on the same database.
    const second = runtime(server, driver, async () => {
      throw new Error("a second backup is never made");
    });
    second.account.signedIn = true;
    await second.sync.restore("https://sync.example.com");
    await second.sync.settled();
    expect(serverCount(server, "entities")).toBe(1200);
    expect(new Set([...server.records.keys()]).size).toBe(server.records.size);
    expect(second.sync.store.getState().migration).toMatchObject({ phase: "done" });
    expect(driver.rows("SELECT COUNT(*) AS n FROM entities")[0].n).toBe(1200);
    second.sync.stop();
  });

  it("sends again a row the server turns out not to have", async () => {
    const { sync, driver, server } = runtime(undefined, undefined, async () => ({ path: "/b" }));
    addNotes(driver, 5);
    await sync.signIn("https://sync.example.com", "ada", "a long password");
    await sync.settled();
    server.records.delete("entities\u0000n3");
    expect(await sync.verify()).toBe(1);
    await sync.syncNow();
    expect(server.records.has("entities\u0000n3")).toBe(true);
    expect(await sync.verify()).toBe(0);
    sync.stop();
  });

  it("merges into an account that already has data from another device", async () => {
    const server = new MemoryServer();
    const phone = runtime(server);
    phone.driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('sp', 'Phone', 'red', ?, ?)",
      now(),
      now(),
    );
    await phone.sync.signIn("https://sync.example.com", "ada", "a long password");
    await phone.sync.settled();
    phone.sync.stop();

    const desktop = runtime(server, undefined, async () => ({ path: "/b" }));
    addNotes(desktop.driver, 4);
    await desktop.sync.signIn("https://sync.example.com", "ada", "a long password");
    await desktop.sync.settled();
    expect(desktop.driver.rows("SELECT id FROM spaces ORDER BY id")).toEqual([
      { id: "s1" },
      { id: "sp" },
    ]);
    expect(serverCount(server, "spaces")).toBe(2);
    expect(serverCount(server, "entities")).toBe(4);
    desktop.sync.stop();
  });
});
