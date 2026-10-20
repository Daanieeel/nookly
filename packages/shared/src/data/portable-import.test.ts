import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { first, rows } from "./db.ts";
import type { LocalDb } from "./db.ts";
import { createSpace } from "./entities.ts";
import { addBlock, createPage, listBlocks, updateBlock } from "./notes.ts";
import { exportNooklyFile } from "./portable.ts";
import { importNooklyFile, previewNooklyFile } from "./portable-import.ts";
import { createAssignment, createCourse, getAssignment, updateAssignment } from "./study.ts";
import {
  createSubtask,
  createTask,
  getTask,
  listSubtasks,
  setTaskDates,
  setTaskEffort,
  setTaskRepeat,
  setTaskStatus,
} from "./tasks.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
let space: string;
beforeEach(async () => {
  db = testDb();
  space = await createSpace(db, "S", "#000000");
});

interface BlockInput {
  type: string;
  content: string;
  attrs: { [name: string]: string };
}
interface TaskExtras {
  dueDate?: string;
  effort?: number;
  repeat?: { every: number; unit: string };
  surprise?: number;
  subtasks?: { title: string; status: { name: string; doneness: number } }[];
}

const entities = async () => (await rows(db, "SELECT id FROM entities")).length;

describe("reading a Nookly page", () => {
  it("makes a new page of the blocks in the file, with nothing else", async () => {
    const page = await createPage(db, space, "note", "Week 1");
    await updateBlock(db, (await listBlocks(db, page))[0].id, "Intro");
    await addBlock(db, page, "heading2", "Part one");
    await addBlock(db, page, "code", "fn main() {}");
    await db.driver.batch([
      { sql: "UPDATE blocks SET language = 'rust' WHERE block_type = 'code'", params: [] },
    ]);
    const { text } = await exportNooklyFile(db, page);
    const made = await importNooklyFile(db, space, text);
    expect(made).not.toBe(page);
    const blocks = await listBlocks(db, made);
    expect(blocks.map((b) => [b.blockType, b.content, b.language])).toEqual([
      ["paragraph", "Intro", null],
      ["heading2", "Part one", null],
      ["code", "fn main() {}", "rust"],
    ]);
    expect(
      (await first(db, "SELECT title, type FROM entities WHERE id = ?", made)) ?? null,
    ).toMatchObject({ title: "Week 1", type: "note" });
  });

  it("turns a block this version does not know into a paragraph, so its text survives", async () => {
    const text = JSON.stringify({
      format: "nookly-page",
      version: 1,
      kind: "note",
      title: "Mixed",
      blocks: [
        { type: "paragraph", content: "kept", language: null, filename: null, attrs: {} },
        {
          type: "timeline",
          content: "2026-01-01\tStart",
          language: null,
          filename: null,
          attrs: { title: "T" },
        },
        { type: "from-the-future", content: "text", language: null, filename: null, attrs: {} },
      ],
    });
    const preview = previewNooklyFile(text);
    expect(preview).toMatchObject({ kind: "note", title: "Mixed", count: 3, converted: 1 });
    const made = await importNooklyFile(db, space, text);
    expect((await listBlocks(db, made)).map((b) => [b.blockType, b.content])).toEqual([
      ["paragraph", "kept"],
      ["timeline", "2026-01-01\tStart"],
      ["paragraph", "text"],
    ]);
  });

  it("refuses a file that is not valid, and creates nothing", async () => {
    const before = await entities();
    const bad = (extra: { version?: number; kind?: string; blocks?: BlockInput[] }) =>
      JSON.stringify({
        format: "nookly-page",
        version: 1,
        kind: "note",
        title: "x",
        blocks: [],
        ...extra,
      });
    expect(() => previewNooklyFile("not json")).toThrow("not a Nookly file");
    expect(() => previewNooklyFile(JSON.stringify({ format: "other" }))).toThrow(
      'not a Nookly file (format "other")',
    );
    expect(() => previewNooklyFile(bad({ version: 2 }))).toThrow("version 2");
    expect(() => previewNooklyFile(bad({ kind: "task" }))).toThrow('holds a "task"');
    await expect(
      importNooklyFile(
        db,
        space,
        bad({
          blocks: [{ type: "heading1", content: "x", attrs: { toggle: "sideways" } }],
        }),
      ),
    ).rejects.toThrow("block 1");
    expect(await entities()).toBe(before);
  });
});

describe("reading a Nookly task", () => {
  it("makes a task with its status, dates, effort, repeat, description and sub-tasks", async () => {
    const task = await createTask(db, space, "Write report");
    await setTaskStatus(db, task, "in_progress");
    await setTaskDates(db, task, "2026-10-01", "2026-10-31");
    await setTaskEffort(db, task, 5);
    await setTaskRepeat(db, task, { every: 2, unit: "week" });
    await addBlock(db, task, "paragraph", "Details");
    const sub = await createSubtask(db, task, "Outline");
    await setTaskStatus(db, sub, "done");
    const { text } = await exportNooklyFile(db, task);
    const made = await importNooklyFile(db, space, text);
    const got = await getTask(db, made);
    expect(got).toMatchObject({
      statusId: "in_progress",
      startDate: "2026-10-01",
      dueDate: "2026-10-31",
      effort: 5,
      repeat: { every: 2, unit: "week" },
    });
    expect((await listBlocks(db, made)).map((b) => b.content)).toEqual(["Details"]);
    const subs = await listSubtasks(db, made);
    expect(subs.map((s) => [s.entity.title, s.statusId])).toEqual([["Outline", "done"]]);
    // A finished sub-task arrives finished, with a completion day.
    expect(
      (await rows(db, "SELECT completed_at FROM tasks WHERE entity_id = ?", subs[0].entity.id))[0]
        .completed_at,
    ).not.toBeNull();
    expect(previewNooklyFile(text)).toMatchObject({
      kind: "task",
      count: 1,
      countLabel: "subtask",
    });
  });

  it("finds a status by its name, else by how done it is, else the first", async () => {
    const file = (status: { name: string; doneness: number }) =>
      JSON.stringify({
        format: "nookly-task",
        version: 1,
        kind: "task",
        title: "T",
        status,
        blocks: [],
        subtasks: [],
      });
    const statusOf = async (text: string) =>
      (await getTask(db, await importNooklyFile(db, space, text)))?.statusId;
    expect(await statusOf(file({ name: "  DONE ", doneness: 0 }))).toBe("done");
    expect(await statusOf(file({ name: "Finished", doneness: 100 }))).toBe("done");
    expect(await statusOf(file({ name: "Whatever", doneness: 33 }))).toBe("backlog");
  });

  it("refuses a day that is not one, an effort off the scale, a repeat too long, and any field it does not know", async () => {
    const file = (extra: TaskExtras) =>
      JSON.stringify({
        format: "nookly-task",
        version: 1,
        kind: "task",
        title: "T",
        status: { name: "Todo", doneness: 0 },
        blocks: [],
        subtasks: [],
        ...extra,
      });
    expect(() => previewNooklyFile(file({ dueDate: "31/10/2026" }))).toThrow("dueDate");
    expect(() => previewNooklyFile(file({ effort: 4 }))).toThrow("effort");
    expect(() => previewNooklyFile(file({ repeat: { every: 0, unit: "day" } }))).toThrow("every");
    expect(() => previewNooklyFile(file({ surprise: 1 }))).toThrow("not valid");
    expect(() =>
      previewNooklyFile(
        file({ subtasks: [{ title: "s", status: { name: "Todo", doneness: 200 } }] }),
      ),
    ).toThrow("sub-task 1");
  });
});

describe("reading a Nookly assignment", () => {
  it("files it under the course it is given, with its status, grade and weight", async () => {
    const course = await createCourse(db, space, "Algorithms");
    const other = await createCourse(db, space, "Networks");
    const assignment = await createAssignment(db, space, "Sheet 1", course, "2026-11-05");
    await updateAssignment(db, assignment, { status: "graded", grade: 1.7, weight: 20 });
    await addBlock(db, assignment, "paragraph", "Prove it");
    const { text } = await exportNooklyFile(db, assignment);
    expect(previewNooklyFile(text)).toMatchObject({ kind: "assignment", parentType: "course" });
    await expect(importNooklyFile(db, space, text)).rejects.toThrow("course");
    const made = await importNooklyFile(db, space, text, other);
    expect(await getAssignment(db, made)).toMatchObject({
      status: "graded",
      dueDate: "2026-11-05",
      grade: 1.7,
      weight: 20,
      courseId: other,
    });
    expect((await listBlocks(db, made)).map((b) => b.content)).toEqual(["Prove it"]);
  });
});

describe("reading something that is not a page, task or assignment", () => {
  it("reads a deck file too, so one picker takes them all", async () => {
    const text = JSON.stringify({
      format: "nookly-deck",
      version: 1,
      kind: "deck",
      title: "Sorting",
      cards: [{ front: "a", back: "b" }],
    });
    expect(previewNooklyFile(text)).toMatchObject({ kind: "deck", count: 1, countLabel: "card" });
    expect(await importNooklyFile(db, space, text)).toBeTruthy();
  });
});

/// The files the desktop writes (`db/portable_desktop_samples_tests.rs` keeps them current).
const sample = (name: string) =>
  readFileSync(new URL(`../generated/desktop-samples/${name}.json`, import.meta.url), "utf8");

describe("files written by the desktop", () => {
  it("make the page, task, assignment and deck they describe", async () => {
    const page = await importNooklyFile(db, space, sample("page"));
    expect((await listBlocks(db, page)).map((b) => b.blockType)).toEqual([
      "paragraph",
      "heading1",
      "numbered_list",
      "code",
      "table",
      "timeline",
      "checklist",
      "divider",
    ]);
    const attrs = await rows(
      db,
      "SELECT block_type, attrs, language FROM blocks WHERE entity_id = ?",
      page,
    );
    expect(attrs.find((r) => r.block_type === "heading1")?.attrs).toBe('{"toggle":"closed"}');
    expect(attrs.find((r) => r.block_type === "numbered_list")?.attrs).toBe(
      '{"marker":"a)","start":"2"}',
    );
    expect(attrs.find((r) => r.block_type === "code")?.language).toBe("rust");

    const task = await importNooklyFile(db, space, sample("task"));
    expect(await getTask(db, task)).toMatchObject({
      statusId: "in_progress",
      effort: 5,
      dueDate: "2026-03-10",
      repeat: { every: 2, unit: "week" },
    });
    expect((await listSubtasks(db, task)).map((s) => [s.entity.title, s.statusId])).toEqual([
      ["Outline", "done"],
    ]);

    const course = await createCourse(db, space, "Algorithms");
    const assignment = await importNooklyFile(db, space, sample("assignment"), course);
    expect(await getAssignment(db, assignment)).toMatchObject({
      status: "graded",
      grade: 8.5,
      weight: 0.25,
      dueDate: "2026-03-10",
    });

    expect(await importNooklyFile(db, space, sample("deck"))).toBeTruthy();
  });

  it("are all previewed with what they hold", () => {
    expect(previewNooklyFile(sample("page"))).toMatchObject({
      kind: "note",
      count: 8,
      converted: 0,
    });
    expect(previewNooklyFile(sample("task"))).toMatchObject({ kind: "task", count: 1 });
    expect(previewNooklyFile(sample("assignment"))).toMatchObject({
      kind: "assignment",
      parentType: "course",
    });
  });
});
