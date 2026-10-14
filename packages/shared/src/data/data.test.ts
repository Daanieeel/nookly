import { beforeEach, describe, expect, it } from "vitest";
import { SyncEngine } from "../sync/engine.ts";
import { MemoryServer } from "../sync/testing/memory-server.ts";
import { NodeSqliteDriver } from "../sync/testing/node-driver.ts";
import { agenda, createCalendarEntry, updateCalendarEntry } from "./calendar.ts";
import { createBookmark, listBookmarks, titleFromUrl, updateBookmark } from "./bookmarks.ts";
import type { LocalDb } from "./db.ts";
import {
  createSpace,
  getEntity,
  listEntities,
  listSpaces,
  markOpened,
  pinned,
  recents,
  renameEntity,
  restoreEntity,
  search,
  setPinned,
  spaceModules,
  trashEntity,
} from "./entities.ts";
import {
  addBlock,
  createPage,
  deleteBlock,
  listBlocks,
  pagePreview,
  updateBlock,
} from "./notes.ts";
import {
  createTask,
  getTask,
  listStatuses,
  listTasks,
  nextAfter,
  setTaskDates,
  setTaskRepeat,
  setTaskStatus,
} from "./tasks.ts";

let driver: NodeSqliteDriver;
let db: LocalDb;
let clock: number;
let ids: number;

beforeEach(() => {
  driver = new NodeSqliteDriver();
  clock = Date.parse("2026-10-14T09:00:00Z");
  ids = 0;
  db = {
    driver,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    now: () => new Date((clock += 1000)),
  };
});

describe("spaces and entities", () => {
  it("creates Spaces in order and adds a module the first time it is used", async () => {
    const work = await createSpace(db, "Work", "#0070f3");
    await createSpace(db, "Home", "#00873d");
    expect((await listSpaces(db)).map((s) => s.name)).toEqual(["Work", "Home"]);
    await createTask(db, work, "One");
    await createTask(db, work, "Two");
    await createPage(db, work, "note", "Notes");
    expect(await spaceModules(db, work)).toEqual(["tasks", "notes"]);
  });

  it("gives each new entity the next key of its prefix", async () => {
    const space = await createSpace(db, "Work", "blue");
    const a = await createTask(db, space, "A");
    const b = await createTask(db, space, "B");
    const page = await createPage(db, space, "note", "P");
    expect([
      (await getEntity(db, a))?.key,
      (await getEntity(db, b))?.key,
      (await getEntity(db, page))?.key,
    ]).toEqual(["TSK-1", "TSK-2", "NOT-1"]);
  });

  it("moves to Trash and back, never removing anything", async () => {
    const space = await createSpace(db, "Work", "blue");
    const id = await createTask(db, space, "Gone for a while");
    await trashEntity(db, id);
    expect(await listEntities(db, { spaceId: space })).toEqual([]);
    expect((await listEntities(db, { trash: true })).map((e) => e.id)).toEqual([id]);
    await restoreEntity(db, id);
    expect((await listEntities(db, { spaceId: space })).map((e) => e.title)).toEqual([
      "Gone for a while",
    ]);
  });

  it("finds by title, by key and by page text", async () => {
    const space = await createSpace(db, "Work", "blue");
    const task = await createTask(db, space, "Write the report");
    const page = await createPage(db, space, "note", "Ideas");
    const [block] = await listBlocks(db, page);
    await updateBlock(db, block.id, "Use 100% recycled paper");
    expect((await search(db, "report")).map((e) => e.id)).toEqual([task]);
    expect((await search(db, "tsk-1")).map((e) => e.id)).toEqual([task]);
    expect((await search(db, "100%")).map((e) => e.id)).toEqual([page]);
    expect(await search(db, "  ")).toEqual([]);
  });

  it("keeps Recents and Pinned", async () => {
    const space = await createSpace(db, "Work", "blue");
    const a = await createTask(db, space, "A");
    const b = await createTask(db, space, "B");
    await markOpened(db, a);
    await markOpened(db, b);
    expect((await recents(db)).map((e) => e.id)).toEqual([b, a]);
    await setPinned(db, a, true);
    await renameEntity(db, a, "A, pinned");
    expect((await pinned(db)).map((e) => e.title)).toEqual(["A, pinned"]);
  });
});

describe("tasks", () => {
  it("start in the Backlog and stamp when they are finished", async () => {
    const space = await createSpace(db, "Work", "blue");
    const id = await createTask(db, space, "Ship it", "2026-10-20");
    expect((await getTask(db, id))?.statusId).toBe("backlog");
    await setTaskStatus(db, id, "done");
    const done = await getTask(db, id);
    expect(done?.completedAt).not.toBeNull();
    await setTaskStatus(db, id, "done");
    expect((await getTask(db, id))?.completedAt).toBe(done?.completedAt);
    await setTaskStatus(db, id, "todo");
    expect((await getTask(db, id))?.completedAt).toBeNull();
    expect((await listStatuses(db)).map((s) => s.id)).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "done",
      "cancelled",
    ]);
  });

  it("repeat: finishing one makes the next, once, and not when cancelled", async () => {
    const space = await createSpace(db, "Work", "blue");
    const id = await createTask(db, space, "Water the plants", "2026-10-14");
    await setTaskDates(db, id, "2026-10-12", "2026-10-14");
    await setTaskRepeat(db, id, { every: 1, unit: "week" });
    await setTaskStatus(db, id, "done");
    await setTaskStatus(db, id, "done");
    const tasks = await listTasks(db, space);
    expect(tasks).toHaveLength(2);
    const next = tasks.find((t) => t.entity.id !== id);
    expect([next?.startDate, next?.dueDate, next?.statusId, next?.repeat]).toEqual([
      "2026-10-19",
      "2026-10-21",
      "backlog",
      { every: 1, unit: "week" },
    ]);

    const other = await createTask(db, space, "Skip me", "2026-10-14");
    await setTaskRepeat(db, other, { every: 1, unit: "day" });
    await setTaskStatus(db, other, "cancelled");
    expect(await listTasks(db, space)).toHaveLength(3);
  });

  it("moves a month on to the end of a shorter month", () => {
    const step = (from: string, unit: "day" | "week" | "month", every = 1) =>
      nextAfter({ every, unit }, new Date(`${from}T00:00:00Z`))
        .toISOString()
        .slice(0, 10);
    expect(step("2026-01-31", "month")).toBe("2026-02-28");
    expect(step("2026-10-14", "month", 3)).toBe("2027-01-14");
    expect(step("2026-12-30", "day", 5)).toBe("2027-01-04");
  });
});

describe("pages", () => {
  it("start with one empty paragraph and keep their blocks in order", async () => {
    const space = await createSpace(db, "Study", "purple");
    const page = await createPage(db, space, "note", "Physics");
    const [first] = await listBlocks(db, page);
    await updateBlock(db, first.id, "Waves");
    await addBlock(db, page, "paragraph", "Third");
    await addBlock(db, page, "heading2", "Second", first.position);
    expect((await listBlocks(db, page)).map((b) => [b.blockType, b.content])).toEqual([
      ["paragraph", "Waves"],
      ["heading2", "Second"],
      ["paragraph", "Third"],
    ]);
    await deleteBlock(db, first.id);
    expect(await pagePreview(db, page)).toBe("Second");
  });
});

describe("calendar", () => {
  it("lists Calendar entries and Sessions by day", async () => {
    const space = await createSpace(db, "Study", "purple");
    const lunch = await createCalendarEntry(db, space, {
      title: "Lunch",
      date: "2026-10-15",
      startTime: "12:00",
      endTime: "13:00",
      allDay: false,
      location: null,
    });
    await createCalendarEntry(db, space, {
      title: "Holiday",
      date: "2026-10-16",
      startTime: "09:00",
      endTime: null,
      allDay: true,
      location: "Rome",
    });
    await updateCalendarEntry(db, lunch, {
      title: "Long lunch",
      date: "2026-10-15",
      startTime: "12:00",
      endTime: "14:00",
      allDay: false,
      location: "Cafe",
    });
    const items = await agenda(db, "2026-10-14", "2026-10-20");
    expect(
      items.map((i) => [i.title, i.date, i.startTime, i.endTime, i.allDay, i.location]),
    ).toEqual([
      ["Long lunch", "2026-10-15", "12:00", "14:00", false, "Cafe"],
      ["Holiday", "2026-10-16", null, null, true, "Rome"],
    ]);
    expect(await spaceModules(db, space)).toEqual(["calendar"]);
  });
});

describe("bookmarks", () => {
  it("are titled from their address until named", async () => {
    const space = await createSpace(db, "Reading", "yellow");
    const id = await createBookmark(db, space, "https://example.com/article/");
    await updateBookmark(db, id, "https://example.com/article/", "Long read");
    expect((await listBookmarks(db, space)).map((b) => [b.entity.title, b.description])).toEqual([
      ["example.com/article", "Long read"],
    ]);
    expect(titleFromUrl("http://a.b")).toBe("a.b");
  });
});

describe("rows written here sync like the desktop's", () => {
  it("brings a task made on the phone to another device whole", async () => {
    const server = new MemoryServer();
    const phone = new SyncEngine({ driver });
    await phone.enable();
    const space = await createSpace(db, "Work", "blue");
    const id = await createTask(db, space, "From the phone", "2026-10-20");
    const planned = await phone.collect();
    await phone.acknowledge(
      planned,
      server.push({ changes: planned.map((p) => p.change) }).results,
    );

    const desktop = new NodeSqliteDriver();
    const engine = new SyncEngine({ driver: desktop });
    await engine.enable();
    await engine.apply(server.pull({ cursors: {} }).datasets);
    expect(
      desktop.rows(
        "SELECT e.title, e.key_prefix, e.key_number, t.status_id, t.due_date FROM entities e JOIN tasks t ON t.entity_id = e.id WHERE e.id = ?",
        id,
      ),
    ).toEqual([
      {
        title: "From the phone",
        key_prefix: "TSK",
        key_number: 1,
        status_id: "backlog",
        due_date: "2026-10-20",
      },
    ]);
    expect(desktop.rows("SELECT module_key FROM space_modules")).toEqual([{ module_key: "tasks" }]);
  });
});
