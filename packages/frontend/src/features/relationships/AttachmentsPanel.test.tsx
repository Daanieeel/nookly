import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { AttachmentsPanel } from "./AttachmentsPanel.tsx";

const base = { fromBlockId: null, toBlockId: null, createdAt: "2026-01-01T00:00:00Z" };
const attached = (id: string, from: string, to: string) => ({
  ...base,
  id,
  fromEntityId: from,
  toEntityId: to,
  relationshipType: "attached-file",
});

describe("AttachmentsPanel", () => {
  it("groups what is attached by entity type, like the relationships", async () => {
    const me = makeEntity({ id: "me", type: "file" });
    mockCommand("list_relationships", [
      attached("r1", "n1", "me"),
      attached("r2", "j1", "me"),
      attached("r3", "n2", "me"),
      attached("r4", "s1", "me"),
      attached("r5", "c1", "me"),
    ]);
    mockCommand("list_spaces", []);
    const types: Record<string, string> = {
      n1: "note",
      n2: "note",
      j1: "jot",
      s1: "session",
      c1: "course",
    };
    mockCommandWith("get_entity", (args) => {
      const id = args && "id" in args ? String(args.id) : "";
      return makeEntity({ id, title: `Item ${id}`, type: types[id] ?? "note" });
    });
    renderWithProviders(<AttachmentsPanel entity={me} />);

    const notes = await screen.findByRole("group", { name: "Note" });
    await waitFor(() =>
      expect(within(notes).getAllByRole("button", { name: /Item n/ })).toHaveLength(2),
    );
    for (const [name, id] of [
      ["Jot", "j1"],
      ["Session", "s1"],
      ["Course", "c1"],
    ]) {
      const group = screen.getByRole("group", { name });
      expect(within(group).getByRole("button", { name: new RegExp(`Item ${id}`) })).toBeTruthy();
    }
  });

  it("keeps the attached to hint and the remove button on every row", async () => {
    const me = makeEntity({ id: "me", type: "note" });
    mockCommand("list_relationships", [attached("r1", "me", "f1"), attached("r2", "x", "me")]);
    mockCommand("list_spaces", []);
    mockCommandWith("get_entity", (args) => {
      const id = args && "id" in args ? String(args.id) : "";
      return makeEntity({ id, title: `Item ${id}`, type: "file" });
    });
    renderWithProviders(<AttachmentsPanel entity={me} />);
    const files = await screen.findByRole("group", { name: "File" });
    await waitFor(() =>
      expect(within(files).getAllByRole("button", { name: /Item/ }).length).toBeGreaterThan(1),
    );
    expect(within(files).getByRole("button", { name: /Item x.*attached to/ })).toBeTruthy();
    expect(within(files).getAllByRole("button", { name: "Remove attachment" })).toHaveLength(2);
  });
});
