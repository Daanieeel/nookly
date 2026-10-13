import { describe, expect, it } from "vitest";
import {
  DESKTOP_SCHEMA,
  SYNCED_TABLES,
  decodePk,
  encodePk,
  syncedColumns,
  syncedTable,
} from "./schema.ts";
import { FOREIGN_KEYS, TABLE_ORDER } from "./sync/sql.ts";

describe("the exported desktop schema", () => {
  it("reads the foreign keys from each table's SQL", () => {
    expect(FOREIGN_KEYS).toContainEqual({
      table: "tasks",
      column: "entity_id",
      parent: "entities",
      parentColumn: "id",
    });
    expect(FOREIGN_KEYS).toContainEqual({
      table: "tasks",
      column: "status_id",
      parent: "task_statuses",
      parentColumn: "id",
    });
  });

  it("lists every table after the tables it points at", () => {
    for (const key of FOREIGN_KEYS) {
      const parent = TABLE_ORDER.get(key.parent);
      if (parent === undefined) continue;
      expect(parent, `${key.table} points at ${key.parent}`).toBeLessThanOrEqual(
        TABLE_ORDER.get(key.table) ?? -1,
      );
    }
  });

  it("knows every registered entity type's key prefix", () => {
    const task = DESKTOP_SCHEMA.entityTypes.find((t) => t.entityType === "task");
    expect(task?.keyPrefix).toBe("TSK");
    expect(task?.moduleKeys).toEqual(["tasks"]);
  });

  it("leaves device local columns out of what syncs", () => {
    const files = syncedTable("files");
    expect(files && syncedColumns(files)).not.toContain("local_path");
  });

  it("encodes keys of one and of several columns", () => {
    const spaces = syncedTable("spaces");
    const links = syncedTable("entity_labels");
    if (!spaces || !links) throw new Error("missing tables");
    expect(encodePk(spaces, { id: "s1" })).toBe("s1");
    const key = encodePk(links, { entity_id: "e", label_id: "l" });
    expect(key).toBe('["e","l"]');
    expect(decodePk(links, key)).toEqual({ entity_id: "e", label_id: "l" });
    expect(SYNCED_TABLES.length).toBeGreaterThan(20);
  });
});
