import type { DeviceInfo, User } from "../api/index.ts";
import type { SyncTransport } from "./client.ts";
import { MemoryServer } from "./testing/memory-server.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";
import { describe, expect, it, vi } from "vitest";
import { type AccountApi, SyncRuntime } from "./runtime.ts";

const ADA: User = {
  id: "00000000-0000-4000-8000-000000000001",
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

  async register(email: string, _password: string, device: DeviceInfo) {
    this.calls.push(`register ${email} ${device.platform}`);
    this.signedIn = true;
    return ADA;
  }
  async signIn(email: string) {
    this.calls.push(`signIn ${email}`);
    if (email !== ADA.email) throw new Error("The email or the password is wrong.");
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
  syncTransport(): SyncTransport {
    return { push: async (r) => this.server.push(r), pull: async (r) => this.server.pull(r) };
  }
}

function runtime(server = new MemoryServer(), driver = new NodeSqliteDriver()) {
  const account = new FakeAccount(server);
  const reindex = vi.fn(async (_ids: string[]) => {});
  const onApplied = vi.fn();
  const sync = new SyncRuntime({
    driver,
    connect: () => account,
    device: { name: "Nookly on macOS", platform: "macos" },
    reindex,
    onApplied,
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
    await sync.signUp("https://sync.example.com/", "ada@example.com", "a long password");
    expect(account.calls).toEqual(["register ada@example.com macos"]);
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
    await other.sync.signIn("https://sync.example.com", "ada@example.com", "a long password");
    await other.sync.syncNow();
    other.sync.stop();

    const here = runtime(server);
    await here.sync.signIn("https://sync.example.com", "ada@example.com", "a long password");
    await here.sync.syncNow();
    expect(here.driver.rows("SELECT title FROM entities")).toEqual([{ title: "From the phone" }]);
    expect(here.reindex).toHaveBeenCalledWith(expect.arrayContaining(["n1"]));
    expect(here.onApplied).toHaveBeenCalled();
    here.sync.stop();
  });

  it("keeps a failed sign in visible and sync off", async () => {
    const { sync } = runtime();
    await expect(
      sync.signIn("https://sync.example.com", "nobody@example.com", "x"),
    ).rejects.toThrow("wrong");
    expect(sync.store.getState().user).toBeNull();
  });

  it("signs out, forgets the server's state and keeps every row here", async () => {
    const { sync, account, driver } = runtime();
    driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    await sync.signIn("https://sync.example.com", "ada@example.com", "a long password");
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
    await first.sync.signIn("https://sync.example.com", "ada@example.com", "a long password");
    first.sync.stop();
    const second = runtime(server, driver);
    second.account.signedIn = true;
    await second.sync.restore("https://sync.example.com");
    expect(second.sync.store.getState().user).toEqual(ADA);
    second.sync.stop();
  });
});
