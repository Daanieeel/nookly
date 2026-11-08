import { beforeEach, describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { createLinked, pickerCreator } from "./picker-create.ts";

const forward = (type: string) => ({ type, reverse: false });
const reverse = (type: string) => ({ type, reverse: true });

describe("pickerCreator", () => {
  it.each(["note", "jot", "task", "course", "semester", "recipe", "index_card_deck"])(
    "can create a %s from any item, since a title is all it needs",
    (type) => {
      expect(pickerCreator(type, forward("relates-to"), "note")).not.toBeNull();
    },
  );

  it.each(["bookmark", "file", "session", "calendar_entry", "view", "sub_task"])(
    "cannot create a %s, which needs more than a title",
    (type) => {
      expect(pickerCreator(type, forward("relates-to"), "course")).toBeNull();
    },
  );

  it.each(["assignment", "exam"])("creates a %s only for a course", (type) => {
    expect(pickerCreator(type, reverse(`${type}-course`), "course")).not.toBeNull();
    expect(pickerCreator(type, reverse(`${type}-course`), "note")).toBeNull();
    expect(pickerCreator(type, forward("relates-to"), "course")).toBeNull();
  });
});

describe("createLinked", () => {
  const source = makeEntity({ id: "me", type: "note", spaceId: "space-9" });
  beforeEach(() => {
    mockCommand("create_relationship", {});
  });

  it("creates the item in the space of the source and links it from the source", async () => {
    const created = makeEntity({ id: "new-1", type: "note", spaceId: "space-9" });
    mockCommand("create_note", created);
    const creator = pickerCreator("note", forward("relates-to"), "note");
    if (!creator) throw new Error("no creator");
    await createLinked(creator, source, "Plan", forward("relates-to"));
    expect(callsOf("create_note")).toEqual([{ spaceId: "space-9", title: "Plan" }]);
    expect(callsOf("create_relationship")).toMatchObject([
      { fromEntityId: "me", toEntityId: "new-1", relationshipType: "relates-to" },
    ]);
  });

  it("links a reverse relation the way it points", async () => {
    mockCommand("create_note", makeEntity({ id: "new-1", type: "note" }));
    const creator = pickerCreator("note", reverse("blocks"), "note");
    if (!creator) throw new Error("no creator");
    await createLinked(creator, source, "", reverse("blocks"));
    expect(callsOf("create_relationship")).toMatchObject([
      { fromEntityId: "new-1", toEntityId: "me", relationshipType: "blocks" },
    ]);
  });

  it("makes an assignment for a course without linking it a second time", async () => {
    const course = makeEntity({ id: "course-1", type: "course", spaceId: "space-9" });
    mockCommand("create_assignment", { entity: makeEntity({ id: "a-1", type: "assignment" }) });
    const creator = pickerCreator("assignment", reverse("assignment-course"), "course");
    if (!creator) throw new Error("no creator");
    const made = await createLinked(creator, course, "Essay", reverse("assignment-course"));
    expect(made.id).toBe("a-1");
    expect(callsOf("create_assignment")).toMatchObject([
      { spaceId: "space-9", title: "Essay", courseId: "course-1", dueDate: null },
    ]);
    expect(callsOf("create_relationship")).toEqual([]);
  });

  it("puts a created item back in the trash when the link fails", async () => {
    mockCommand("create_note", makeEntity({ id: "new-1", type: "note" }));
    mockCommandWith("create_relationship", () => {
      throw new Error("refused");
    });
    mockCommand("soft_delete_entity", null);
    const creator = pickerCreator("note", forward("relates-to"), "note");
    if (!creator) throw new Error("no creator");
    await expect(createLinked(creator, source, "Plan", forward("relates-to"))).rejects.toThrow();
    expect(callsOf("soft_delete_entity")).toEqual([{ id: "new-1" }]);
  });
});
