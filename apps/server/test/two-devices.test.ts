import { ApiClient, type FetchLike } from "@nookly/shared/api";
import { PAGE_FRAGMENT, pageBlocks } from "@nookly/shared/blocks";
import { NetworkError, type PageSession, SyncRuntime } from "@nookly/shared/sync";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as Y from "yjs";
import { BunSqliteDriver } from "./bun-driver.ts";
import {
  DESKTOP,
  HOOK_TIMEOUT,
  MemoryTokens,
  PASSWORD,
  PHONE,
  type TestServer,
  startServer,
  until,
} from "./helpers.ts";

/// Two devices as the apps run them: each its own database, the shared `SyncRuntime` (sign
/// in, the live socket, retries, page documents) and the shared API client, against the real
/// server over HTTP and WebSocket. Nothing here calls a sync round by hand: what arrives,
/// arrives the way it does in the apps. This is the test that keeps sync honest (the
/// simulator scripts are not in CI).

let server: TestServer;
const devices: AppDevice[] = [];
beforeEach(async () => {
  server = await startServer({ COLLAB_DEBOUNCE_MS: "50" });
}, HOOK_TIMEOUT);
afterEach(async () => {
  for (const d of devices.splice(0)) d.sync.stop();
  await server.stop();
}, HOOK_TIMEOUT);

/// A device's network, which the test can unplug: requests fail like an offline fetch and
/// open sockets drop.
class Network {
  online = true;
  private readonly sockets = new Set<WebSocket>();

  fetch: FetchLike = async (url, init) => {
    if (!this.online) throw new NetworkError("offline");
    return fetch(url, init);
  };

  webSocket = (url: string): WebSocket => {
    const socket = new WebSocket(this.online ? url : "ws://127.0.0.1:1/offline");
    this.sockets.add(socket);
    socket.addEventListener("close", () => this.sockets.delete(socket));
    return socket;
  };

  unplug() {
    this.online = false;
    for (const socket of this.sockets) socket.close();
  }

  plugIn() {
    this.online = true;
  }
}

interface AppDevice {
  driver: BunSqliteDriver;
  sync: SyncRuntime<ApiClient>;
  network: Network;
  tokens: MemoryTokens;
}

function makeDevice(info: typeof DESKTOP): AppDevice {
  const network = new Network();
  const driver = new BunSqliteDriver();
  const tokens = new MemoryTokens();
  const sync = new SyncRuntime({
    driver,
    device: info,
    onApplied: () => {},
    connect: (baseUrl, onSignedOut) =>
      new ApiClient({
        baseUrl,
        tokens,
        fetch: network.fetch,
        webSocket: network.webSocket,
        onSignedOut,
      }),
  });
  const device = { driver, sync, network, tokens };
  devices.push(device);
  return device;
}

const now = () => new Date().toISOString();

function addTask(d: AppDevice, id: string, title: string) {
  d.driver.exec(
    "INSERT OR IGNORE INTO spaces (id, name, color, created_at, updated_at) VALUES ('space-1', 'Personal', 'blue', ?, ?)",
    now(),
    now(),
  );
  d.driver.exec(
    "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 'space-1', 'task', ?, ?, ?, 'TSK', 1)",
    id,
    title,
    now(),
    now(),
  );
  d.driver.exec("INSERT INTO tasks (entity_id, status_id) VALUES (?, 'todo')", id);
}

const title = (d: AppDevice, id: string) =>
  d.driver.rows("SELECT title FROM entities WHERE id = ?", id)[0]?.title ?? null;
const dueDate = (d: AppDevice, id: string) =>
  d.driver.rows("SELECT due_date FROM tasks WHERE entity_id = ?", id)[0]?.due_date ?? null;

/// A local edit, as the apps make one: written, then sync told.
function edit(d: AppDevice, sql: string, ...params: (string | null)[]) {
  d.driver.exec(sql, ...params);
  d.sync.notifyLocalChange();
}

/// Waits for something to show on a device within about a second, as a person sees it.
const soon = (check: () => boolean, what: string) => until(check, what, 1_500);

/// A desktop with an account and a phone signed in to it, both settled.
async function pair() {
  const desktop = makeDevice(DESKTOP);
  const phone = makeDevice(PHONE);
  await desktop.sync.signUp(server.baseUrl, { username: "ada", password: PASSWORD });
  await phone.sync.signIn(server.baseUrl, "ada", PASSWORD);
  await desktop.sync.settled();
  await phone.sync.settled();
  return { desktop, phone };
}

describe("two devices on one account", () => {
  it("shows an edit on the other device within about a second, both ways", async () => {
    const { desktop, phone } = await pair();
    addTask(desktop, "t1", "Buy milk");
    desktop.sync.notifyLocalChange();
    await soon(() => title(phone, "t1") === "Buy milk", "the new task on the phone");
    edit(phone, "UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    await soon(() => title(desktop, "t1") === "Buy oat milk", "the phone's edit on the desktop");
    edit(desktop, "UPDATE entities SET deleted_at = ? WHERE id = 't1'", now());
    await soon(
      () =>
        phone.driver.rows("SELECT deleted_at FROM entities WHERE id = 't1'")[0]?.deleted_at !==
        null,
      "the trashed task on the phone",
    );
  });

  it("merges edits of different fields made at the same moment", async () => {
    const { desktop, phone } = await pair();
    addTask(desktop, "t1", "Buy milk");
    desktop.sync.notifyLocalChange();
    await soon(() => title(phone, "t1") === "Buy milk", "the task on the phone");
    edit(desktop, "UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    edit(phone, "UPDATE tasks SET due_date = '2026-12-01' WHERE entity_id = 't1'");
    for (const d of [desktop, phone]) {
      await soon(
        () => title(d, "t1") === "Buy oat milk" && dueDate(d, "t1") === "2026-12-01",
        "both edits on every device",
      );
    }
    expect(desktop.sync.store.getState().status.conflicts).toBe(0);
    expect(phone.sync.store.getState().status.conflicts).toBe(0);
  });

  it("keeps both versions when the same field changed at the same moment, and offers them", async () => {
    const { desktop, phone } = await pair();
    addTask(desktop, "t1", "Buy milk");
    desktop.sync.notifyLocalChange();
    await soon(() => title(phone, "t1") === "Buy milk", "the task on the phone");
    edit(desktop, "UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    edit(phone, "UPDATE entities SET title = 'Buy milk and bread' WHERE id = 't1'");
    await soon(() => title(desktop, "t1") === title(phone, "t1"), "one title on both");
    // Whichever way the race went, the version that lost is kept and offered: on every
    // device when the server saw both edits, on the device that pulled the other edit
    // before sending its own otherwise (DECISIONS.md D40).
    const offered = () =>
      [desktop, phone].filter((d) => d.sync.store.getState().status.conflicts === 1);
    await soon(() => offered().length > 0, "a change needs a look");
    for (const d of offered()) {
      const [view] = await d.sync.conflictViews();
      expect([view.current, view.other].sort()).toEqual(["Buy milk and bread", "Buy oat milk"]);
    }
  });

  it("brings an offline device's edits in on reconnect, and offers the clash", async () => {
    const { desktop, phone } = await pair();
    addTask(desktop, "t1", "Buy milk");
    addTask(desktop, "t2", "Call Ana");
    desktop.driver.exec("UPDATE entities SET key_number = 2 WHERE id = 't2'");
    desktop.sync.notifyLocalChange();
    await soon(() => title(phone, "t2") === "Call Ana", "the tasks on the phone");
    phone.network.unplug();
    edit(phone, "UPDATE entities SET title = 'Call Ana at noon' WHERE id = 't2'");
    edit(phone, "UPDATE entities SET title = 'Buy milk (phone)' WHERE id = 't1'");
    await Bun.sleep(150);
    edit(desktop, "UPDATE entities SET title = 'Buy milk (desktop)' WHERE id = 't1'");
    await Bun.sleep(300);
    expect(title(desktop, "t2")).toBe("Call Ana");
    phone.network.plugIn();
    await until(
      () => title(desktop, "t2") === "Call Ana at noon",
      "the phone's offline edit on the desktop after it reconnected",
      15_000,
    );
    await soon(() => title(desktop, "t1") === title(phone, "t1"), "one title on both");
    await soon(
      () => phone.sync.store.getState().status.conflicts === 1,
      "the phone offers the clash",
    );
    const [view] = await phone.sync.conflictViews();
    expect([view.current, view.other].sort()).toEqual(["Buy milk (desktop)", "Buy milk (phone)"]);
  });

  it("signs a device out at once when another device ends its session", async () => {
    const { desktop, phone } = await pair();
    addTask(desktop, "t1", "Buy milk");
    desktop.sync.notifyLocalChange();
    await soon(() => title(phone, "t1") === "Buy milk", "the task on the phone");
    expect(phone.sync.store.getState().user?.username).toBe("ada");
    const api = desktop.sync.account();
    if (!api) throw new Error("the desktop has no account");
    const sessions = await api.sessions();
    const phoneSession = sessions.find((s) => !s.current);
    if (!phoneSession) throw new Error("no session for the phone");
    await api.revokeSession(phoneSession.id);
    await soon(() => phone.sync.store.getState().user === null, "the phone signed out");
    // Signing out never removes what is on the device.
    expect(title(phone, "t1")).toBe("Buy milk");
  });
});

function addNote(d: AppDevice, id: string, blocks: string[]) {
  d.driver.exec(
    "INSERT OR IGNORE INTO spaces (id, name, color, created_at, updated_at) VALUES ('space-1', 'Personal', 'blue', ?, ?)",
    now(),
    now(),
  );
  d.driver.exec(
    "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES (?, 'space-1', 'note', 'Trip', ?, ?, 'NOT', 1)",
    id,
    now(),
    now(),
  );
  blocks.forEach((content, i) => {
    d.driver.exec(
      "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES (?, ?, ?, 'paragraph', ?, ?, ?)",
      `${id}-b${i}`,
      id,
      i,
      content,
      now(),
      now(),
    );
  });
}

/// The page open in a device's editor, as the apps open one.
async function openPage(d: AppDevice, id: string): Promise<PageSession> {
  const session = await d.sync.pages()?.open(id);
  if (!session) throw new Error("the page did not open live");
  return session;
}

const body = (session: PageSession) => pageBlocks(session.doc).map((b) => b.content);

function typeInto(session: PageSession, index: number, text: string) {
  const block = session.doc.getXmlFragment(PAGE_FRAGMENT).get(index);
  const run = block instanceof Y.XmlElement ? block.get(0) : null;
  if (!(run instanceof Y.XmlText)) throw new Error("no text");
  run.insert(0, text);
}

/// What a device that opens the page fresh from the server reads.
async function serverBody(id: string): Promise<string[]> {
  const reader = makeDevice(PHONE);
  await reader.sync.signIn(server.baseUrl, "ada", PASSWORD);
  await reader.sync.settled();
  return body(await openPage(reader, id));
}

describe("a page open on two devices", () => {
  it("shows what one types on the other within about a second, both ways, once", async () => {
    const { desktop, phone } = await pair();
    addNote(desktop, "p1", ["Pack the tent", "Book the train"]);
    desktop.sync.notifyLocalChange();
    await soon(() => title(phone, "p1") === "Trip", "the note on the phone");
    const onDesktop = await openPage(desktop, "p1");
    const onPhone = await openPage(phone, "p1");
    expect(body(onPhone)).toEqual(["Pack the tent", "Book the train"]);
    typeInto(onDesktop, 0, "Now: ");
    await soon(
      () => body(onPhone)[0] === "Now: Pack the tent",
      "the desktop's typing on the phone",
    );
    typeInto(onPhone, 1, "Then: ");
    await soon(
      () => body(onDesktop)[1] === "Then: Book the train",
      "the phone's typing on the desktop",
    );
    expect(await serverBody("p1")).toEqual(["Now: Pack the tent", "Then: Book the train"]);
  });

  it("holds the body once when both devices had the page before they signed in", async () => {
    // Bug: a page that every device already held (signed out and in again, or the same
    // data on two devices) showed its whole body many times over in the account.
    const desktop = makeDevice(DESKTOP);
    const phone = makeDevice(PHONE);
    addNote(desktop, "p1", ["Pack the tent", "Book the train"]);
    addNote(phone, "p1", ["Pack the tent", "Book the train"]);
    await desktop.sync.signUp(server.baseUrl, { username: "ada", password: PASSWORD });
    await desktop.sync.settled();
    const onDesktop = await openPage(desktop, "p1");
    await phone.sync.signIn(server.baseUrl, "ada", PASSWORD);
    await phone.sync.settled();
    const onPhone = await openPage(phone, "p1");
    typeInto(onPhone, 0, "Now: ");
    await soon(() => body(onDesktop)[0] === "Now: Pack the tent", "the phone's typing");
    expect(body(onDesktop)).toEqual(["Now: Pack the tent", "Book the train"]);
    expect(await serverBody("p1")).toEqual(["Now: Pack the tent", "Book the train"]);
  });

  it("stays live and single after a device signs out and in again", async () => {
    const { desktop, phone } = await pair();
    addNote(desktop, "p1", ["Pack the tent"]);
    desktop.sync.notifyLocalChange();
    await soon(() => title(phone, "p1") === "Trip", "the note on the phone");
    const onDesktop = await openPage(desktop, "p1");
    const first = await openPage(phone, "p1");
    typeInto(first, 0, "A ");
    await soon(() => body(onDesktop)[0] === "A Pack the tent", "the first edit");
    phone.sync.pages()?.release("p1");
    await phone.sync.signOut();
    await phone.sync.signIn(server.baseUrl, "ada", PASSWORD);
    await phone.sync.settled();
    const again = await openPage(phone, "p1");
    expect(body(again)).toEqual(["A Pack the tent"]);
    typeInto(again, 0, "B ");
    await soon(() => body(onDesktop)[0] === "B A Pack the tent", "the edit after signing in again");
    edit(desktop, "UPDATE entities SET title = 'Trip north' WHERE id = 'p1'");
    await soon(() => title(phone, "p1") === "Trip north", "a title after signing in again");
    expect(await serverBody("p1")).toEqual(["B A Pack the tent"]);
  });
});

describe("a device that changes account", () => {
  it("never merges a page copy kept from another account into the new one", async () => {
    // Bug: a copy of a page left on the device from an earlier sign in was merged into the
    // next account's page, which then held its whole body twice.
    const phone = makeDevice(PHONE);
    addNote(phone, "p1", ["Pack the tent", "Book the train"]);
    await phone.sync.signUp(server.baseUrl, { username: "old", password: PASSWORD });
    await phone.sync.settled();
    await openPage(phone, "p1");
    await until(() => phone.driver.rows("SELECT 1 FROM page_docs").length === 1, "the copy");
    const [kept] = phone.driver.rows("SELECT entity_id, state, updated_at FROM page_docs");
    phone.sync.pages()?.release("p1");
    await phone.sync.signOut();
    // The copy is still there, as after a write that landed late.
    phone.driver.exec(
      "INSERT INTO page_docs (entity_id, state, pending, updated_at) VALUES (?, ?, 0, ?)",
      String(kept.entity_id),
      String(kept.state),
      String(kept.updated_at),
    );
    await phone.sync.signUp(server.baseUrl, { username: "ada", password: PASSWORD });
    await phone.sync.settled();
    const session = await openPage(phone, "p1");
    await Bun.sleep(300);
    expect(body(session)).toEqual(["Pack the tent", "Book the train"]);
    expect(await serverBody("p1")).toEqual(["Pack the tent", "Book the train"]);
  });

  it("writes nothing about a page after signing out", async () => {
    // Bug: a page closed with typing still on its way was saved again seconds after the
    // sign out had cleared the device's page copies.
    const phone = makeDevice(PHONE);
    addNote(phone, "p1", ["Pack the tent"]);
    await phone.sync.signUp(server.baseUrl, { username: "ada", password: PASSWORD });
    await phone.sync.settled();
    const session = await openPage(phone, "p1");
    phone.network.unplug();
    typeInto(session, 0, "Offline ");
    phone.sync.pages()?.release("p1");
    await Bun.sleep(100);
    await phone.sync.signOut();
    await Bun.sleep(2600);
    expect(phone.driver.rows("SELECT entity_id FROM page_docs")).toEqual([]);
    // What was typed is in the rows, which stay.
    expect(phone.driver.rows("SELECT content FROM blocks WHERE entity_id = 'p1'")).toEqual([
      { content: "Offline Pack the tent" },
    ]);
  });
});

describe("a device whose session ended while it was closed", () => {
  it("syncs live again after signing in", async () => {
    // Bug: launched with a session the server no longer knew, the device was signed out
    // but kept a sync that had no session; signing in again left that one running, so
    // the account looked fine while sync said "Sign in first." for good.
    const { desktop, phone } = await pair();
    addTask(desktop, "t1", "Buy milk");
    desktop.sync.notifyLocalChange();
    await soon(() => title(phone, "t1") === "Buy milk", "the task on the phone");
    // The phone is closed; its session is ended from the desktop meanwhile.
    phone.sync.stop();
    const api = desktop.sync.account();
    const session = (await api?.sessions())?.find((s) => !s.current);
    if (!api || !session) throw new Error("no session for the phone");
    await api.revokeSession(session.id);
    // Launched again, with the same database and stored token.
    const relaunched = new SyncRuntime({
      driver: phone.driver,
      device: PHONE,
      onApplied: () => {},
      connect: (baseUrl, onSignedOut) =>
        new ApiClient({ baseUrl, tokens: phone.tokens, onSignedOut }),
    });
    const launched: AppDevice = { ...phone, sync: relaunched };
    devices.push(launched);
    await relaunched.restore(server.baseUrl);
    await soon(() => relaunched.store.getState().user === null, "the phone signed out");
    await relaunched.signIn(server.baseUrl, "ada", PASSWORD);
    await relaunched.settled();
    expect(relaunched.store.getState().status.error).toBeNull();
    edit(desktop, "UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    await soon(() => title(launched, "t1") === "Buy oat milk", "the desktop's edit on the phone");
    edit(launched, "UPDATE entities SET title = 'Buy oat milk today' WHERE id = 't1'");
    await soon(() => title(desktop, "t1") === "Buy oat milk today", "the phone's edit");
    await soon(() => relaunched.store.getState().status.state === "idle", "sync at rest");
    expect(relaunched.store.getState().status.error).toBeNull();
  });
});
