import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  PASSWORD,
  PHONE,
  type TestServer,
  addTask,
  device,
  startServer,
  titleOf,
  until,
  verifiedAccount,
} from "./helpers.ts";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.stop();
});

async function twoDevices() {
  const { api } = await verifiedAccount(server, "ada@example.com");
  const phoneApi = server.client();
  await phoneApi.signIn("ada@example.com", PASSWORD, PHONE);
  const a = device(api);
  const b = device(phoneApi);
  await a.engine.enable();
  await b.engine.enable();
  return { a, b };
}

/// One full round on a device, as the client runs it, without the live socket.
async function syncOnce(d: ReturnType<typeof device>) {
  const transport = d.api.syncTransport();
  const pull = async () => {
    for (;;) {
      const response = await transport.pull({ cursors: await d.engine.cursors() });
      await d.engine.apply(response.datasets);
      if (!response.datasets.some((x) => x.hasMore)) return;
    }
  };
  await pull();
  for (;;) {
    const planned = await d.engine.collect();
    if (planned.length === 0) break;
    await d.engine.acknowledge(
      planned,
      (await transport.push({ changes: planned.map((p) => p.change) })).results,
    );
  }
  await pull();
}

describe("sync between two devices", () => {
  it("carries a task from one to the other", async () => {
    const { a, b } = await twoDevices();
    addTask(a, "t1", "Buy milk");
    await syncOnce(a);
    await syncOnce(b);
    expect(titleOf(b, "t1")).toBe("Buy milk");
  });

  it("converges after offline edits on both, keeping the losing edit", async () => {
    const { a, b } = await twoDevices();
    addTask(a, "t1", "Draft");
    await syncOnce(a);
    await syncOnce(b);
    a.driver.exec("UPDATE entities SET title = 'From the laptop' WHERE id = 't1'");
    await Bun.sleep(5);
    b.driver.exec("UPDATE entities SET title = 'From the phone' WHERE id = 't1'");
    b.driver.exec("UPDATE tasks SET due_date = '2026-11-01' WHERE entity_id = 't1'");
    await syncOnce(a);
    await syncOnce(b);
    await syncOnce(a);
    for (const d of [a, b]) {
      expect(titleOf(d, "t1")).toBe("From the phone");
      expect(d.driver.rows("SELECT due_date FROM tasks")).toEqual([{ due_date: "2026-11-01" }]);
    }
    // The phone pulls before it pushes, so it is the one that sees both edits and keeps
    // the older one.
    const kept = await b.engine.conflicts();
    expect(kept.map((c) => [c.table, c.field, c.losingValue])).toEqual([
      ["entities", "title", "From the laptop"],
    ]);
  });

  it("keeps the losing edit on the server when a device pushes without having pulled", async () => {
    const { a, b } = await twoDevices();
    addTask(a, "t1", "Draft");
    await syncOnce(a);
    await syncOnce(b);
    a.driver.exec("UPDATE entities SET title = 'From the laptop' WHERE id = 't1'");
    await Bun.sleep(5);
    b.driver.exec("UPDATE entities SET title = 'From the phone' WHERE id = 't1'");
    await syncOnce(a);
    const planned = await b.engine.collect();
    await b.engine.acknowledge(
      planned,
      (await b.api.push({ changes: planned.map((p) => p.change) })).results,
    );
    const [lost] = await server.sql`SELECT tbl, field, losing_value FROM conflicts`;
    expect(lost).toEqual({ tbl: "entities", field: "title", losing_value: "From the laptop" });
  });

  it("syncs a delete as a tombstone, never removing the record", async () => {
    const { a, b } = await twoDevices();
    addTask(a, "t1", "Gone soon");
    a.driver.exec(
      "INSERT INTO labels (id, space_id, name, color, created_at) VALUES ('l1', 'space-1', 'Work', 'red', 'now')",
    );
    a.driver.exec("INSERT INTO entity_labels (entity_id, label_id) VALUES ('t1', 'l1')");
    await syncOnce(a);
    await syncOnce(b);
    a.driver.exec("DELETE FROM entity_labels");
    await syncOnce(a);
    await syncOnce(b);
    expect(b.driver.rows("SELECT * FROM entity_labels")).toEqual([]);
    const [record] =
      await server.sql`SELECT deleted_clock FROM records WHERE tbl = 'entity_labels'`;
    expect(record.deleted_clock).toBeString();
  });

  it("takes the same push twice without harm", async () => {
    const { a } = await twoDevices();
    addTask(a, "t1", "Once");
    const planned = await a.engine.collect();
    const changes = planned.map((p) => p.change);
    const first = await a.api.push({ changes });
    const second = await a.api.push({ changes });
    expect(second.results.map((r) => r.status)).toEqual(first.results.map((r) => r.status));
    const [{ n }] = await server.sql`SELECT COUNT(*)::int AS n FROM records WHERE tbl = 'entities'`;
    expect(n).toBe(1);
    const [{ seq }] = await server.sql`SELECT sync_seq::int AS seq FROM users`;
    expect(seq).toBe(changes.length);
  });

  it("pages through a large pull", async () => {
    const { a, b } = await twoDevices();
    for (let i = 0; i < 30; i++) addTask(a, `t${i}`, `Task ${i}`, i + 1);
    await syncOnce(a);
    const first = await b.api.pull({ cursors: {}, limit: 10 });
    expect(first.datasets[0].hasMore).toBe(true);
    expect(first.datasets[0].records).toHaveLength(10);
    await syncOnce(b);
    expect(b.driver.rows("SELECT COUNT(*) AS n FROM entities")[0].n).toBe(30);
  });

  it("refuses a change to a table or field that doesn't exist", async () => {
    const { a } = await twoDevices();
    const clock = "1791934383689-000001-dev";
    const response = await a.api.push({
      changes: [
        {
          dataset: "own",
          table: "users",
          pk: "x",
          scope: null,
          fields: { id: "x" },
          clocks: { id: clock },
          baseClocks: {},
          deletedClock: null,
        },
        {
          dataset: "own",
          table: "spaces",
          pk: "s",
          scope: null,
          fields: { id: "s", owner: "me" },
          clocks: { id: clock, owner: clock },
          baseClocks: {},
          deletedClock: null,
        },
      ],
    });
    expect(response.results.map((r) => [r.status, r.reason])).toEqual([
      ["rejected", "invalid"],
      ["rejected", "invalid"],
    ]);
  });
});

describe("live updates", () => {
  it("tells the other device to pull the moment a push lands", async () => {
    const { a, b } = await twoDevices();
    await a.client.start();
    await b.client.start();
    addTask(a, "t1", "Live");
    a.client.notifyLocalChange();
    await until(() => titleOf(b, "t1") === "Live", "the task to arrive live");
    a.client.stop();
    b.client.stop();
  });
});
