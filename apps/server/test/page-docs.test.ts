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
    const check = docsFor(device(desktop.api), owner);
    const seen = await check.open("p1");
    expect(pageBlocks(seen?.doc ?? new Y.Doc()).map((b) => b.content)).toEqual([
      "Pack the tent",
      "Offline: Book the train",
    ]);
  });

  it("stay on rows when the page has no copy here and the server can't be reached", async () => {
    const { desktop, owner } = await setup();
    const offline = docsFor(desktop, owner, "http://127.0.0.1:9");
    expect(await offline.open("p1", 200)).toBeNull();
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
