import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace, trashEntity } from "./entities.ts";
import { attachLabel, createLabel } from "./links.ts";
import { addBlock, createPage, listPageSummaries, refineJot, updateBlock } from "./notes.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
beforeEach(() => {
  db = testDb();
});

describe("the list of a Space's pages", () => {
  it("lists notes newest edit first with a preview, labels and the time of the last edit", async () => {
    const space = await createSpace(db, "Work", "#000000");
    const older = await createPage(db, space, "note", "Older");
    const newer = await createPage(db, space, "note", "Newer");
    const block = await addBlock(db, newer, "paragraph", "");
    await updateBlock(db, block, "First words of the page");
    const label = await createLabel(db, space, "Ideas");
    await attachLabel(db, newer, label);
    const pages = await listPageSummaries(db, { spaceId: space, type: "note" });
    expect(pages.map((p) => p.entity.id)).toEqual([newer, older]);
    expect(pages[0].preview).toContain("First words");
    expect(pages[0].labels.map((l) => l.name)).toEqual(["Ideas"]);
    expect(pages[1].labels).toEqual([]);
  });

  it("leaves out pages in the Trash and pages of other types", async () => {
    const space = await createSpace(db, "Work", "#000000");
    const gone = await createPage(db, space, "note", "Gone");
    await createPage(db, space, "jot", "A jot");
    await trashEntity(db, gone);
    expect(await listPageSummaries(db, { spaceId: space, type: "note" })).toEqual([]);
  });

  it("says which note a jot was refined into", async () => {
    const space = await createSpace(db, "Work", "#000000");
    const waiting = await createPage(db, space, "jot", "Waiting");
    const refined = await createPage(db, space, "jot", "Refined");
    const note = await refineJot(db, refined, "The note");
    const jots = await listPageSummaries(db, { spaceId: space, type: "jot" });
    const byId = new Map(jots.map((j) => [j.entity.id, j]));
    expect(byId.get(waiting)?.refinedInto).toBeNull();
    expect(byId.get(refined)?.refinedInto).toEqual({ id: note, title: "The note" });
  });
});
