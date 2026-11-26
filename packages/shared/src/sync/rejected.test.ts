import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../api/client.ts";
import type { Row } from "../schema.ts";
import { SyncClient, type SyncTransport } from "./client.ts";
import { SyncEngine, changeKey } from "./engine.ts";
import type { PushResult } from "./protocol.ts";
import { MemoryServer } from "./testing/memory-server.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";

/// What a device does with a change the server won't take: put right what it can by
/// itself, and keep the rest waiting. Nothing is ever dropped.

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    now: Date.now(),
  });
});
afterEach(() => {
  vi.useRealTimers();
});

function transportTo(server: MemoryServer): SyncTransport {
  return {
    push: async (request) => server.push(request),
    pull: async (request) => server.pull(request),
  };
}

/// Refuses the changes `refuse` names, like a server that can't store them.
function refusing(
  server: MemoryServer,
  refuse: (pk: string) => boolean,
  reason: PushResult["reason"] = "invalid-value",
): SyncTransport {
  const base = transportTo(server);
  return {
    ...base,
    push: async (request) => {
      const bad = request.changes.filter((c) => c.table === "entities" && refuse(c.pk));
      const rest = request.changes.filter((c) => !bad.includes(c));
      const taken = await base.push({ changes: rest });
      return {
        results: [
          ...taken.results,
          ...bad.map((c) => ({
            dataset: c.dataset,
            table: c.table,
            pk: c.pk,
            status: "rejected" as const,
            reason,
          })),
        ],
      };
    },
  };
}

function device(transport: SyncTransport, driver = new NodeSqliteDriver()) {
  const engine = new SyncEngine({ driver });
  const client = new SyncClient({ engine, transport });
  return { driver, engine, client };
}

const iso = () => new Date().toISOString();

function addTask(driver: NodeSqliteDriver, id: string, title: string, key = 1) {
  driver.exec(
    "INSERT OR IGNORE INTO spaces (id, name, color, created_at, updated_at) VALUES ('s', 'Personal', 'blue', ?, ?)",
    iso(),
    iso(),
  );
  driver.exec(
    "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 's', 'task', ?, ?, ?, 'TSK', ?)",
    id,
    title,
    iso(),
    iso(),
    key,
  );
  driver.exec("INSERT INTO tasks (entity_id, status_id) VALUES (?, 'todo')", id);
}

const stored = (server: MemoryServer, pk: string) => server.records.get(`entities\u0000${pk}`);
const titleOf = (driver: NodeSqliteDriver, id: string) =>
  driver.rows("SELECT title FROM entities WHERE id = ?", id)[0]?.title;
/// As if the edits waiting were made while the clock was `ahead`.
const dateWaiting = (driver: NodeSqliteDriver, ahead: number) =>
  driver.exec("UPDATE sync_dirty SET changed_at = ?", Date.now() + ahead);

const settle = () => vi.advanceTimersByTimeAsync(5_000);

describe("a computer whose clock is wrong", () => {
  it("has its changes dated by the server's time and sent, with nothing to do", async () => {
    const server = new MemoryServer();
    const d = device(transportTo(server));
    await d.client.start();
    addTask(d.driver, "t1", "Made in the future");
    dateWaiting(d.driver, 3 * DAY);
    await d.client.syncNow();
    expect(stored(server, "t1")?.fields.title).toBe("Made in the future");
    const at = Number(stored(server, "t1")?.clocks.title?.slice(0, 13));
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(d.client.current()).toMatchObject({ state: "idle", pending: 0, held: 0, conflicts: 0 });
    d.client.stop();
  });

  it("dates them by the server even while the clock stays wrong", async () => {
    const server = new MemoryServer();
    // The device is three days ahead of the server.
    server.now = () => Date.now() - 3 * DAY;
    const d = device(transportTo(server));
    await d.client.start();
    addTask(d.driver, "t1", "Still ahead");
    await d.client.syncNow();
    expect(Number(stored(server, "t1")?.clocks.title?.slice(0, 13))).toBeLessThanOrEqual(
      server.now(),
    );
    expect(d.client.current()).toMatchObject({ pending: 0, held: 0 });
    d.client.stop();
  });

  it("keeps them waiting on an older server until the clock is right", async () => {
    const server = new MemoryServer();
    server.now = () => Date.now() - 3 * DAY;
    const older: SyncTransport = {
      ...transportTo(server),
      push: async (request) => ({ results: server.push(request).results }),
    };
    const d = device(older);
    await d.client.start();
    addTask(d.driver, "t1", "Waits");
    await d.client.syncNow();
    expect(stored(server, "t1")).toBeUndefined();
    expect(titleOf(d.driver, "t1")).toBe("Waits");
    expect(d.client.current().held).toBeGreaterThan(0);
    // The clock is set right; the next try goes through.
    server.now = Date.now;
    dateWaiting(d.driver, 3 * DAY);
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(stored(server, "t1")?.fields.title).toBe("Waits");
    expect(d.client.current()).toMatchObject({ pending: 0, held: 0 });
    d.client.stop();
  });
});

describe("an invisible character the server can't store", () => {
  it("is left out of what is sent", async () => {
    const server = new MemoryServer();
    const driver = new NodeSqliteDriver();
    // This SQLite cuts text off at a NUL when reading, which the apps' own don't: the
    // title is given one on its way out instead.
    const read = driver.query.bind(driver);
    driver.query = async (sql, params) =>
      (await read(sql, params)).map((row) =>
        row.title === "Pasted text" ? { ...row, title: "Pasted\u0000 text" } : row,
      );
    const d = device(transportTo(server), driver);
    await d.client.start();
    addTask(driver, "t1", "Pasted text");
    await d.client.syncNow();
    expect(stored(server, "t1")?.fields.title).toBe("Pasted text");
    expect(d.client.current()).toMatchObject({ pending: 0, held: 0, conflicts: 0 });
    d.client.stop();
  });
});

describe("a change the server refuses", () => {
  it("stays waiting, without holding up the others or asking for a decision", async () => {
    const server = new MemoryServer();
    const d = device(refusing(server, (pk) => pk === "bad"));
    await d.client.start();
    addTask(d.driver, "ok-1", "Fine", 1);
    addTask(d.driver, "bad", "Refused", 2);
    addTask(d.driver, "ok-2", "Fine too", 3);
    await d.client.syncNow();
    expect(stored(server, "ok-1")).toBeDefined();
    expect(stored(server, "ok-2")).toBeDefined();
    expect(titleOf(d.driver, "bad")).toBe("Refused");
    expect(d.client.current()).toMatchObject({ state: "idle", pending: 1, held: 1, conflicts: 0 });
    d.client.stop();
  });

  it("is tried again later on its own", async () => {
    const server = new MemoryServer();
    let broken = true;
    const d = device(refusing(server, (pk) => broken && pk === "bad"));
    await d.client.start();
    addTask(d.driver, "bad", "Refused");
    await d.client.syncNow();
    broken = false;
    await d.client.syncNow();
    expect(stored(server, "bad")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(stored(server, "bad")?.fields.title).toBe("Refused");
    expect(d.client.current()).toMatchObject({ pending: 0, held: 0 });
    d.client.stop();
  });

  it("is tried again at once when it is edited", async () => {
    const server = new MemoryServer();
    const d = device(refusing(server, (pk) => pk === "bad" && stored(server, "x") === undefined));
    await d.client.start();
    addTask(d.driver, "bad", "Refused");
    await d.client.syncNow();
    expect(d.client.current().held).toBe(1);
    addTask(d.driver, "x", "Unblocks", 2);
    await d.client.syncNow();
    d.driver.exec("UPDATE entities SET title = 'Edited' WHERE id = 'bad'");
    await d.client.syncNow();
    expect(stored(server, "bad")?.fields.title).toBe("Edited");
    expect(d.client.current().held).toBe(0);
    d.client.stop();
  });

  it("is tried again when the app starts again", async () => {
    const server = new MemoryServer();
    const first = device(refusing(server, (pk) => pk === "bad"));
    await first.client.start();
    addTask(first.driver, "bad", "Refused");
    await first.client.syncNow();
    first.client.stop();
    const second = device(transportTo(server), first.driver);
    await second.client.start();
    await settle();
    expect(stored(server, "bad")?.fields.title).toBe("Refused");
    second.client.stop();
  });

  it("doesn't count one the server failed on as lost", async () => {
    const server = new MemoryServer();
    const base = transportTo(server);
    const d = device({
      ...base,
      push: async (request) => {
        if (request.changes.some((c) => c.table === "entities" && c.pk === "bad"))
          throw new ApiRequestError(500, "internal", "Something went wrong on the server.");
        return base.push(request);
      },
    });
    await d.client.start();
    addTask(d.driver, "ok", "Fine", 1);
    addTask(d.driver, "bad", "Poison", 2);
    d.client.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(stored(server, "ok")).toBeDefined();
    expect(d.client.current()).toMatchObject({ state: "idle", pending: 1, held: 1, conflicts: 0 });
    d.client.stop();
  });

  it("doesn't starve the changes behind it", async () => {
    const d = device(transportTo(new MemoryServer()));
    await d.engine.enable();
    addTask(d.driver, "a", "First", 1);
    const [first, second] = await d.engine.collect(2);
    if (!first) throw new Error("nothing to send");
    const held = new Map([[changeKey(first.change.table, first.change.pk), first.version]]);
    const next = await d.engine.collect(1, { held });
    expect(next.map((p) => p.change.pk)).toEqual([second?.change.pk]);
  });
});

describe("changes an earlier version set aside", () => {
  /// What versions 1.0.0 to 1.0.3 left behind: the row as it was, no longer waiting to
  /// be sent, and a conflict entry with a copy of it.
  function setAside(driver: NodeSqliteDriver, pk: string, copy: Row) {
    driver.exec(
      "INSERT INTO sync_conflicts (id, tbl, pk, field, losing_value, losing_clock, winning_clock, created_at) VALUES (?, 'entities', ?, NULL, ?, ?, NULL, ?)",
      `aside-${pk}`,
      pk,
      JSON.stringify(copy),
      `${Date.now()}-000001-device`,
      iso(),
    );
    driver.exec("DELETE FROM sync_dirty WHERE tbl = 'entities' AND pk = ?", pk);
  }
  const rowOf = (driver: NodeSqliteDriver, pk: string) =>
    driver.rows("SELECT * FROM entities WHERE id = ?", pk)[0] ?? {};
  const open = (driver: NodeSqliteDriver) =>
    driver.rows("SELECT id FROM sync_conflicts WHERE resolved_at IS NULL").map((r) => r.id);

  it("are sent after all, and no longer ask for a look", async () => {
    const server = new MemoryServer();
    const d = device(transportTo(server));
    await d.engine.enable();
    addTask(d.driver, "t1", "Set aside");
    setAside(d.driver, "t1", rowOf(d.driver, "t1"));
    await d.client.start();
    expect(stored(server, "t1")?.fields.title).toBe("Set aside");
    expect(open(d.driver)).toEqual([]);
    d.client.stop();
  });

  it("include a removal", async () => {
    const server = new MemoryServer();
    const d = device(transportTo(server));
    await d.client.start();
    addTask(d.driver, "t1", "Removed here");
    await d.client.syncNow();
    const copy = rowOf(d.driver, "t1");
    d.client.stop();
    d.driver.exec("DELETE FROM tasks WHERE entity_id = 't1'");
    d.driver.exec("DELETE FROM entities WHERE id = 't1'");
    setAside(d.driver, "t1", copy);
    const again = device(transportTo(server), d.driver);
    await again.client.start();
    expect(stored(server, "t1")?.deletedClock).not.toBeNull();
    expect(open(d.driver)).toEqual([]);
    again.client.stop();
  });

  it("leave an edit that was undone as it is, to be brought back by hand", async () => {
    const server = new MemoryServer();
    const d = device(transportTo(server));
    await d.client.start();
    addTask(d.driver, "t1", "As the server has it");
    await d.client.syncNow();
    d.client.stop();
    setAside(d.driver, "t1", { ...rowOf(d.driver, "t1"), title: "Refused edit" });
    const again = device(transportTo(server), d.driver);
    await again.client.start();
    expect(open(d.driver)).toEqual(["aside-t1"]);
    expect(titleOf(d.driver, "t1")).toBe("As the server has it");
    again.client.stop();
  });
});
