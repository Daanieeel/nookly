import * as Y from "yjs";
import { beforeEach, describe, expect, it } from "vitest";
import { PAGE_FRAGMENT } from "../blocks/index.ts";
import type { LocalDb } from "./db.ts";
import { createSpace } from "./entities.ts";
import { addBlock, createPage, deleteBlock, listBlocks, updateBlock } from "./notes.ts";
import { openRowsPage, saveRowsPage, takeRowChanges } from "./page-rows.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
let page: string;
beforeEach(async () => {
  db = testDb();
  const space = await createSpace(db, "S", "#000000");
  page = await createPage(db, space, "note", "Trip");
  // A new page starts with an empty paragraph; these tests write their own blocks.
  for (const block of await listBlocks(db, page)) await deleteBlock(db, block.id);
});

/// Types `text` at the start of the `index`th block of the document, as the editor does.
function typeInto(doc: Y.Doc, index: number, text: string) {
  const block = doc.getXmlFragment(PAGE_FRAGMENT).get(index);
  const run = block instanceof Y.XmlElement ? block.get(0) : null;
  if (!(run instanceof Y.XmlText)) throw new Error("no text");
  run.insert(0, text);
}

const contents = async () => (await listBlocks(db, page)).map((b) => b.content);

describe("a page edited on its rows with the page editor", () => {
  it("writes only the block that was edited", async () => {
    await addBlock(db, page, "paragraph", "Pack the tent");
    await addBlock(db, page, "paragraph", "Book the train");
    const { doc, snapshot } = await openRowsPage(db, page);
    typeInto(doc, 0, "Now: ");
    await saveRowsPage(db, page, doc, snapshot);
    expect(await contents()).toEqual(["Now: Pack the tent", "Book the train"]);
  });

  it("never writes an old text over a block another device changed meanwhile", async () => {
    const first = await addBlock(db, page, "paragraph", "Pack the tent");
    const second = await addBlock(db, page, "paragraph", "Book the train");
    const { doc, snapshot } = await openRowsPage(db, page);
    // Sync brings another device's edit of the second block while the editor is open.
    await updateBlock(db, second, "Book the night train");
    typeInto(doc, 0, "Now: ");
    await saveRowsPage(db, page, doc, snapshot);
    expect(await contents()).toEqual(["Now: Pack the tent", "Book the night train"]);
    expect((await listBlocks(db, page)).map((b) => b.id)).toEqual([first, second]);
  });

  it("brings another device's edit into the open editor when this one did not touch it", async () => {
    await addBlock(db, page, "paragraph", "Pack the tent");
    const second = await addBlock(db, page, "paragraph", "Book the train");
    const { doc, snapshot } = await openRowsPage(db, page);
    await updateBlock(db, second, "Book the night train");
    const taken = await takeRowChanges(db, page, doc, snapshot);
    typeInto(doc, 0, "Now: ");
    await saveRowsPage(db, page, doc, taken);
    expect(await contents()).toEqual(["Now: Pack the tent", "Book the night train"]);
  });

  it("adds a new block and removes a deleted one", async () => {
    await addBlock(db, page, "paragraph", "Pack the tent");
    const { doc, snapshot } = await openRowsPage(db, page);
    const fragment = doc.getXmlFragment(PAGE_FRAGMENT);
    const added = new Y.XmlElement("paragraph");
    added.setAttribute("blockId", "new-block");
    added.insert(0, [new Y.XmlText("Buy gas")]);
    doc.transact(() => {
      fragment.delete(0, 1);
      fragment.insert(0, [added]);
    });
    await saveRowsPage(db, page, doc, snapshot);
    expect(await contents()).toEqual(["Buy gas"]);
  });

  it("leaves an empty page's document empty, for the editor to start", async () => {
    const { doc, snapshot } = await openRowsPage(db, page);
    expect(doc.getXmlFragment(PAGE_FRAGMENT).length).toBe(0);
    expect(snapshot.size).toBe(0);
  });
});
