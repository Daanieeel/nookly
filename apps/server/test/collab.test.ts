import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { PAGE_FRAGMENT, pageBlocks } from "@nookly/shared/blocks";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as Y from "yjs";
import {
  HOOK_TIMEOUT,
  PHONE,
  type TestServer,
  addPage,
  device,
  startServer,
  syncOnce,
  until,
  verifiedAccount,
} from "./helpers.ts";

let server: TestServer;
const providers: HocuspocusProvider[] = [];
const sockets: HocuspocusProviderWebsocket[] = [];
beforeEach(async () => {
  server = await startServer({ COLLAB_DEBOUNCE_MS: "50" });
}, HOOK_TIMEOUT);
afterEach(async () => {
  for (const p of providers.splice(0)) p.destroy();
  for (const s of sockets.splice(0)) s.destroy();
  await server.stop();
}, HOOK_TIMEOUT);

interface Opened {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  failed: () => string | null;
}

/// Opens a page's document over the collab socket, like an editor does.
async function open(token: string, owner: string, entityId: string, wait = true): Promise<Opened> {
  const doc = new Y.Doc();
  let failure: string | null = null;
  const socket = new HocuspocusProviderWebsocket({
    url: `${server.baseUrl.replace("http", "ws")}/v1/collab`,
  });
  sockets.push(socket);
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: `${owner}:${entityId}`,
    document: doc,
    token,
    onAuthenticationFailed: ({ reason }) => {
      failure = reason;
    },
  });
  provider.attach();
  providers.push(provider);
  if (wait) await until(() => provider.isSynced || failure !== null, "the document to sync");
  return { doc, provider, failed: () => failure };
}

const text = (doc: Y.Doc) => pageBlocks(doc).map((b) => b.content);

/// The text of the `index`th block (a paragraph), to type into like an editor would.
function blockText(doc: Y.Doc, index: number): Y.XmlText {
  const block = doc.getXmlFragment(PAGE_FRAGMENT).get(index);
  const text = block instanceof Y.XmlElement ? block.get(0) : null;
  if (!(text instanceof Y.XmlText)) throw new Error(`block ${index} has no text`);
  return text;
}

/// Ada's desktop with a synced page of two blocks, and her phone signed in.
async function setup() {
  const ada = await verifiedAccount(server, "ada@example.com");
  const desktop = device(ada.api);
  await desktop.engine.enable();
  addPage(desktop, "p1", "Trip", ["Pack the tent", "Book the train"]);
  await syncOnce(desktop);
  const phoneApi = server.client();
  await phoneApi.signIn("ada", "correct horse battery", PHONE);
  const token = (await ada.api.sessionToken()) ?? "";
  const phoneToken = (await phoneApi.sessionToken()) ?? "";
  return { ada, desktop, token, phoneToken, owner: ada.user.id };
}

async function storedBlocks(owner: string, entity: string) {
  const rows = await server.sql`
    SELECT pk, fields->>'content' AS content, (fields->>'position')::int AS position, deleted_clock
    FROM records WHERE owner_id = ${owner} AND tbl = 'blocks' AND scope = ${entity}
    ORDER BY position, pk`;
  return rows.filter((r) => r.deleted_clock === null).map((r) => r.content);
}

describe("page documents", () => {
  it("start from the page's rows the first time anyone opens the page", async () => {
    const { token, owner } = await setup();
    const { doc } = await open(token, owner, "p1");
    expect(text(doc)).toEqual(["Pack the tent", "Book the train"]);
    expect(pageBlocks(doc).map((b) => b.blockId)).toEqual(["p1-b0", "p1-b1"]);
  });

  it("merge two devices typing at once, and write the result back as rows", async () => {
    const { token, phoneToken, owner, desktop } = await setup();
    const left = await open(token, owner, "p1");
    const right = await open(phoneToken, owner, "p1");
    const first = (doc: Y.Doc) => blockText(doc, 0);
    // Both type into the first block without seeing the other.
    left.doc.transact(() => first(left.doc).insert(0, "Now: "));
    right.doc.transact(() => first(right.doc).insert(13, " and stove"));
    await until(
      () => text(left.doc)[0] === text(right.doc)[0] && text(left.doc)[0].includes("stove"),
      "both to converge",
    );
    expect(text(left.doc)[0]).toBe("Now: Pack the tent and stove");
    await until(
      async () => (await storedBlocks(owner, "p1"))[0] === "Now: Pack the tent and stove",
      "the rows to follow",
    );
    // Other devices get the merged text as ordinary rows.
    await syncOnce(desktop);
    expect(desktop.driver.rows("SELECT content FROM blocks WHERE id = 'p1-b0'")).toEqual([
      { content: "Now: Pack the tent and stove" },
    ]);
  });

  it("keep edits made offline and merge them on reconnect", async () => {
    const { token, phoneToken, owner } = await setup();
    const left = await open(token, owner, "p1");
    const right = await open(phoneToken, owner, "p1");
    right.provider.disconnect();
    const block = (doc: Y.Doc, i: number) => blockText(doc, i);
    block(right.doc, 1).insert(0, "Offline: ");
    block(left.doc, 1).insert(14, " today");
    await Bun.sleep(100);
    await right.provider.connect();
    await until(
      () => text(right.doc)[1] === text(left.doc)[1] && text(left.doc)[1].startsWith("Offline"),
      "the offline edit to arrive",
    );
    expect(text(left.doc)[1]).toBe("Offline: Book the train today");
  });

  it("are kept on the server and come back after everyone left", async () => {
    const { token, owner } = await setup();
    const first = await open(token, owner, "p1");
    blockText(first.doc, 0).insert(0, "Kept: ");
    await until(async () => (await storedBlocks(owner, "p1"))[0]?.startsWith("Kept"), "a store");
    first.provider.destroy();
    await server.collab?.flush();
    const again = await open(token, owner, "p1");
    expect(text(again.doc)[0]).toBe("Kept: Pack the tent");
  });

  it("take in a row changed outside an editor", async () => {
    const { token, owner, desktop } = await setup();
    const { doc } = await open(token, owner, "p1");
    // The CLI on the desktop rewrites the second block while the page is open elsewhere.
    desktop.driver.exec("UPDATE blocks SET content = 'Book the night train' WHERE id = 'p1-b1'");
    await syncOnce(desktop);
    await until(() => text(doc)[1] === "Book the night train", "the change to reach the document");
  });

  it("are closed to anyone the page isn't shared with", async () => {
    const { owner } = await setup();
    const ben = await verifiedAccount(server, "ben@example.com", PHONE);
    const opened = await open((await ben.api.sessionToken()) ?? "", owner, "p1");
    expect(opened.failed()).not.toBeNull();
    expect(text(opened.doc)).toEqual([]);
  });

  it("are read only for someone a page is shared with to view", async () => {
    const { ada, token, owner } = await setup();
    const ben = await verifiedAccount(server, "ben@example.com", PHONE);
    const { share } = await ada.api.share("p1", "ben", "viewer");
    await ben.api.acceptShare(share.id);
    const viewer = await open((await ben.api.sessionToken()) ?? "", owner, "p1");
    expect(text(viewer.doc)).toEqual(["Pack the tent", "Book the train"]);
    blockText(viewer.doc, 0).insert(0, "Hacked ");
    await Bun.sleep(300);
    const owners = await open(token, owner, "p1");
    expect(text(owners.doc)[0]).toBe("Pack the tent");
  });
});
