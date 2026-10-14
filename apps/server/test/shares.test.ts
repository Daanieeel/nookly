import { ApiRequestError } from "@nookly/shared/api";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  type Device,
  PASSWORD,
  PHONE,
  type TestServer,
  addPage,
  addTask,
  device,
  startServer,
  titleOf,
  until,
  verifiedAccount,
} from "./helpers.ts";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.stop();
});

async function syncOnce(d: Device) {
  const transport = d.api.syncTransport();
  const pull = async () => {
    for (;;) {
      const response = await transport.pull({ cursors: await d.engine.cursors() });
      for (const gone of response.removed) await d.engine.forget(gone);
      await d.engine.apply(response.datasets);
      if (!response.datasets.some((x) => x.hasMore)) return;
    }
  };
  await pull();
  for (;;) {
    const planned = await d.engine.collect();
    if (planned.length === 0) break;
    await d.engine.acknowledge(
      planned,
      (await transport.push({ changes: planned.map((p) => p.change) })).results,
    );
  }
  await pull();
}

/// Ada owns a page with two blocks, related to a task she doesn't share. Ben has an account.
async function setup() {
  const ada = await verifiedAccount(server, "ada@example.com");
  const ben = await verifiedAccount(server, "ben@example.com", PHONE);
  const adaDevice = device(ada.api);
  const benDevice = device(ben.api);
  await adaDevice.engine.enable();
  await benDevice.engine.enable();
  addPage(adaDevice, "p1", "Trip plan", ["Book flights", "Pack light"]);
  addTask(adaDevice, "t1", "Private task");
  adaDevice.driver.exec(
    "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES ('r1', 'p1', 't1', 'relates-to', 'now')",
  );
  await syncOnce(adaDevice);
  return { ada, ben, adaDevice, benDevice };
}

async function code(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ApiRequestError) return error.code;
    throw error;
  }
}

describe("sharing a page", () => {
  it("invites by email, and the page arrives once accepted", async () => {
    const { ada, ben, benDevice } = await setup();
    const { share, inviteUrl } = await ada.api.share("p1", "ben@example.com", "viewer");
    expect(share.title).toBe("Trip plan");
    expect(inviteUrl).toStartWith("http://nookly.test/invite?token=");
    expect(server.mailer.link("ben@example.com", "/invite")).toBe(inviteUrl);
    const [incoming] = await ben.api.sharesWithMe();
    expect([incoming.status, incoming.ownerEmail]).toEqual(["pending", "ada@example.com"]);

    await syncOnce(benDevice);
    expect(titleOf(benDevice, "p1")).toBeNull();

    await ben.api.acceptShare(incoming.id);
    await syncOnce(benDevice);
    expect(titleOf(benDevice, "p1")).toBe("Trip plan");
    expect(benDevice.driver.rows("SELECT content FROM blocks ORDER BY position")).toEqual([
      { content: "Book flights" },
      { content: "Pack light" },
    ]);
    // In a Space of its own, with its Notes module.
    const [entity] = benDevice.driver.rows("SELECT space_id FROM entities WHERE id = 'p1'");
    const [space] = benDevice.driver.rows("SELECT name FROM spaces WHERE id = ?", entity.space_id);
    expect(space.name).toBe("Shared by ada@example.com");
    expect(
      benDevice.driver.rows(
        "SELECT module_key FROM space_modules WHERE space_id = ?",
        entity.space_id,
      ),
    ).toEqual([{ module_key: "notes" }]);
  });

  it("never hands out anything that wasn't shared", async () => {
    const { ada, ben, benDevice } = await setup();
    const { share } = await ada.api.share("p1", "ben@example.com", "editor");
    await ben.api.acceptShare(share.id);
    await syncOnce(benDevice);
    expect(titleOf(benDevice, "t1")).toBeNull();
    expect(benDevice.driver.rows("SELECT * FROM relationships")).toEqual([]);
    expect(benDevice.driver.rows("SELECT name FROM spaces")).toEqual([
      { name: "Shared by ada@example.com" },
    ]);
  });

  it("lets a viewer read only: an edit is undone and kept as a conflict", async () => {
    const { ada, ben, adaDevice, benDevice } = await setup();
    const { share } = await ada.api.share("p1", "ben@example.com", "viewer");
    await ben.api.acceptShare(share.id);
    await syncOnce(benDevice);
    benDevice.driver.exec("UPDATE blocks SET content = 'Vandalized' WHERE id = 'p1-b0'");
    await syncOnce(benDevice);
    expect(benDevice.driver.rows("SELECT content FROM blocks WHERE id = 'p1-b0'")).toEqual([
      { content: "Book flights" },
    ]);
    expect((await benDevice.engine.conflicts()).length).toBe(1);
    await syncOnce(adaDevice);
    expect(adaDevice.driver.rows("SELECT content FROM blocks WHERE id = 'p1-b0'")).toEqual([
      { content: "Book flights" },
    ]);
  });

  it("lets an editor change the page, and the owner gets it live", async () => {
    const { ada, ben, adaDevice, benDevice } = await setup();
    const { share } = await ada.api.share("p1", "ben@example.com", "editor");
    await ben.api.acceptShare(share.id);
    await syncOnce(benDevice);
    await adaDevice.client.start();
    benDevice.driver.exec(
      "UPDATE blocks SET content = 'Book flights by Friday' WHERE id = 'p1-b0'",
    );
    benDevice.driver.exec("UPDATE entities SET title = 'Trip plan, final' WHERE id = 'p1'");
    benDevice.driver.exec(
      "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES ('ben-1', 'p1', 2, 'paragraph', 'Bring the charger', 'now', 'now')",
    );
    await syncOnce(benDevice);
    await until(
      () =>
        adaDevice.driver.rows("SELECT COUNT(*) AS n FROM blocks WHERE entity_id = 'p1'")[0].n === 3,
      "Ben's block to reach Ada",
    );
    expect(titleOf(adaDevice, "p1")).toBe("Trip plan, final");
    expect(adaDevice.driver.rows("SELECT content FROM blocks WHERE id = 'p1-b0'")).toEqual([
      { content: "Book flights by Friday" },
    ]);
    // Ada's page stays in her own Space.
    expect(adaDevice.driver.rows("SELECT space_id FROM entities WHERE id = 'p1'")).toEqual([
      { space_id: "space-1" },
    ]);
    adaDevice.client.stop();
  });

  it("refuses an editor's move of the page or its blocks elsewhere", async () => {
    const { ada, ben, benDevice } = await setup();
    const { share } = await ada.api.share("p1", "ben@example.com", "editor");
    await ben.api.acceptShare(share.id);
    await syncOnce(benDevice);
    const clock = "9999999999999-000001-ben";
    const dataset = `share:${share.id}`;
    const response = await ben.api.push({
      changes: [
        {
          dataset,
          table: "entities",
          pk: "p1",
          scope: "p1",
          fields: { deleted_at: "now" },
          clocks: { deleted_at: clock },
          baseClocks: {},
          deletedClock: null,
        },
        {
          dataset,
          table: "blocks",
          pk: "p1-b0",
          scope: "p1",
          fields: { entity_id: "t1" },
          clocks: { entity_id: clock },
          baseClocks: {},
          deletedClock: null,
        },
        {
          dataset,
          table: "entities",
          pk: "t1",
          scope: "t1",
          fields: { title: "Mine now" },
          clocks: { title: clock },
          baseClocks: {},
          deletedClock: null,
        },
        {
          dataset,
          table: "relationships",
          pk: "r2",
          scope: "p1",
          fields: { id: "r2" },
          clocks: { id: clock },
          baseClocks: {},
          deletedClock: null,
        },
      ],
    });
    expect(response.results.map((r) => r.reason)).toEqual([
      "forbidden",
      "forbidden",
      "forbidden",
      "forbidden",
    ]);
  });

  it("drops the page from the recipient's devices when revoked", async () => {
    const { ada, ben, benDevice } = await setup();
    const { share } = await ada.api.share("p1", "ben@example.com", "viewer");
    await ben.api.acceptShare(share.id);
    await syncOnce(benDevice);
    expect(titleOf(benDevice, "p1")).toBe("Trip plan");
    await ada.api.removeShare(share.id);
    await syncOnce(benDevice);
    expect(titleOf(benDevice, "p1")).toBeNull();
    expect(benDevice.driver.rows("SELECT * FROM blocks")).toEqual([]);
    expect(await ben.api.sharesWithMe()).toEqual([]);
  });

  it("lets the recipient decline or leave", async () => {
    const { ada, ben } = await setup();
    const { share } = await ada.api.share("p1", "ben@example.com", "viewer");
    await ben.api.declineShare(share.id);
    expect(await code(ben.api.acceptShare(share.id))).toBe("not_pending");
    const again = await ada.api.share("p1", "ben@example.com", "viewer");
    await ben.api.acceptShare(again.share.id);
    await ben.api.removeShare(again.share.id);
    expect(await ada.api.sharesByMe()).toEqual([]);
  });

  it("changes the role", async () => {
    const { ada, ben, benDevice } = await setup();
    const { share } = await ada.api.share("p1", "ben@example.com", "viewer");
    await ben.api.acceptShare(share.id);
    await ada.api.changeShareRole(share.id, "editor");
    await syncOnce(benDevice);
    benDevice.driver.exec("UPDATE blocks SET content = 'Edited' WHERE id = 'p1-b1'");
    await syncOnce(benDevice);
    expect((await ben.api.sharesWithMe())[0].role).toBe("editor");
    expect(benDevice.driver.rows("SELECT content FROM blocks WHERE id = 'p1-b1'")).toEqual([
      { content: "Edited" },
    ]);
  });

  it("invites someone without an account, who accepts with the link after signing up", async () => {
    const { ada } = await setup();
    const { inviteUrl } = await ada.api.share("p1", "cleo@example.com", "viewer");
    const cleo = server.client();
    await cleo.register("cleo@example.com", PASSWORD, PHONE);
    const [pending] = await cleo.sharesWithMe();
    expect(pending.status).toBe("pending");
    await cleo.acceptInvite(new URL(inviteUrl).searchParams.get("token") ?? "");
    expect((await cleo.sharesWithMe())[0].status).toBe("accepted");
  });

  it("only works for the address the invite went to", async () => {
    const { ada, ben } = await setup();
    const { inviteUrl } = await ada.api.share("p1", "cleo@example.com", "viewer");
    expect(
      await code(ben.api.acceptInvite(new URL(inviteUrl).searchParams.get("token") ?? "")),
    ).toBe("not_found");
  });

  it("shares a task with its status, and an editor can move it along", async () => {
    const { ada, ben, adaDevice, benDevice } = await setup();
    adaDevice.driver.exec(
      "INSERT INTO task_statuses (id, name, color, doneness, position) VALUES ('review', 'In Review', '#f59e0b', 50, 9)",
    );
    adaDevice.driver.exec("UPDATE tasks SET status_id = 'review' WHERE entity_id = 't1'");
    await syncOnce(adaDevice);
    const { share } = await ada.api.share("t1", "ben@example.com", "editor");
    await ben.api.acceptShare(share.id);
    await syncOnce(benDevice);
    expect(benDevice.driver.rows("SELECT status_id FROM tasks WHERE entity_id = 't1'")).toEqual([
      { status_id: "review" },
    ]);
    expect(benDevice.driver.rows("SELECT name FROM task_statuses WHERE id = 'review'")).toEqual([
      { name: "In Review" },
    ]);
    const [entity] = benDevice.driver.rows("SELECT space_id FROM entities WHERE id = 't1'");
    expect(
      benDevice.driver.rows(
        "SELECT module_key FROM space_modules WHERE space_id = ? ORDER BY module_key",
        entity.space_id,
      ),
    ).toEqual([{ module_key: "tasks" }]);
    benDevice.driver.exec(
      "UPDATE tasks SET status_id = 'done', due_date = '2026-11-02' WHERE entity_id = 't1'",
    );
    await syncOnce(benDevice);
    await syncOnce(adaDevice);
    expect(
      adaDevice.driver.rows("SELECT status_id, due_date FROM tasks WHERE entity_id = 't1'"),
    ).toEqual([{ status_id: "done", due_date: "2026-11-02" }]);
    // The page Ada didn't share stays hers alone.
    expect(titleOf(benDevice, "p1")).toBeNull();
  });

  it("needs a confirmed email and a shareable, synced item", async () => {
    const { ada } = await setup();
    expect(await code(ada.api.share("space-1", "ben@example.com", "viewer"))).toBe("not_found");
    expect(await code(ada.api.share("missing", "ben@example.com", "viewer"))).toBe("not_found");
    expect(await code(ada.api.share("p1", "ada@example.com", "viewer"))).toBe("share_with_self");
    await ada.api.share("p1", "ben@example.com", "viewer");
    expect(await code(ada.api.share("p1", "ben@example.com", "editor"))).toBe("already_shared");
    const unverified = server.client();
    await unverified.register("dan@example.com", PASSWORD, PHONE);
    expect(await code(unverified.share("p1", "ben@example.com", "viewer"))).toBe(
      "email_unverified",
    );
  });
});
