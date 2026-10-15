import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace } from "./entities.ts";
import { addBlock, createPage, listBlocks, updateBlock } from "./notes.ts";
import { exportNooklyFile, importDeckFile, readDeckFile } from "./portable.ts";
import {
  createAssignment,
  createCard,
  createCourse,
  createDeck,
  listCards,
  updateAssignment,
  reviewCard,
} from "./study.ts";
import {
  createSubtask,
  createTask,
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

const read = async (id: string) => JSON.parse((await exportNooklyFile(db, id)).text);

describe("saving as a Nookly file", () => {
  it("writes a page with its blocks in the order and shape the desktop reads, mentions as text", async () => {
    const page = await createPage(db, space, "note", "Week 1");
    await updateBlock(
      db,
      (await listBlocks(db, page))[0].id,
      "See [Report](mention:11111111-1111-4111-8111-111111111111) now",
    );
    await addBlock(db, page, "code", "fn main() {}");
    await addBlock(db, page, "image", "[Photo](mention:11111111-1111-4111-8111-111111111111)");
    await db.driver.batch([
      {
        sql: "UPDATE blocks SET language = 'rust', filename = 'main.rs' WHERE block_type = 'code'",
        params: [],
      },
    ]);
    const { filename, text } = await exportNooklyFile(db, page);
    expect(filename).toBe("Week 1.nookly.json");
    const file = JSON.parse(text);
    expect(Object.keys(file)).toEqual(["format", "version", "kind", "title", "blocks"]);
    expect(file).toMatchObject({
      format: "nookly-page",
      version: 1,
      kind: "note",
      title: "Week 1",
    });
    expect(Object.keys(file.blocks[0])).toEqual([
      "type",
      "content",
      "language",
      "filename",
      "attrs",
    ]);
    expect(file.blocks.map((b: { type: string; content: string }) => [b.type, b.content])).toEqual([
      ["paragraph", "See Report now"],
      ["code", "fn main() {}"],
      ["paragraph", "Photo"],
    ]);
    expect(file.blocks[1]).toMatchObject({ language: "rust", filename: "main.rs" });
    expect(text).toContain('\n  "blocks": [');
  });

  it("writes a task with its status by name, its repeat and its sub-tasks, leaving out trashed ones", async () => {
    const task = await createTask(db, space, "Write report", "2026-10-30");
    await setTaskStatus(db, task, "in_progress");
    await setTaskEffort(db, task, 5);
    await setTaskDates(db, task, "2026-10-20", "2026-10-30");
    await setTaskRepeat(db, task, { every: 1, unit: "week" });
    const sub = await createSubtask(db, task, "Outline");
    await setTaskStatus(db, sub, "done");
    const gone = await createSubtask(db, task, "Dropped");
    await db.driver.batch([
      {
        sql: "UPDATE entities SET deleted_at = '2026-10-01T00:00:00Z' WHERE id = ?",
        params: [gone],
      },
    ]);
    const file = await read(task);
    expect(Object.keys(file)).toEqual([
      "format",
      "version",
      "kind",
      "title",
      "status",
      "startDate",
      "dueDate",
      "effort",
      "repeat",
      "blocks",
      "subtasks",
    ]);
    expect(file).toMatchObject({
      format: "nookly-task",
      status: { name: "In Progress", doneness: 50 },
      startDate: "2026-10-20",
      dueDate: "2026-10-30",
      effort: 5,
      repeat: { every: 1, unit: "week" },
    });
    expect(file.subtasks).toEqual([
      {
        title: "Outline",
        status: { name: "Done", doneness: 100 },
        startDate: null,
        dueDate: null,
        effort: null,
        blocks: [],
      },
    ]);
    await expect(exportNooklyFile(db, sub)).rejects.toThrow("can't be saved");
  });

  it("writes an assignment with its course's name, and a deck with its cards only", async () => {
    const course = await createCourse(db, space, "Algorithms");
    const sheet = await createAssignment(db, space, "Sheet 3", course, "2026-11-02");
    await updateAssignment(db, sheet, { status: "graded", grade: 1.3, weight: 0.2 });
    expect(await read(sheet)).toEqual({
      format: "nookly-assignment",
      version: 1,
      kind: "assignment",
      title: "Sheet 3",
      course: "Algorithms",
      status: "graded",
      dueDate: "2026-11-02",
      grade: 1.3,
      weight: 0.2,
      blocks: [],
    });
    const deck = await createDeck(db, space, "Sorting");
    const card = await createCard(db, deck, "Quicksort average?", "n log n");
    await createCard(db, deck, "Merge sort stable?", "Yes");
    await reviewCard(db, card, "good");
    expect(await read(deck)).toEqual({
      format: "nookly-deck",
      version: 1,
      kind: "deck",
      title: "Sorting",
      cards: [
        { front: "Quicksort average?", back: "n log n" },
        { front: "Merge sort stable?", back: "Yes" },
      ],
    });
  });

  it("refuses an item that can't be a file, and a missing one", async () => {
    const course = await createCourse(db, space, "Algorithms");
    await expect(exportNooklyFile(db, course)).rejects.toThrow("can't be saved");
    await expect(exportNooklyFile(db, "missing")).rejects.toThrow("isn't here");
  });
});

describe("opening a Nookly deck file", () => {
  it("makes a new deck with new cards from what was saved", async () => {
    const deck = await createDeck(db, space, "Sorting");
    await createCard(db, deck, "Quicksort average?", "n log n");
    const { text } = await exportNooklyFile(db, deck);
    const copy = await importDeckFile(db, space, text);
    expect(copy).not.toBe(deck);
    expect((await listCards(db, copy)).map((c) => [c.front, c.back, c.state])).toEqual([
      ["Quicksort average?", "n log n", "new"],
    ]);
  });

  it("says what is wrong with a file instead of importing part of it", () => {
    const deck = (
      extra: Record<string, number> = {},
      cards: object[] = [{ front: "a", back: "b" }],
    ) =>
      JSON.stringify({
        format: "nookly-deck",
        version: 1,
        kind: "deck",
        title: "T",
        cards,
        ...extra,
      });
    expect(() => readDeckFile("nope")).toThrow("not a Nookly file");
    expect(() => readDeckFile(JSON.stringify({ format: "nookly-page", version: 1 }))).toThrow(
      'not a Nookly deck file (format "nookly-page")',
    );
    expect(() => readDeckFile(JSON.stringify({ format: "nookly-deck", version: 2 }))).toThrow(
      "version 2",
    );
    expect(() => readDeckFile(deck({ extra: 1 }))).toThrow("not valid");
    expect(() => readDeckFile(deck({}, [{ front: "a", back: "b", hint: "c" }]))).toThrow(
      "not valid",
    );
    expect(() =>
      readDeckFile(
        deck({}, [
          { front: "a", back: "b" },
          { front: " ", back: "" },
        ]),
      ),
    ).toThrow("Card 2 is empty");
    expect(readDeckFile(deck()).cards).toHaveLength(1);
  });
});

/// The files the phone writes, kept as samples the desktop's own tests import
/// (`db/portable_phone_tests.rs`), so a change to either side that breaks the other fails
/// where it is made. To rewrite them after an intended change:
///
///     bun run --cwd packages/shared test -u src/data/portable.test.ts
describe("what the desktop reads", () => {
  const SAMPLES = "../generated/portable-samples";

  it("page sample", async () => {
    const page = await createPage(db, space, "note", "Week 1");
    await updateBlock(db, (await listBlocks(db, page))[0].id, "Hello **world**");
    await addBlock(db, page, "heading2", "Next");
    await addBlock(db, page, "code", "fn main() {}");
    await db.driver.batch([
      {
        sql: "UPDATE blocks SET language = 'rust', filename = 'main.rs' WHERE block_type = 'code'",
        params: [],
      },
    ]);
    await expect((await exportNooklyFile(db, page)).text).toMatchFileSnapshot(
      `${SAMPLES}/page.json`,
    );
  });

  it("task sample", async () => {
    const task = await createTask(db, space, "Write report");
    await setTaskStatus(db, task, "in_progress");
    await setTaskEffort(db, task, 5);
    await setTaskDates(db, task, "2026-10-20", "2026-10-30");
    await setTaskRepeat(db, task, { every: 1, unit: "week" });
    const sub = await createSubtask(db, task, "Outline");
    await setTaskStatus(db, sub, "done");
    await expect((await exportNooklyFile(db, task)).text).toMatchFileSnapshot(
      `${SAMPLES}/task.json`,
    );
  });

  it("deck sample", async () => {
    const deck = await createDeck(db, space, "Sorting");
    await createCard(db, deck, "Quicksort average?", "n log n");
    await createCard(db, deck, "Merge sort stable?", "Yes");
    await expect((await exportNooklyFile(db, deck)).text).toMatchFileSnapshot(
      `${SAMPLES}/deck.json`,
    );
  });

  it("assignment sample", async () => {
    const course = await createCourse(db, space, "Algorithms");
    const sheet = await createAssignment(db, space, "Sheet 3", course, "2026-11-02");
    await updateAssignment(db, sheet, { status: "graded", grade: 1.3, weight: 0.2 });
    await expect((await exportNooklyFile(db, sheet)).text).toMatchFileSnapshot(
      `${SAMPLES}/assignment.json`,
    );
  });
});
