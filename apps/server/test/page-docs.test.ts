import { PAGE_FRAGMENT, pageBlocks } from "@nookly/shared/blocks";
import { PageDocs } from "@nookly/shared/sync";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as Y from "yjs";
import {
  HOOK_TIMEOUT,
  type Device,
  type TestServer,
  addPage,
  device,
  startServer,
  syncOnce,
  until,
  verifiedAccount,
} from "./helpers.ts";

let server: TestServer;
const opened: PageDocs[] = [];
beforeEach(async () => {
  server = await startServer({ COLLAB_DEBOUNCE_MS: "50" });
}, HOOK_TIMEOUT);
afterEach(async () => {
  for (const docs of opened.splice(0)) await docs.close(false);
  await server.stop();
}, HOOK_TIMEOUT);

function docsFor(d: Device, owner: string, serverUrl = server.baseUrl) {
  const docs = new PageDocs({
    driver: d.driver,
    serverUrl,
    token: () => d.api.sessionToken(),
    ownerOf: async () => owner,
    saveDelayMs: 20,
  });
  opened.push(docs);
  return docs;
}

function typeInto(doc: Y.Doc, index: number, at: number, text: string) {
  const block = doc.getXmlFragment(PAGE_FRAGMENT).get(index);
  const run = block instanceof Y.XmlElement ? block.get(0) : null;
  if (!(run instanceof Y.XmlText)) throw new Error("no text");
  run.insert(at, text);
}

async function setup() {
  const ada = await verifiedAccount(server, "ada@example.com");
  const desktop = device(ada.api);
  await desktop.engine.enable();
  addPage(desktop, "p1", "Trip", ["Pack the tent", "Book the train"]);
  await syncOnce(desktop);
  return { desktop, owner: ada.user.id };
}

const rows = (d: Device) =>
  d.driver.rows("SELECT id, content FROM blocks WHERE entity_id = 'p1' ORDER BY position");
const dirtyBlocks = (d: Device) =>
  d.driver.rows("SELECT pk FROM sync_dirty WHERE tbl = 'blocks'").map((r) => r.pk);

describe("page documents on a device", () => {
  it("open from the server, keep a copy, and keep the rows current without marking edits", async () => {
    const { desktop, owner } = await setup();
    const docs = docsFor(desktop, owner);
    const session = await docs.open("p1");
    expect(session).not.toBeNull();
    typeInto(session?.doc ?? new Y.Doc(), 0, 0, "Now: ");
    await until(() => rows(desktop)[0]?.content === "Now: Pack the tent", "the rows to follow");
    expect(dirtyBlocks(desktop)).toEqual([]);
    expect(desktop.driver.rows("SELECT COUNT(*) AS n FROM page_docs")[0].n).toBe(1);
  });

  it("open and edit offline from the copy, and send the edits in the background later", async () => {
    const { desktop, owner } = await setup();
    const online = docsFor(desktop, owner);
    await online.open("p1");
    online.release("p1");
    await until(
      () => desktop.driver.rows("SELECT pending FROM page_docs")[0]?.pending === 0,
      "the copy to be confirmed",
    );
    await online.close(false);

    // Nothing listens there: the device is offline.
    const offline = docsFor(desktop, owner, "http://127.0.0.1:9");
    const session = await offline.open("p1", 300);
    expect(session).not.toBeNull();
    typeInto(session?.doc ?? new Y.Doc(), 1, 0, "Offline: ");
    await until(() => rows(desktop)[1]?.content === "Offline: Book the train", "the local rows");
    offline.release("p1");
    await until(
      () => desktop.driver.rows("SELECT pending FROM page_docs")[0]?.pending === 1,
      "the edit to wait",
    );
    await offline.close(false);

    // Back online, nobody opens the page: the edit goes out anyway.
    const back = docsFor(desktop, owner);
    expect(await back.flushPending()).toBe(0);
    // Another device, which has the page from sync, as every device that opens one does.
    const other = device(desktop.api);
    await other.engine.enable();
    await syncOnce(other);
    const check = docsFor(other, owner);
    const seen = await check.open("p1");
    expect(pageBlocks(seen?.doc ?? new Y.Doc()).map((b) => b.content)).toEqual([
      "Pack the tent",
      "Offline: Book the train",
    ]);
  });

  it("keep a page open for the editor when it was opened twice at once and closed once", async () => {
    // Bug: an editor that asked for its page twice in a row (as every page open does while
    // the app starts it twice, and the phone does when the item loads) got two documents;
    // giving the first one back closed the one the editor was using, so nothing typed
    // anywhere showed up any more.
    const { desktop, owner } = await setup();
    const docs = docsFor(desktop, owner);
    const [first, second] = await Promise.all([docs.open("p1"), docs.open("p1")]);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    docs.release("p1");
    await Bun.sleep(200);
    typeInto(second?.doc ?? new Y.Doc(), 0, 0, "Now: ");
    const other = device(desktop.api);
    await other.engine.enable();
    await syncOnce(other);
    const seen = await docsFor(other, owner).open("p1");
    await until(
      () => pageBlocks(seen?.doc ?? new Y.Doc())[0]?.content === "Now: Pack the tent",
      "the typing on another device",
    );
  });

  it("open a page made here and not yet on the server at once, on its rows", async () => {
    // Bug: a new page waited for the server's document for 4 seconds, which the server can
    // not have before the page reaches it, so the editor of every new page stayed blank
    // that long while signed in.
    const { desktop, owner } = await setup();
    addPage(desktop, "p2", "Fresh", []);
    const docs = docsFor(desktop, owner);
    const started = Date.now();
    expect(await docs.open("p2")).toBeNull();
    expect(Date.now() - started).toBeLessThan(300);
  });

  it("stay on rows when the page has no copy here and the server can't be reached", async () => {
    const { desktop, owner } = await setup();
    const offline = docsFor(desktop, owner, "http://127.0.0.1:9");
    expect(await offline.open("p1", 200)).toBeNull();
  });

  /// What `nookly cli note add-block` then `reorder-blocks` write: new rows at the end,
  /// then positions only.
  function addAndReorder(d: Device) {
    const stamp = new Date().toISOString();
    for (const [id, content, position] of [
      ["cli-a", "Charge the lamp", 2],
      ["cli-b", "Buy gas", 3],
    ] as const) {
      d.driver.exec(
        "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES (?, 'p1', ?, 'paragraph', ?, ?, ?)",
        id,
        position,
        content,
        stamp,
        stamp,
      );
    }
  }
  function reorder(d: Device, ids: string[]) {
    ids.forEach((id, position) => {
      d.driver.exec(
        "UPDATE blocks SET position = ? WHERE id = ? AND position <> ?",
        position,
        id,
        position,
      );
    });
  }
  const order = ["cli-b", "p1-b1", "cli-a", "p1-b0"];
  const reordered = ["Buy gas", "Book the train", "Charge the lamp", "Pack the tent"];
  const contents = (doc: Y.Doc) => pageBlocks(doc).map((b) => b.content);

  it("keep an order set outside the editor while the page is open", async () => {
    // Bug: the document ignored a change of position only, and its next save put the old
    // order back over the one the CLI had just set.
    const { desktop, owner } = await setup();
    const docs = docsFor(desktop, owner);
    const session = await docs.open("p1");
    const doc = session?.doc ?? new Y.Doc();
    addAndReorder(desktop);
    await syncOnce(desktop);
    await until(() => contents(doc).length === 4, "the new blocks in the document");
    reorder(desktop, order);
    await syncOnce(desktop);
    await until(() => contents(doc).join() === reordered.join(), "the new order in the document");
    // Typing afterwards saves the document, which must keep the order everywhere.
    typeInto(doc, 0, 0, "Now: ");
    const edited = ["Now: Buy gas", ...reordered.slice(1)];
    await until(() => rows(desktop)[0]?.content === edited[0], "the rows to follow");
    await server.collab.flush();
    await Bun.sleep(150);
    await syncOnce(desktop);
    expect(rows(desktop).map((r) => r.content)).toEqual(edited);
    expect(contents(doc)).toEqual(edited);
  });

  it("keep an order set outside the editor while the page is closed", async () => {
    const { desktop, owner } = await setup();
    const docs = docsFor(desktop, owner);
    await docs.open("p1");
    docs.release("p1");
    await Bun.sleep(300);
    addAndReorder(desktop);
    await syncOnce(desktop);
    reorder(desktop, order);
    await syncOnce(desktop);

    const other = device(desktop.api);
    await other.engine.enable();
    await syncOnce(other);
    const seen = await docsFor(other, owner).open("p1");
    expect(contents(seen?.doc ?? new Y.Doc())).toEqual(reordered);
  });

  /// The app opens a page, which saves its copy here, and quits.
  async function openAndQuit(d: Device, owner: string) {
    const docs = docsFor(d, owner);
    await docs.open("p1");
    docs.release("p1");
    await until(
      () => d.driver.rows("SELECT pending FROM page_docs")[0]?.pending === 0,
      "the copy to be confirmed",
    );
    await docs.close(false);
  }

  it("keep an order set while the app was quit, after the next launch", async () => {
    const { desktop, owner } = await setup();
    await openAndQuit(desktop, owner);
    addAndReorder(desktop);
    reorder(desktop, order);
    const launched = docsFor(desktop, owner);
    const session = await launched.open("p1");
    const doc = session?.doc ?? new Y.Doc();
    await syncOnce(desktop);
    await until(() => contents(doc).join() === reordered.join(), "the new order in the document");
    await Bun.sleep(150);
    await syncOnce(desktop);
    expect(rows(desktop).map((r) => r.content)).toEqual(reordered);
  });

  it("never write an old copy's order over rows, while it has not caught up", async () => {
    // Bug: the copy saved before the app quit wrote all its positions over the rows again.
    const { desktop, owner } = await setup();
    await openAndQuit(desktop, owner);
    addAndReorder(desktop);
    reorder(desktop, order);
    // The rows reach the server, but this page's live connection does not come up.
    await syncOnce(desktop);
    const lagging = docsFor(desktop, owner, "http://127.0.0.1:9");
    const session = await lagging.open("p1", 300);
    typeInto(session?.doc ?? new Y.Doc(), 0, 0, "Now: ");
    await until(
      () => rows(desktop).some((r) => r.content === "Now: Pack the tent"),
      "the typing in the rows",
    );
    expect(rows(desktop).map((r) => r.content)).toEqual([
      "Buy gas",
      "Book the train",
      "Charge the lamp",
      "Now: Pack the tent",
    ]);
  });

  it("never write over a row with an edit of its own not yet sent", async () => {
    const { desktop, owner } = await setup();
    const docs = docsFor(desktop, owner);
    const session = await docs.open("p1");
    // The CLI changes the second block; that edit hasn't been sent yet.
    desktop.driver.exec("UPDATE blocks SET content = 'From the CLI' WHERE id = 'p1-b1'");
    typeInto(session?.doc ?? new Y.Doc(), 0, 0, "Now: ");
    await until(() => rows(desktop)[0]?.content === "Now: Pack the tent", "the rows to follow");
    expect(rows(desktop)[1].content).toBe("From the CLI");
    expect(dirtyBlocks(desktop)).toEqual(["p1-b1"]);
    // Once sent, it reaches the document too.
    await syncOnce(desktop);
    await until(
      () => pageBlocks(session?.doc ?? new Y.Doc())[1]?.content === "From the CLI",
      "the CLI edit in the document",
    );
  });
});
