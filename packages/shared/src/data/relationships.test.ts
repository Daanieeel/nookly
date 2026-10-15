import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace } from "./entities.ts";
import { addBlock, createPage, listBlocks, updateBlock } from "./notes.ts";
import { createRelationship, linkedItems, mentionedIn, mentionsOf } from "./relationships.ts";
import { unrelate } from "./links.ts";
import { createCourse } from "./study.ts";
import { createSubtask, createTask } from "./tasks.ts";
import { testDb } from "./test-db.ts";
import { trashEntity } from "./entities.ts";

let db: LocalDb;
let space: string;
beforeEach(async () => {
  db = testDb();
  space = await createSpace(db, "S", "#000000");
});

describe("relationships", () => {
  it("links two items by hand, read as each end sees it, and once only", async () => {
    const a = await createTask(db, space, "Write");
    const b = await createTask(db, space, "Review");
    await createRelationship(db, a, b, "blocks");
    await createRelationship(db, a, b, "blocks");
    expect((await linkedItems(db, a)).map((l) => [l.label, l.entity.title, l.outgoing])).toEqual([
      ["Blocks", "Review", true],
    ]);
    expect((await linkedItems(db, b)).map((l) => [l.label, l.entity.title, l.outgoing])).toEqual([
      ["blocked by", "Write", false],
    ]);
    // A plain link is the same either way round.
    await createRelationship(db, a, b, "relates-to");
    await createRelationship(db, b, a, "relates-to");
    expect((await linkedItems(db, a)).filter((l) => l.type.name === "relates-to")).toHaveLength(1);
  });

  it("refuses itself, a type that isn't made by hand, and a course link between other things", async () => {
    const a = await createTask(db, space, "A");
    const b = await createTask(db, space, "B");
    await expect(createRelationship(db, a, a, "relates-to")).rejects.toThrow("itself");
    await expect(createRelationship(db, a, b, "sub-task-of")).rejects.toThrow("by hand");
    await expect(createRelationship(db, a, b, "sequel-of")).rejects.toThrow("course");
    const one = await createCourse(db, space, "Algorithms 1");
    const two = await createCourse(db, space, "Algorithms 2");
    await createRelationship(db, two, one, "sequel-of");
    expect((await linkedItems(db, one))[0]).toMatchObject({ label: "prequel of" });
    await expect(createRelationship(db, a, "missing", "relates-to")).rejects.toThrow("isn't here");
  });

  it("lists structural links too, unlinks, and leaves out trashed items", async () => {
    const parent = await createTask(db, space, "Parent");
    const sub = await createSubtask(db, parent, "Sub");
    const other = await createTask(db, space, "Other");
    await createRelationship(db, parent, other, "relates-to");
    const links = await linkedItems(db, parent);
    expect(links.map((l) => l.type.name)).toEqual(["relates-to", "sub-task-of"]);
    expect(links.find((l) => l.type.name === "sub-task-of")).toMatchObject({
      label: "has sub-task",
      entity: { id: sub },
    });
    await unrelate(db, links[0].relationshipId);
    await trashEntity(db, sub);
    expect(await linkedItems(db, parent)).toEqual([]);
  });
});

describe("mentions", () => {
  it("finds what a page mentions and which pages mention an item", async () => {
    const task = await createTask(db, space, "Report");
    const other = await createTask(db, space, "Other");
    const page = await createPage(db, space, "note", "Notes");
    const second = await createPage(db, space, "note", "Plan");
    const first = (await listBlocks(db, page))[0];
    await updateBlock(
      db,
      first.id,
      `See [Report](mention:${task}) and [Other](mention:${other}#p3), then [Report](mention:${task}) again.`,
    );
    await addBlock(db, second, "paragraph", `Also [Report](mention:${task}).`);
    expect((await mentionsOf(db, page)).map((e) => e.title)).toEqual(["Report", "Other"]);
    expect((await mentionedIn(db, task)).map((e) => e.title)).toEqual(["Notes", "Plan"]);
    expect((await mentionedIn(db, other)).map((e) => e.title)).toEqual(["Notes"]);
    await trashEntity(db, other);
    expect((await mentionsOf(db, page)).map((e) => e.title)).toEqual(["Report"]);
    expect(await mentionsOf(db, task)).toEqual([]);
  });
});
