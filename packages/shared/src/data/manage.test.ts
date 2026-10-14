import { beforeEach, describe, expect, it } from "vitest";
import { NodeSqliteDriver } from "../sync/testing/node-driver.ts";
import { createBookmark } from "./bookmarks.ts";
import { type LocalDb, rows, str } from "./db.ts";
import { createSpace, getEntity, listSpaces, spaceModules, trashEntity } from "./entities.ts";
import { attachLabel, createLabel, entityLabels, listLabels } from "./links.ts";
import {
  addSpaceModule,
  deleteForever,
  deleteLabel,
  deleteSpace,
  duplicateEntity,
  emptyTrash,
  moveEntity,
  removeSpaceModule,
  reorderSpaceModules,
  reorderSpaces,
  setEntityIcon,
  updateLabel,
  updateSpace,
} from "./manage.ts";
import { addBlock, createPage, listBlocks } from "./notes.ts";
import {
  convertToSubtask,
  createSubtask,
  createTask,
  getTask,
  listSubtasks,
  setTaskEffort,
  setTaskStatus,
  subtaskProgress,
} from "./tasks.ts";

let db: LocalDb;
let clock: number;
let ids: number;

beforeEach(() => {
  clock = Date.parse("2026-10-14T09:00:00Z");
  ids = 0;
  db = {
    driver: new NodeSqliteDriver(),
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    now: () => new Date((clock += 1000)),
  };
});

const count = async (table: string) =>
  Number((await rows(db, `SELECT COUNT(*) AS n FROM ${table}`))[0].n);

describe("Spaces", () => {
  it("renames, recolors and gives an icon, leaving the rest as it was", async () => {
    const id = await createSpace(db, "Work", "#0070f3");
    await updateSpace(db, id, { name: "  Office ", icon: "briefcase" });
    const [space] = await listSpaces(db);
    expect(space).toMatchObject({ name: "Office", icon: "briefcase", color: "#0070f3" });
    await updateSpace(db, id, { color: "#ff0000" });
    expect((await listSpaces(db))[0]).toMatchObject({
      name: "Office",
      icon: "briefcase",
      color: "#ff0000",
    });
    await expect(updateSpace(db, id, { name: "  " })).rejects.toThrow("Give the Space a name");
  });

  it("reorders", async () => {
    const a = await createSpace(db, "A", "#000000");
    const b = await createSpace(db, "B", "#000000");
    await reorderSpaces(db, [b, a]);
    expect((await listSpaces(db)).map((s) => s.name)).toEqual(["B", "A"]);
  });

  it("deletes the Space with everything in it, and nothing of another", async () => {
    const gone = await createSpace(db, "Gone", "#000000");
    const kept = await createSpace(db, "Kept", "#000000");
    const task = await createTask(db, gone, "Task");
    await createSubtask(db, task, "Sub");
    const label = await createLabel(db, gone, "Urgent");
    await attachLabel(db, task, label);
    await createPage(db, gone, "note", "Note");
    await createBookmark(db, gone, "https://example.com", "Example");
    const other = await createTask(db, kept, "Other");
    await deleteSpace(db, gone);
    expect((await listSpaces(db)).map((s) => s.id)).toEqual([kept]);
    expect(await count("entities")).toBe(1);
    expect(await count("tasks")).toBe(1);
    expect(await count("blocks")).toBe(0);
    expect(await count("relationships")).toBe(0);
    expect(await count("labels")).toBe(0);
    expect(await count("space_modules")).toBe(1);
    expect(await getEntity(db, other)).not.toBeNull();
  });
});

describe("modules", () => {
  it("removing one hides its items, adding it brings them back, deleting sends them to Trash", async () => {
    const space = await createSpace(db, "Work", "#000000");
    const task = await createTask(db, space, "Task");
    const trashed = await createTask(db, space, "Already trashed");
    await trashEntity(db, trashed);
    await createPage(db, space, "note", "Note");
    await removeSpaceModule(db, space, "tasks", false);
    expect(await spaceModules(db, space)).toEqual(["notes"]);
    const hidden = await rows(
      db,
      "SELECT id, hidden_at, deleted_at FROM entities WHERE id = ?",
      task,
    );
    expect(hidden[0].hidden_at).not.toBeNull();
    await addSpaceModule(db, space, "tasks");
    // It keeps the place it had.
    expect(await spaceModules(db, space)).toEqual(["tasks", "notes"]);
    const back = await rows(db, "SELECT hidden_at, deleted_at FROM entities WHERE id = ?", task);
    expect(back[0]).toEqual({ hidden_at: null, deleted_at: null });
    // The one trashed before stays in Trash.
    expect(
      (await rows(db, "SELECT deleted_at FROM entities WHERE id = ?", trashed))[0].deleted_at,
    ).not.toBeNull();
    await removeSpaceModule(db, space, "tasks", true);
    const trash = await rows(db, "SELECT hidden_at, deleted_at FROM entities WHERE id = ?", task);
    expect(trash[0].hidden_at).toBeNull();
    expect(trash[0].deleted_at).not.toBeNull();
  });

  it("refuses a module that can't be removed alone, and reorders the rest", async () => {
    const space = await createSpace(db, "Work", "#000000");
    await createTask(db, space, "T");
    await createPage(db, space, "note", "N");
    await expect(removeSpaceModule(db, space, "semesters", false)).rejects.toThrow(
      "can't be removed",
    );
    await reorderSpaceModules(db, space, ["notes", "tasks"]);
    expect(await spaceModules(db, space)).toEqual(["notes", "tasks"]);
  });
});

describe("moving items", () => {
  it("moves a task with its sub-tasks, detaches the old Space's labels and adds the module", async () => {
    const from = await createSpace(db, "From", "#000000");
    const to = await createSpace(db, "To", "#000000");
    const task = await createTask(db, from, "Task");
    const sub = await createSubtask(db, task, "Sub");
    const label = await createLabel(db, from, "Old");
    await attachLabel(db, task, label);
    await moveEntity(db, task, to);
    expect((await getEntity(db, task))?.spaceId).toBe(to);
    expect((await getEntity(db, sub))?.spaceId).toBe(to);
    expect(await entityLabels(db, task)).toEqual([]);
    expect(await spaceModules(db, to)).toContain("tasks");
  });

  it("refuses to move a sub-task on its own", async () => {
    const from = await createSpace(db, "From", "#000000");
    const to = await createSpace(db, "To", "#000000");
    const task = await createTask(db, from, "Task");
    const sub = await createSubtask(db, task, "Sub");
    await expect(moveEntity(db, sub, to)).rejects.toThrow("moves together");
    expect((await getEntity(db, sub))?.spaceId).toBe(from);
  });

  it("sets an icon", async () => {
    const space = await createSpace(db, "S", "#000000");
    const page = await createPage(db, space, "note", "P");
    await setEntityIcon(db, page, "🧪");
    expect((await getEntity(db, page))?.icon).toBe("🧪");
  });
});

describe("Trash", () => {
  it("deletes forever only what is in Trash, with everything keyed by it", async () => {
    const space = await createSpace(db, "S", "#000000");
    const task = await createTask(db, space, "T");
    await expect(deleteForever(db, task)).rejects.toThrow("Only an item in Trash");
    await createSubtask(db, task, "Sub");
    await trashEntity(db, task);
    await deleteForever(db, task);
    expect(await getEntity(db, task)).toBeNull();
    expect(await count("tasks")).toBe(1);
  });

  it("empties Trash and nothing else", async () => {
    const space = await createSpace(db, "S", "#000000");
    const kept = await createTask(db, space, "Kept");
    const one = await createTask(db, space, "One");
    const two = await createPage(db, space, "note", "Two");
    await trashEntity(db, one);
    await trashEntity(db, two);
    expect(await emptyTrash(db)).toBe(2);
    expect(await count("entities")).toBe(1);
    expect(await getEntity(db, kept)).not.toBeNull();
    expect(await emptyTrash(db)).toBe(0);
  });
});

describe("labels", () => {
  it("renames and recolors, refusing a name that is taken", async () => {
    const space = await createSpace(db, "S", "#000000");
    const a = await createLabel(db, space, "Urgent");
    await createLabel(db, space, "Later");
    await updateLabel(db, a, { name: "Now", color: "#ff0000" });
    expect((await listLabels(db, space)).find((l) => l.id === a)).toMatchObject({
      name: "Now",
      color: "#ff0000",
    });
    await expect(updateLabel(db, a, { name: "later" })).rejects.toThrow("already exists");
  });

  it("deletes off every item", async () => {
    const space = await createSpace(db, "S", "#000000");
    const task = await createTask(db, space, "T");
    const label = await createLabel(db, space, "Urgent");
    await attachLabel(db, task, label);
    await deleteLabel(db, label);
    expect(await entityLabels(db, task)).toEqual([]);
    expect(str((await rows(db, "SELECT COUNT(*) AS n FROM labels"))[0].n)).toBe("0");
  });
});

describe("sub-tasks and effort", () => {
  it("makes sub-tasks one level deep, in the parent's Space, with their progress", async () => {
    const space = await createSpace(db, "S", "#000000");
    const task = await createTask(db, space, "Parent");
    expect(await subtaskProgress(db, task)).toBeNull();
    const one = await createSubtask(db, task, "One");
    const two = await createSubtask(db, task, "Two");
    await setTaskStatus(db, one, "done");
    expect((await listSubtasks(db, task)).map((t) => t.entity.title)).toEqual(["One", "Two"]);
    expect(await subtaskProgress(db, task)).toBe(50);
    await expect(createSubtask(db, one, "Deeper")).rejects.toThrow("can't have sub-tasks");
    await trashEntity(db, two);
    expect(await subtaskProgress(db, task)).toBe(100);
  });

  it("turns a task into a sub-task, moving it, unless it has some of its own", async () => {
    const a = await createSpace(db, "A", "#000000");
    const b = await createSpace(db, "B", "#000000");
    const parent = await createTask(db, a, "Parent");
    const loose = await createTask(db, b, "Loose");
    await convertToSubtask(db, loose, parent);
    expect(await getEntity(db, loose)).toMatchObject({ type: "sub_task", spaceId: a });
    const other = await createTask(db, a, "Other");
    await expect(convertToSubtask(db, parent, other)).rejects.toThrow("sub-tasks of its own");
    await expect(convertToSubtask(db, other, other)).rejects.toThrow("another top level task");
  });

  it("takes only the estimates the desktop does", async () => {
    const space = await createSpace(db, "S", "#000000");
    const task = await createTask(db, space, "T");
    await setTaskEffort(db, task, 5);
    expect((await getTask(db, task))?.effort).toBe(5);
    await expect(setTaskEffort(db, task, 4)).rejects.toThrow("1, 2, 3, 5, 8 or 13");
    await setTaskEffort(db, task, null);
    expect((await getTask(db, task))?.effort).toBeNull();
  });
});

describe("duplicating", () => {
  it("copies a task with its fields, labels and place under its parent", async () => {
    const space = await createSpace(db, "S", "#000000");
    const parent = await createTask(db, space, "Parent");
    const sub = await createSubtask(db, parent, "Sub");
    await setTaskEffort(db, sub, 3);
    const label = await createLabel(db, space, "Urgent");
    await attachLabel(db, sub, label);
    await setEntityIcon(db, sub, "🧪");
    const copy = await duplicateEntity(db, sub);
    expect(await getEntity(db, copy)).toMatchObject({
      title: "Sub (copy)",
      type: "sub_task",
      icon: "🧪",
      spaceId: space,
    });
    expect((await getTask(db, copy))?.effort).toBe(3);
    expect((await entityLabels(db, copy)).map((l) => l.name)).toEqual(["Urgent"]);
    expect((await listSubtasks(db, parent)).map((t) => t.entity.title)).toEqual([
      "Sub",
      "Sub (copy)",
    ]);
  });

  it("copies a page's blocks, and keeps an empty title empty", async () => {
    const space = await createSpace(db, "S", "#000000");
    const page = await createPage(db, space, "note", "");
    await addBlock(db, page, "heading1", "Hello");
    const copy = await duplicateEntity(db, page);
    expect((await getEntity(db, copy))?.title).toBe("");
    expect((await listBlocks(db, copy)).map((b) => b.content)).toEqual(["", "Hello"]);
    expect((await listBlocks(db, page)).length).toBe(2);
  });

  it("copies a bookmark, and refuses what it can't copy", async () => {
    const space = await createSpace(db, "S", "#000000");
    const mark = await createBookmark(db, space, "https://example.com", "Example");
    const copy = await duplicateEntity(db, mark);
    expect(
      str((await rows(db, "SELECT url FROM bookmarks WHERE entity_id = ?", copy))[0].url),
    ).toBe("https://example.com");
    await trashEntity(db, mark);
    await expect(duplicateEntity(db, mark)).rejects.toThrow("isn't here");
  });
});
