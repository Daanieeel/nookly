import { ApiClient, type FetchLike } from "@nookly/shared/api";
import { NetworkError, SyncRuntime } from "@nookly/shared/sync";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
  server = await startServer();
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
