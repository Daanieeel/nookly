import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { mockCommand } from "#/test/tauri.ts";

const jot = makeEntity({ id: "jot-1", spaceId: "s1", type: "jot", title: "Lecture", key: "JOT-1" });
const note = makeEntity({
  id: "note-1",
  spaceId: "s1",
  type: "note",
  title: "Lecture",
  key: "NOT-1",
});

/// A fresh nav store and refine function, as the app builds them on launch.
async function load() {
  vi.resetModules();
  const nav = await import("#/lib/store/nav.ts");
  const { refineJotIntoNote } = await import("./refine-jot.ts");
  return { ...nav, store: nav.useNavStore, refineJotIntoNote };
}

const entityView = (entityId: string) => ({ kind: "entity", entityId, spaceId: "s1" }) as const;

beforeEach(() => {
  mockCommand("create_note", note);
  mockCommand("create_relationship", {});
  mockCommand("list_relationships", []);
  mockCommand("touch_entity_opened", null);
});

describe("refining a jot into a note", () => {
  it("opens the jot on the left and the new note on the right, when the jot is open", async () => {
    const { store, tabGroups, refineJotIntoNote } = await load();
    store.getState().openEntity(jot.id, jot.spaceId);

    await refineJotIntoNote(jot, new QueryClient());

    const state = store.getState();
    const [left, right] = tabGroups(state);
    expect(tabGroups(state)).toHaveLength(2);
    expect(left.tabs.map((t) => t.view)).toEqual([entityView(jot.id)]);
    expect(right.tabs.map((t) => t.view)).toEqual([entityView(note.id)]);
    expect(state.focusedGroupId).toBe(right.id);
    expect(state.view).toEqual(entityView(note.id));
  });

  it("brings the jot up first when another page is open, and splits beside it", async () => {
    const { store, tabGroups, refineJotIntoNote } = await load();
    store.getState().setView({ kind: "pinned" });

    await refineJotIntoNote(jot, new QueryClient());

    const [left, right] = tabGroups(store.getState());
    expect(left.tabs.map((t) => t.view)).toEqual([entityView(jot.id)]);
    expect(right.tabs.map((t) => t.view)).toEqual([entityView(note.id)]);
  });

  it("puts the note in the group beside the jot when the view is already split", async () => {
    const { store, tabGroups, refineJotIntoNote } = await load();
    store.getState().setView({ kind: "pinned" });
    store.getState().splitRight();
    store.getState().focusGroupAt(0);
    store.getState().openEntity(jot.id, jot.spaceId);

    await refineJotIntoNote(jot, new QueryClient());

    const state = store.getState();
    const [left, right] = tabGroups(state);
    expect(tabGroups(state)).toHaveLength(2);
    expect(left.tabs.map((t) => t.view)).toContainEqual(entityView(jot.id));
    expect(right.tabs.at(-1)?.view).toEqual(entityView(note.id));
    expect(state.view).toEqual(entityView(note.id));
  });

  it("keeps the jot on screen when the jot is in the right group, and puts the note on the left", async () => {
    const { store, tabGroups, refineJotIntoNote } = await load();
    store.getState().setView({ kind: "pinned" });
    store.getState().splitRight();
    store.getState().openEntity(jot.id, jot.spaceId);

    await refineJotIntoNote(jot, new QueryClient());

    const [left, right] = tabGroups(store.getState());
    expect(right.tabs.map((t) => t.view)).toContainEqual(entityView(jot.id));
    expect(left.tabs.at(-1)?.view).toEqual(entityView(note.id));
  });

  it("links the note to the jot as before", async () => {
    const { store, refineJotIntoNote } = await load();
    store.getState().openEntity(jot.id, jot.spaceId);
    const created = await refineJotIntoNote(jot, new QueryClient());
    expect(created.id).toBe(note.id);
  });
});
