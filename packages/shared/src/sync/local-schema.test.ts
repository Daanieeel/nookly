/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Row, SqlValue } from "../schema.ts";
import { DESKTOP_SCHEMA } from "../schema.ts";
import { ensureSchema } from "./local-schema.ts";
import type { BatchResult, SqlDriver, SqlStatement } from "./sql.ts";

/// A bare database, nothing created yet, as a phone has on first launch.
class BareDriver implements SqlDriver {
  readonly db = new DatabaseSync(":memory:");
  async query(sql: string, params: SqlValue[]): Promise<Row[]> {
    // SAFETY: node:sqlite returns plain objects of SQL values; big integers are off.
    return this.db.prepare(sql).all(...params) as Row[];
  }
  async batch(statements: SqlStatement[]): Promise<BatchResult> {
    this.db.exec("BEGIN");
    try {
      for (const s of statements) this.db.prepare(s.sql).run(...s.params);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { outcome: "done" };
  }
}

const tables = async (d: BareDriver) =>
  (await d.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", [])).map(
    (r) => r.name,
  );

describe("a device's own database", () => {
  it("is built from the desktop's schema, with the seeded rows", async () => {
    const d = new BareDriver();
    await ensureSchema(d);
    const names = await tables(d);
    for (const t of DESKTOP_SCHEMA.tables) expect(names).toContain(t.name);
    expect(names).toContain("sync_dirty");
    expect((await d.query("SELECT COUNT(*) AS n FROM task_statuses", []))[0].n).toBe(5);
    const [{ v }] = await d
      .query("PRAGMA user_version", [])
      .then((r) => r.map((x) => ({ v: x.user_version })));
    expect(v).toBe(DESKTOP_SCHEMA.schemaVersion);
  });

  it("does nothing the second time", async () => {
    const d = new BareDriver();
    await ensureSchema(d);
    d.db.exec("UPDATE task_statuses SET name = 'Later' WHERE id = 'backlog'");
    await ensureSchema(d);
    expect((await d.query("SELECT name FROM task_statuses WHERE id = 'backlog'", []))[0].name).toBe(
      "Later",
    );
  });

  it("adds what a newer desktop schema has, keeping every row", async () => {
    const d = new BareDriver();
    // An older phone: tasks without the newest column, and no note settings yet.
    d.db.exec(
      "CREATE TABLE tasks (entity_id TEXT PRIMARY KEY, status_id TEXT NOT NULL, start_date TEXT, due_date TEXT)",
    );
    d.db.exec("INSERT INTO tasks (entity_id, status_id) VALUES ('t1', 'todo')");
    d.db.exec("PRAGMA user_version = 3");
    await ensureSchema(d);
    const columns = (await d.query("SELECT name FROM pragma_table_info('tasks')", [])).map(
      (r) => r.name,
    );
    expect(columns).toEqual(expect.arrayContaining(["completed_at", "effort", "repeat_rule"]));
    expect(await d.query("SELECT entity_id, status_id FROM tasks", [])).toEqual([
      { entity_id: "t1", status_id: "todo" },
    ]);
    expect(await tables(d)).toContain("note_settings");
  });
});
