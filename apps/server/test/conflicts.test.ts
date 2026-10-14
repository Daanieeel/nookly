import { ApiRequestError } from "@nookly/shared/api";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  HOOK_TIMEOUT,
  PASSWORD,
  PHONE,
  type TestServer,
  addTask,
  device,
  startServer,
  syncOnce,
  titleOf,
  verifiedAccount,
} from "./helpers.ts";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
}, HOOK_TIMEOUT);
afterEach(async () => {
  await server.stop();
}, HOOK_TIMEOUT);

/// Ada's desktop and phone, both with the same task, both synced.
async function twoDevices() {
  const { api } = await verifiedAccount(server, "ada@example.com");
  const phoneApi = server.client();
  await phoneApi.signIn("ada", PASSWORD, PHONE);
  const desktop = device(api);
  const phone = device(phoneApi);
  await desktop.engine.enable();
  await phone.engine.enable();
  addTask(desktop, "t1", "Buy milk");
  await syncOnce(desktop);
  await syncOnce(phone);
  return { desktop, phone };
}

const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/// A device sends what it has without pulling first, like two devices that were
/// both offline and reconnect at the same moment.
async function pushOnly(d: Awaited<ReturnType<typeof twoDevices>>["desktop"]) {
  const planned = await d.engine.collect();
  await d.engine.acknowledge(
    planned,
    (await d.api.syncTransport().push({ changes: planned.map((p) => p.change) })).results,
  );
}

const deviceOf = (clock: string | null) => clock?.split("-")[2] ?? "";

describe("conflicts", () => {
  it("are kept on the device that pulled the other edit, naming both devices", async () => {
    const { desktop, phone } = await twoDevices();
    // Both offline: the same field changed on both.
    desktop.driver.exec("UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    await later(5);
    phone.driver.exec("UPDATE entities SET title = 'Buy milk and eggs' WHERE id = 't1'");
    await syncOnce(desktop);
    await syncOnce(phone);
    await syncOnce(desktop);
    expect(titleOf(desktop, "t1")).toBe("Buy milk and eggs");
    expect(await desktop.engine.conflicts()).toEqual([]);
    const [conflict, ...rest] = await phone.engine.conflicts();
    expect(rest).toEqual([]);
    expect(conflict).toMatchObject({
      table: "entities",
      pk: "t1",
      field: "title",
      losingValue: "Buy oat milk",
    });
    const names = new Map((await phone.api.devices()).map((d) => [d.deviceId, d.name]));
    expect(names.get(deviceOf(conflict.losingClock))).toBe("MacBook");
    expect(names.get(deviceOf(conflict.winningClock))).toBe("iPhone");
  });

  it("are logged by the server when two devices push at the same moment", async () => {
    const { desktop, phone } = await twoDevices();
    desktop.driver.exec("UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    await later(5);
    phone.driver.exec("UPDATE entities SET title = 'Buy milk and eggs' WHERE id = 't1'");
    await pushOnly(desktop);
    await pushOnly(phone);
    for (const api of [desktop.api, phone.api]) {
      const [conflict, ...rest] = await api.conflicts();
      expect(rest).toEqual([]);
      expect(conflict).toMatchObject({
        table: "entities",
        pk: "t1",
        field: "title",
        losingValue: "Buy oat milk",
      });
      const names = new Map((await api.devices()).map((d) => [d.deviceId, d.name]));
      expect(names.get(deviceOf(conflict.losingClock))).toBe("MacBook");
      expect(names.get(deviceOf(conflict.winningClock))).toBe("iPhone");
    }
  });

  it("are not made when two devices change different fields", async () => {
    const { desktop, phone } = await twoDevices();
    desktop.driver.exec("UPDATE entities SET title = 'Buy oat milk' WHERE id = 't1'");
    phone.driver.exec("UPDATE tasks SET due_date = '2026-11-02' WHERE entity_id = 't1'");
    await syncOnce(desktop);
    await syncOnce(phone);
    await syncOnce(desktop);
    expect(titleOf(phone, "t1")).toBe("Buy oat milk");
    expect(phone.driver.rows("SELECT due_date FROM tasks")).toEqual([{ due_date: "2026-11-02" }]);
    expect(await desktop.api.conflicts()).toEqual([]);
    expect(await phone.engine.conflicts()).toEqual([]);
  });

  it("are gone for every device once one resolves them, and are only the account's own", async () => {
    const { desktop, phone } = await twoDevices();
    desktop.driver.exec("UPDATE entities SET title = 'A' WHERE id = 't1'");
    await later(5);
    phone.driver.exec("UPDATE entities SET title = 'B' WHERE id = 't1'");
    await pushOnly(desktop);
    await pushOnly(phone);
    const [conflict] = await phone.api.conflicts();
    const { api: ben } = await verifiedAccount(server, "ben@example.com", PHONE);
    expect(await ben.conflicts()).toEqual([]);
    const refused = await ben.resolveConflict(conflict.id).then(
      () => 200,
      (e: ApiRequestError) => e.status,
    );
    expect(refused).toBe(404);
    await phone.api.resolveConflict(conflict.id);
    expect(await desktop.api.conflicts()).toEqual([]);
  });
});
