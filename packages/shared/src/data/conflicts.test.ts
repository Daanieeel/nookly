import { describe, expect, it } from "vitest";
import type { Conflict } from "../sync/engine.ts";
import { NodeSqliteDriver } from "../sync/testing/node-driver.ts";
import { describeConflicts, fieldLabel } from "./conflicts.ts";
import type { LocalDb } from "./db.ts";
import { createSpace } from "./entities.ts";
import { createPage, listBlocks } from "./notes.ts";
import { createTask } from "./tasks.ts";

let ids = 0;
const db: LocalDb = {
  driver: new NodeSqliteDriver(),
  newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
  now: () => new Date("2026-10-14T09:00:00Z"),
};

const conflict = (patch: Partial<Conflict>): Conflict => ({
  id: "c",
  table: "entities",
  pk: "",
  field: null,
  losingValue: null,
  losingClock: null,
  winningClock: null,
  createdAt: "2026-10-14T09:00:00Z",
  ...patch,
});

describe("a lost change in words", () => {
  it("names the item, the field and the value that lost", async () => {
    const space = await createSpace(db, "Work", "#3b82f6");
    const task = await createTask(db, space, "Report");
    const page = await createPage(db, space, "note", "Ideas");
    const [block] = await listBlocks(db, page);
    const items = await describeConflicts(db, [
      conflict({ table: "tasks", pk: task, field: "due_date", losingValue: "2026-10-20" }),
      conflict({ table: "entities", pk: task, field: "title", losingValue: "Old report" }),
      conflict({ table: "blocks", pk: block.id, field: "content", losingValue: "Draft" }),
      conflict({ table: "entities", pk: "gone" }),
    ]);
    expect(items.map((i) => [i.entityId, i.title, i.field, i.value])).toEqual([
      [task, "Report", "Due date", "2026-10-20"],
      [task, "Report", "Title", "Old report"],
      [page, "Ideas", "Content", "Draft"],
      [null, "An item no longer here", "The whole item", null],
    ]);
    expect(fieldLabel("status_id")).toBe("Status");
  });
});
