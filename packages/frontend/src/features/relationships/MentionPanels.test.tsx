import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { MentionedInPanel } from "./MentionedInPanel.tsx";
import { MentionedPanel } from "./MentionedPanel.tsx";

const me = makeEntity({ id: "me", type: "note" });
const note = (id: string) => makeEntity({ id, type: "note", title: `Item ${id}` });
const task = (id: string) => makeEntity({ id, type: "task", title: `Item ${id}` });

function mockEntities(...entities: ReturnType<typeof makeEntity>[]) {
  mockCommand("list_spaces", []);
  mockCommandWith("get_entity", (args) => {
    const id = args && "id" in args ? String(args.id) : "";
    return entities.find((e) => e.id === id);
  });
}

describe("Mentioned in", () => {
  it("groups backlinks under one small headline per entity type", async () => {
    mockEntities(note("a"), note("b"), task("c"));
    mockCommand("list_mentioning_entities", [note("a"), task("c"), note("b")]);
    renderWithProviders(<MentionedInPanel entity={me} />);
    const notes = await screen.findByRole("group", { name: "Note" });
    await waitFor(() =>
      expect(within(notes).getAllByRole("button", { name: /Item/ })).toHaveLength(2),
    );
    const tasks = screen.getByRole("group", { name: "Task" });
    expect(await within(tasks).findByRole("button", { name: /Item c/ })).toBeTruthy();
  });
});

describe("Mentioned", () => {
  it("groups mentions under one small headline per entity type", async () => {
    mockEntities(note("a"), note("b"), task("c"));
    const content = ["a", "c", "b"].map((id) => `[x](mention:${id})`).join(" ");
    mockCommand("list_blocks", [{ id: "blk", entityId: "me", content }]);
    renderWithProviders(<MentionedPanel entity={me} />);
    const notes = await screen.findByRole("group", { name: "Note" });
    await waitFor(() =>
      expect(within(notes).getAllByRole("button", { name: /Item/ })).toHaveLength(2),
    );
    expect(screen.getByRole("group", { name: "Task" })).toBeTruthy();
  });
});
