import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncClient, type LiveHandlers, type SyncStatus, type SyncTransport } from "./client.ts";
import { SyncEngine } from "./engine.ts";
import { MemoryServer } from "./testing/memory-server.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";

/// The memory server behind a transport whose network can be cut, with a live
/// channel that tells every connected client about each push.
class FakeNetwork {
  readonly server = new MemoryServer();
  online = true;
  private readonly listeners = new Set<LiveHandlers>();
  pushes = 0;

  transport(): SyncTransport {
    return {
      push: async (request) => {
        this.check();
        this.pushes++;
        const response = this.server.push(request);
        for (const l of this.listeners) l.onChanges();
        return response;
      },
      pull: async (request) => {
        this.check();
        return this.server.pull(request);
      },
      live: (handlers) => {
        if (!this.online) {
          setTimeout(() => handlers.onClose(), 0);
          return () => {};
        }
        this.listeners.add(handlers);
        setTimeout(() => handlers.onOpen(), 0);
        return () => this.listeners.delete(handlers);
      },
    };
  }

  private check() {
    if (!this.online) throw new TypeError("Failed to fetch");
  }

  cut() {
    this.online = false;
    for (const l of Array.from(this.listeners)) {
      this.listeners.delete(l);
      l.onClose();
    }
  }
}

function deviceOn(network: FakeNetwork) {
  const driver = new NodeSqliteDriver();
  const engine = new SyncEngine({ driver });
  const statuses: SyncStatus[] = [];
  const client = new SyncClient({
    engine,
    transport: network.transport(),
    onStatus: (s) => statuses.push(s),
  });
  return { driver, engine, client, statuses };
}

const now = () => new Date().toISOString();

function addTask(driver: NodeSqliteDriver, id: string, title: string) {
  driver.exec(
    "INSERT OR IGNORE INTO spaces (id, name, color, created_at, updated_at) VALUES ('s', 'Personal', 'blue', ?, ?)",
    now(),
    now(),
  );
  driver.exec(
    "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 's', 'task', ?, ?, ?, 'TSK', 1)",
    id,
    title,
    now(),
    now(),
  );
  driver.exec("INSERT INTO tasks (entity_id, status_id) VALUES (?, 'todo')", id);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the sync client", () => {
  it("sends a local change and the other device gets it live", async () => {
    const network = new FakeNetwork();
    const a = deviceOn(network);
    const b = deviceOn(network);
    await a.client.start();
    await b.client.start();
    addTask(a.driver, "t1", "Buy milk");
    a.client.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(b.driver.rows("SELECT title FROM entities WHERE id = 't1'")).toEqual([
      { title: "Buy milk" },
    ]);
    expect(a.statuses.at(-1)?.state).toBe("idle");
    a.client.stop();
    b.client.stop();
  });

  it("goes offline, keeps the changes and sends them once back", async () => {
    const network = new FakeNetwork();
    const a = deviceOn(network);
    const b = deviceOn(network);
    await a.client.start();
    await b.client.start();
    network.cut();
    addTask(a.driver, "t1", "Offline task");
    a.client.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(a.statuses.at(-1)?.state).toBe("offline");
    expect(a.statuses.at(-1)?.pending).toBeGreaterThan(0);
    network.online = true;
    // Reconnecting backs off, then resumes from where it was.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(b.driver.rows("SELECT title FROM entities WHERE id = 't1'")).toEqual([
      { title: "Offline task" },
    ]);
    expect(a.statuses.at(-1)?.state).toBe("idle");
    a.client.stop();
    b.client.stop();
  });

  it("runs one sync at a time and catches up on what came in during it", async () => {
    const network = new FakeNetwork();
    const a = deviceOn(network);
    await a.client.start();
    addTask(a.driver, "t1", "One");
    const first = a.client.syncNow();
    addTask(a.driver, "t2", "Two");
    const second = a.client.syncNow();
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, second]);
    expect(await a.engine.pendingCount()).toBe(0);
    expect(network.server.records.has("entities\u0000t2")).toBe(true);
    a.client.stop();
  });

  it("stays quiet until started", async () => {
    const network = new FakeNetwork();
    const a = deviceOn(network);
    addTask(a.driver, "t1", "Before sync");
    a.client.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(network.pushes).toBe(0);
  });
});
