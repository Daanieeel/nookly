import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { RelationshipsPanel } from "./RelationshipsPanel.tsx";

const base = { fromBlockId: null, toBlockId: null, createdAt: "2026-01-01T00:00:00Z" };
const type = (name: string, label: string, inverseLabel: string) => ({
  name,
  label,
  inverseLabel,
  description: "",
  fromType: null,
  toType: null,
});

function setup() {
  const me = makeEntity({ id: "me", type: "note" });
  mockCommand("list_relationships", [
    { ...base, id: "r1", fromEntityId: "me", toEntityId: "a", relationshipType: "blocks" },
    { ...base, id: "r2", fromEntityId: "me", toEntityId: "b", relationshipType: "blocks" },
    { ...base, id: "r3", fromEntityId: "c", toEntityId: "me", relationshipType: "blocks" },
  ]);
  mockCommand("list_relationship_types", [type("blocks", "Blocks", "Blocked by")]);
  mockCommand("list_spaces", []);
  mockCommandWith("get_entity", (args) => {
    const id = args && "id" in args ? String(args.id) : "";
    return makeEntity({ id, title: `Item ${id}`, type: id === "c" ? "task" : "note" });
  });
  renderWithProviders(<RelationshipsPanel entity={me} />);
}

describe("RelationshipsPanel", () => {
  it("groups relationships under the type of what they link to, keeping the relationship on the row", async () => {
    setup();
    const notes = await screen.findByRole("group", { name: "Note" });
    await waitFor(() =>
      expect(within(notes).getAllByRole("button", { name: /Item [ab].*Blocks/ })).toHaveLength(2),
    );
    const tasks = screen.getByRole("group", { name: "Task" });
    expect(await within(tasks).findByRole("button", { name: /Item c.*Blocked by/ })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Blocks" })).toBeNull();
  });
});
