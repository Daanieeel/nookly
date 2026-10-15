import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace, trashEntity } from "./entities.ts";
import { createView, getView, listViews, updateViewConfig } from "./views.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
beforeEach(() => {
  db = testDb();
});

describe("saved views", () => {
  it("keeps a page's settings under a name, in order, per Space and module", async () => {
    const work = await createSpace(db, "Work", "#000000");
    const home = await createSpace(db, "Home", "#000000");
    const config = JSON.stringify({
      filters: [{ fieldId: "status", operator: "is", values: ["todo"] }],
      display: { layout: "board" },
    });
    const a = await createView(db, work, { title: "Open work", module: "tasks", config });
    const b = await createView(db, work, { title: "Everything", module: "tasks", config: "{}" });
    await createView(db, work, { title: "Late sheets", module: "assignments", config: "{}" });
    await createView(db, home, {
      title: "Chores",
      module: "tasks",
      config: "{}",
      icon: "icon:Home",
    });
    expect(
      (await listViews(db, { spaceId: work, module: "tasks" })).map((v) => v.entity.id),
    ).toEqual([a, b]);
    expect((await listViews(db, { module: "tasks" })).map((v) => v.entity.title)).toEqual([
      "Open work",
      "Everything",
      "Chores",
    ]);
    expect((await getView(db, a))?.config).toBe(config);
    expect((await listViews(db, { spaceId: home }))[0].entity.icon).toBe("icon:Home");
  });

  it("changes its settings, refuses what isn't an object, and a trashed one is left out", async () => {
    const space = await createSpace(db, "Work", "#000000");
    const id = await createView(db, space, { title: "V", module: "tasks", config: "{}" });
    await updateViewConfig(db, id, '{"display":{"layout":"list"}}');
    expect((await getView(db, id))?.config).toBe('{"display":{"layout":"list"}}');
    await expect(updateViewConfig(db, id, "[]")).rejects.toThrow("JSON object");
    await expect(updateViewConfig(db, id, "nope")).rejects.toThrow("JSON object");
    await expect(
      createView(db, space, { title: "x", module: "notes" as never, config: "{}" }),
    ).rejects.toThrow("not available");
    await expect(updateViewConfig(db, "missing", "{}")).rejects.toThrow("isn't here");
    await trashEntity(db, id);
    expect(await listViews(db, { spaceId: space })).toEqual([]);
  });
});
