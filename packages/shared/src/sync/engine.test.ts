import { describe, expect, it } from "vitest";
import { SyncEngine } from "./engine.ts";
import type { BatchResult, SqlStatement } from "./sql.ts";
import { MemoryServer } from "./testing/memory-server.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";

let ids = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

function device(name: string) {
  const driver = new NodeSqliteDriver();
  let time = Date.parse("2026-10-14T10:00:00Z");
  const engine = new SyncEngine({ driver, now: () => time, newId: nextId });
  return {
    name,
    driver,
    engine,
    tick(ms: number) {
      time += ms;
    },
  };
}
type Device = ReturnType<typeof device>;

const TIME = "2026-10-14T09:00:00.000000000+00:00";

function addSpace(d: Device, id = "space-1") {
  d.driver.exec(
    "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES (?, 'Personal', 'blue', ?, ?)",
    id,
    TIME,
    TIME,
  );
}

function addTask(d: Device, id: string, title: string, key = 1) {
  const now = new Date().toISOString();
  d.driver.exec(
    "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 'space-1', 'task', ?, ?, ?, 'TSK', ?)",
    id,
    title,
    now,
    now,
    key,
  );
  d.driver.exec("INSERT INTO tasks (entity_id, status_id) VALUES (?, 'todo')", id);
}

async function pull(d: Device, server: MemoryServer) {
  for (;;) {
    const response = server.pull({ cursors: await d.engine.cursors(), limit: 2 });
    await d.engine.apply(response.datasets);
    if (!response.datasets.some((x) => x.hasMore)) return;
  }
}

async function push(d: Device, server: MemoryServer) {
  for (;;) {
    const planned = await d.engine.collect();
    if (planned.length === 0) return;
    const response = server.push({ changes: planned.map((p) => p.change) });
    await d.engine.acknowledge(planned, response.results);
  }
}

async function sync(d: Device, server: MemoryServer) {
  await pull(d, server);
  await push(d, server);
  await pull(d, server);
}

const title = (d: Device, id: string) =>
  d.driver.rows("SELECT title FROM entities WHERE id = ?", id)[0]?.title;

describe("turning sync on", () => {
  it("dates existing rows by their own timestamps, not now", async () => {
    const d = device("a");
    addSpace(d);
    await d.engine.enable();
    const rows = d.driver.rows("SELECT tbl, pk, changed_at FROM sync_dirty WHERE tbl = 'spaces'");
    expect(rows).toEqual([
      { tbl: "spaces", pk: "space-1", changed_at: Date.parse("2026-10-14T09:00:00Z") },
    ]);
  });

  it("marks the seeded task statuses too", async () => {
    const d = device("a");
    await d.engine.enable();
    expect(
      d.driver.rows("SELECT COUNT(*) AS n FROM sync_dirty WHERE tbl = 'task_statuses'")[0].n,
    ).toBe(5);
  });

  it("forgets the server's state but keeps the data when turned off", async () => {
    const d = device("a");
    const server = new MemoryServer();
    addSpace(d);
    await d.engine.enable();
    await sync(d, server);
    await d.engine.disable();
    expect(d.driver.rows("SELECT COUNT(*) AS n FROM sync_rows")[0].n).toBe(0);
    expect(d.driver.rows("SELECT name FROM spaces")).toEqual([{ name: "Personal" }]);
    expect(await d.engine.isEnabled()).toBe(false);
  });
});

describe("pushing", () => {
  it("sends parents before children and only what changed", async () => {
    const d = device("a");
    await d.engine.enable();
    addSpace(d);
    addTask(d, "t1", "Write report");
    const planned = await d.engine.collect();
    const tables = planned.map((p) => p.change.table);
    expect(tables.indexOf("spaces")).toBeLessThan(tables.indexOf("entities"));
    expect(tables.indexOf("entities")).toBeLessThan(tables.indexOf("tasks"));
    const server = new MemoryServer();
    await d.engine.acknowledge(
      planned,
      server.push({ changes: planned.map((p) => p.change) }).results,
    );
    expect(await d.engine.collect()).toEqual([]);
    d.driver.exec("UPDATE entities SET title = 'Write the report' WHERE id = 't1'");
    const edit = await d.engine.collect();
    expect(edit.map((p) => [p.change.table, Object.keys(p.change.fields)])).toEqual([
      ["entities", ["title"]],
    ]);
    expect(edit[0].change.baseClocks.title).toBeDefined();
  });

  it("never sends a device's local file paths", async () => {
    const d = device("a");
    await d.engine.enable();
    addSpace(d);
    const now = new Date().toISOString();
    d.driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at) VALUES ('f1', 'space-1', 'file', 'Slides', ?, ?)",
      now,
      now,
    );
    d.driver.exec(
      "INSERT INTO files (entity_id, local_path, original_filename) VALUES ('f1', '/Users/me/x.pdf', 'x.pdf')",
    );
    const file = (await d.engine.collect()).find((p) => p.change.table === "files");
    expect(file?.change.fields).not.toHaveProperty("local_path");
    expect(file?.change.fields.original_filename).toBe("x.pdf");
  });
});

describe("two devices", () => {
  async function pair() {
    const server = new MemoryServer();
    const a = device("a");
    const b = device("b");
    await a.engine.enable();
    await b.engine.enable();
    addSpace(a);
    addTask(a, "t1", "Write report");
    await sync(a, server);
    await sync(b, server);
    return { server, a, b };
  }

  it("brings a task made on one onto the other", async () => {
    const { b } = await pair();
    expect(title(b, "t1")).toBe("Write report");
    expect(b.driver.rows("SELECT status_id FROM tasks WHERE entity_id = 't1'")).toEqual([
      { status_id: "todo" },
    ]);
  });

  it("doesn't send changes back that just arrived", async () => {
    const { b } = await pair();
    expect(await b.engine.collect()).toEqual([]);
  });

  it("merges edits to different fields made offline on both", async () => {
    const { server, a, b } = await pair();
    a.driver.exec("UPDATE entities SET title = 'Final report' WHERE id = 't1'");
    b.driver.exec("UPDATE tasks SET due_date = '2026-10-20' WHERE entity_id = 't1'");
    await sync(a, server);
    await sync(b, server);
    await sync(a, server);
    for (const d of [a, b]) {
      expect(title(d, "t1")).toBe("Final report");
      expect(d.driver.rows("SELECT due_date FROM tasks WHERE entity_id = 't1'")).toEqual([
        { due_date: "2026-10-20" },
      ]);
    }
  });

  it("keeps the newer of two edits to one field and the other as a conflict", async () => {
    const { server, a, b } = await pair();
    a.driver.exec("UPDATE entities SET title = 'From A' WHERE id = 't1'");
    await new Promise((resolve) => setTimeout(resolve, 5));
    b.driver.exec("UPDATE entities SET title = 'From B' WHERE id = 't1'");
    await sync(b, server);
    await sync(a, server);
    await sync(b, server);
    expect(title(a, "t1")).toBe("From B");
    expect(title(b, "t1")).toBe("From B");
    const conflicts = await a.engine.conflicts();
    expect(conflicts.map((c) => [c.table, c.field, c.losingValue])).toEqual([
      ["entities", "title", "From A"],
    ]);
  });

  it("lets an edit made after seeing a change win, even on a device whose clock is behind", async () => {
    const { server, a, b } = await pair();
    // B's clock floor moves past A's clock as it pulls, so its next edit is later.
    b.driver.exec("UPDATE sync_meta SET value = '0' WHERE key = 'clock_floor'");
    a.driver.exec(
      "UPDATE sync_meta SET value = ? WHERE key = 'clock_floor'",
      String(Date.now() + 3_600_000),
    );
    a.driver.exec("UPDATE entities SET title = 'From A, clock ahead' WHERE id = 't1'");
    await sync(a, server);
    await sync(b, server);
    b.driver.exec("UPDATE entities SET title = 'From B, after seeing A' WHERE id = 't1'");
    await sync(b, server);
    await sync(a, server);
    expect(title(a, "t1")).toBe("From B, after seeing A");
  });

  it("deletes a row deleted on the other device", async () => {
    const { server, a, b } = await pair();
    a.driver.exec(
      "INSERT INTO labels (id, space_id, name, color, created_at) VALUES ('l1', 'space-1', 'Work', 'red', ?)",
      TIME,
    );
    a.driver.exec("INSERT INTO entity_labels (entity_id, label_id) VALUES ('t1', 'l1')");
    await sync(a, server);
    await sync(b, server);
    expect(b.driver.rows("SELECT * FROM entity_labels")).toHaveLength(1);
    a.driver.exec("DELETE FROM entity_labels");
    await sync(a, server);
    await sync(b, server);
    expect(b.driver.rows("SELECT * FROM entity_labels")).toHaveLength(0);
  });

  it("keeps a block added while the other device emptied its page from Trash, as a conflict", async () => {
    const { server, a, b } = await pair();
    const now = new Date().toISOString();
    b.driver.exec(
      "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES ('b1', 't1', 0, 'paragraph', 'Note from B', ?, ?)",
      now,
      now,
    );
    a.driver.exec("DELETE FROM tasks WHERE entity_id = 't1'");
    a.driver.exec("DELETE FROM entities WHERE id = 't1'");
    await sync(a, server);
    await sync(b, server);
    await sync(a, server);
    expect(b.driver.rows("SELECT * FROM entities WHERE id = 't1'")).toHaveLength(0);
    expect(b.driver.rows("SELECT * FROM blocks")).toHaveLength(0);
    const kept = (await b.engine.conflicts()).find((c) => c.table === "blocks");
    expect(kept?.losingValue).toContain("Note from B");
    expect(a.driver.rows("SELECT * FROM blocks")).toHaveLength(0);
  });

  it("gives two tasks made offline with the same key different keys on both", async () => {
    const { server, a, b } = await pair();
    addTask(a, "t2", "From A", 2);
    await new Promise((resolve) => setTimeout(resolve, 5));
    addTask(b, "t3", "From B", 2);
    await sync(a, server);
    await sync(b, server);
    await sync(a, server);
    await sync(b, server);
    const keys = (d: Device) => d.driver.rows("SELECT id, key_number FROM entities ORDER BY id");
    expect(keys(a)).toEqual(keys(b));
    const numbers = keys(a).map((r) => r.key_number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(keys(a).find((r) => r.id === "t2")?.key_number).toBe(2);
  });

  it("converges whatever order the devices sync in", async () => {
    const { server, a, b } = await pair();
    for (let round = 0; round < 3; round++) {
      a.driver.exec("UPDATE entities SET title = ? WHERE id = 't1'", `A${round}`);
      b.driver.exec("UPDATE tasks SET effort = ? WHERE entity_id = 't1'", round);
      await sync(round % 2 ? a : b, server);
    }
    await sync(a, server);
    await sync(b, server);
    await sync(a, server);
    const state = (d: Device) =>
      d.driver.rows("SELECT e.title, t.effort FROM entities e JOIN tasks t ON t.entity_id = e.id");
    expect(state(a)).toEqual(state(b));
    expect(state(a)).toEqual([{ title: "A2", effort: 2 }]);
  });
});

describe("never overwriting a change made while applying", () => {
  it("plans again when the user edits a row between reading and writing", async () => {
    const server = new MemoryServer();
    const a = device("a");
    const b = device("b");
    await a.engine.enable();
    await b.engine.enable();
    addSpace(a);
    addTask(a, "t1", "Original");
    await sync(a, server);
    await sync(b, server);
    a.driver.exec("UPDATE entities SET title = 'Remote edit' WHERE id = 't1'");
    await sync(a, server);

    // The user types on B right after the engine read its rows.
    const batch = b.driver.batch.bind(b.driver);
    let interfered = false;
    b.driver.batch = async (statements: SqlStatement[]): Promise<BatchResult> => {
      if (!interfered && statements.some((s) => s.sql.includes('INSERT INTO "entities"'))) {
        interfered = true;
        b.driver.exec("UPDATE tasks SET effort = 3 WHERE entity_id = 't1'");
      }
      return batch(statements);
    };
    await sync(b, server);
    expect(interfered).toBe(true);
    expect(title(b, "t1")).toBe("Remote edit");
    expect(b.driver.rows("SELECT effort FROM tasks WHERE entity_id = 't1'")).toEqual([
      { effort: 3 },
    ]);
    await sync(a, server);
    expect(a.driver.rows("SELECT effort FROM tasks WHERE entity_id = 't1'")).toEqual([
      { effort: 3 },
    ]);
  });
});

describe("roles", () => {
  it("tells the role an entity came with", async () => {
    const d = device("a");
    await d.engine.enable();
    expect(await d.engine.roleOf("p1")).toBeNull();
    await d.engine.apply([
      {
        dataset: "share:00000000-0000-4000-8000-000000000009",
        role: "viewer",
        cursor: 1,
        hasMore: false,
        records: [
          {
            table: "spaces",
            pk: "shared-x",
            scope: null,
            fields: {
              id: "shared-x",
              name: "Shared",
              color: "gray",
              created_at: TIME,
              updated_at: TIME,
              position: 0,
            },
            clocks: {
              id: "0000000000000-000000-server",
              name: "0000000000000-000000-server",
              color: "0000000000000-000000-server",
              created_at: "0000000000000-000000-server",
              updated_at: "0000000000000-000000-server",
              position: "0000000000000-000000-server",
            },
            deletedClock: null,
            seq: 0,
          },
          {
            table: "entities",
            pk: "p1",
            scope: "p1",
            fields: {
              id: "p1",
              space_id: "shared-x",
              type: "note",
              title: "Shared page",
              created_at: TIME,
              updated_at: TIME,
            },
            clocks: {
              id: "1791934383689-000001-own",
              space_id: "1791934383689-000001-own",
              type: "1791934383689-000001-own",
              title: "1791934383689-000001-own",
              created_at: "1791934383689-000001-own",
              updated_at: "1791934383689-000001-own",
            },
            deletedClock: null,
            seq: 1,
          },
        ],
      },
    ]);
    expect(await d.engine.roleOf("p1")).toBe("viewer");
  });
});

describe("bringing a lost edit back", () => {
  it("puts a losing field value back, and it syncs as a new edit", async () => {
    const server = new MemoryServer();
    const a = device("a");
    const b = device("b");
    await a.engine.enable();
    await b.engine.enable();
    addSpace(a);
    addTask(a, "t1", "Original");
    await sync(a, server);
    await sync(b, server);
    a.driver.exec("UPDATE tasks SET effort = 3 WHERE entity_id = 't1'");
    await new Promise((resolve) => setTimeout(resolve, 5));
    b.driver.exec("UPDATE tasks SET effort = 5 WHERE entity_id = 't1'");
    await sync(b, server);
    await sync(a, server);
    const [lost] = await a.engine.conflicts();
    expect([lost.field, lost.losingValue]).toEqual(["effort", 3]);
    await a.engine.restoreConflict(lost.id);
    expect(a.driver.rows("SELECT effort FROM tasks")).toEqual([{ effort: 3 }]);
    expect(await a.engine.conflicts()).toEqual([]);
    await sync(a, server);
    await sync(b, server);
    expect(b.driver.rows("SELECT effort FROM tasks")).toEqual([{ effort: 3 }]);
  });

  it("keeps a removed row until the row it belongs to is back", async () => {
    const server = new MemoryServer();
    const a = device("a");
    const b = device("b");
    await a.engine.enable();
    await b.engine.enable();
    addSpace(a);
    addTask(a, "t1", "Page");
    await sync(a, server);
    await sync(b, server);
    const now = new Date().toISOString();
    b.driver.exec(
      "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES ('b1', 't1', 0, 'paragraph', 'Keep me', ?, ?)",
      now,
      now,
    );
    a.driver.exec("DELETE FROM tasks WHERE entity_id = 't1'");
    a.driver.exec("DELETE FROM entities WHERE id = 't1'");
    await sync(a, server);
    await sync(b, server);
    const block = (await b.engine.conflicts()).find((c) => c.table === "blocks");
    if (!block) throw new Error("no conflict kept");
    // Its page is gone too; the block can come back once the page does.
    await expect(b.engine.restoreConflict(block.id)).rejects.toThrow();
    expect((await b.engine.conflicts()).some((c) => c.id === block.id)).toBe(true);
  });

  it("settles on a value the person chose, combined from both, and it syncs", async () => {
    const server = new MemoryServer();
    const a = device("a");
    const b = device("b");
    await a.engine.enable();
    await b.engine.enable();
    addSpace(a);
    addTask(a, "t1", "Buy milk");
    await sync(a, server);
    await sync(b, server);
    a.driver.exec("UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    await new Promise((resolve) => setTimeout(resolve, 5));
    b.driver.exec("UPDATE entities SET title = 'Buy milk and eggs' WHERE id = 't1'");
    await sync(b, server);
    await sync(a, server);
    const [lost] = await a.engine.conflicts();
    await a.engine.resolveConflict(lost.id, "Buy oat milk and eggs");
    expect(a.driver.rows("SELECT title FROM entities WHERE id = 't1'")).toEqual([
      { title: "Buy oat milk and eggs" },
    ]);
    expect(await a.engine.conflicts()).toEqual([]);
    await sync(a, server);
    await sync(b, server);
    expect(b.driver.rows("SELECT title FROM entities WHERE id = 't1'")).toEqual([
      { title: "Buy oat milk and eggs" },
    ]);
    // Both versions stay in the log, resolved: nothing is deleted.
    expect(
      a.driver.rows("SELECT losing_value, resolved_at IS NOT NULL AS done FROM sync_conflicts"),
    ).toEqual([{ losing_value: '"Buy oat milk"', done: 1 }]);
  });

  it("keeps the current value as the choice, leaving the other in the log", async () => {
    const d = device("a");
    await d.engine.enable();
    d.driver.exec(
      "INSERT INTO sync_conflicts (id, tbl, pk, field, losing_value, created_at) VALUES ('c1', 'tasks', 't1', 'effort', '3', 'now')",
    );
    await d.engine.dismissConflict("c1");
    expect(d.driver.rows("SELECT losing_value FROM sync_conflicts")).toEqual([
      { losing_value: "3" },
    ]);
  });

  it("can be dismissed instead", async () => {
    const d = device("a");
    await d.engine.enable();
    d.driver.exec(
      "INSERT INTO sync_conflicts (id, tbl, pk, field, losing_value, created_at) VALUES ('c1', 'tasks', 't1', 'effort', '3', 'now')",
    );
    await d.engine.dismissConflict("c1");
    expect(await d.engine.conflicts()).toEqual([]);
  });
});
