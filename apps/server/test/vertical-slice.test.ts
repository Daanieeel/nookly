import { ApiClient, type FetchLike } from "@nookly/shared/api";
import { NetworkError, SyncClient, SyncEngine } from "@nookly/shared/sync";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { BunSqliteDriver } from "./bun-driver.ts";
import {
  DESKTOP,
  MemoryTokens,
  PASSWORD,
  PHONE,
  type TestServer,
  startServer,
  until,
} from "./helpers.ts";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.stop();
});

/// A device's network connection, which the test can unplug: requests fail like an
/// offline fetch, and open sockets drop.
class Connection {
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

/// A device as the apps build one: its database with the desktop's schema, the
/// shared engine and client, the shared API client.
function makeDevice(baseUrl: string) {
  const connection = new Connection();
  const api = new ApiClient({
    baseUrl,
    tokens: new MemoryTokens(),
    fetch: connection.fetch,
    webSocket: connection.webSocket,
  });
  const driver = new BunSqliteDriver();
  const engine = new SyncEngine({ driver });
  const client = new SyncClient({
    engine,
    transport: api.syncTransport(),
    debounceMs: 50,
    periodMs: 2_000,
  });
  return { api, driver, engine, client, connection };
}

const now = () => new Date().toISOString();
const task = (d: ReturnType<typeof makeDevice>) =>
  d.driver.rows(
    "SELECT e.title, t.status_id, t.due_date FROM entities e JOIN tasks t ON t.entity_id = e.id",
  );

describe("the vertical slice", () => {
  it("syncs a task between a desktop and a phone, live and after both edited it offline", async () => {
    const desktop = makeDevice(server.baseUrl);
    const phone = makeDevice(server.baseUrl);

    // Sign up on the desktop, sign in on the phone.
    await desktop.api.register("ada@example.com", PASSWORD, DESKTOP);
    await phone.api.signIn("ada@example.com", PASSWORD, PHONE);
    await desktop.client.start();
    await phone.client.start();

    // A task made on the desktop shows up on the phone, pushed live.
    desktop.driver.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'Personal', 'blue', ?, ?)",
      now(),
      now(),
    );
    desktop.driver.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES ('t1', 's1', 'task', 'Call the dentist', ?, ?, 'TSK', 1)",
      now(),
      now(),
    );
    desktop.driver.exec("INSERT INTO tasks (entity_id, status_id) VALUES ('t1', 'todo')");
    desktop.client.notifyLocalChange();
    await until(() => task(phone).length === 1, "the task to reach the phone");
    expect(task(phone)).toEqual([{ title: "Call the dentist", status_id: "todo", due_date: null }]);

    // Both go offline and edit the task.
    desktop.connection.unplug();
    phone.connection.unplug();
    desktop.driver.exec("UPDATE entities SET title = 'Call the dentist at 9' WHERE id = 't1'");
    desktop.client.notifyLocalChange();
    phone.driver.exec(
      "UPDATE tasks SET status_id = 'in_progress', due_date = '2026-10-20' WHERE entity_id = 't1'",
    );
    phone.client.notifyLocalChange();
    await until(
      () => desktop.client.current().state === "offline",
      "the desktop to notice it is offline",
    );
    expect(task(desktop)[0].status_id).toBe("todo");

    // Back online, both converge on every edit.
    desktop.connection.plugIn();
    phone.connection.plugIn();
    const expected = [
      { title: "Call the dentist at 9", status_id: "in_progress", due_date: "2026-10-20" },
    ];
    await until(
      () =>
        JSON.stringify(task(desktop)) === JSON.stringify(expected) &&
        JSON.stringify(task(phone)) === JSON.stringify(expected),
      "both devices to converge",
      30_000,
    );
    expect(await desktop.engine.pendingCount()).toBe(0);
    expect(await phone.engine.pendingCount()).toBe(0);
    desktop.client.stop();
    phone.client.stop();
  }, 60_000);
});
