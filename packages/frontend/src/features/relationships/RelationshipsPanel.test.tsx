import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity, makeSession } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { RelatePicker } from "./RelatePickerPopover.tsx";
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

function openPicker(entityType: string, targetType: string | null, extra: () => void = () => {}) {
  mockCommand("list_entities", [
    makeEntity({ id: "n1", type: "note", title: "Wave notes", updatedAt: "2026-01-02T00:00:00Z" }),
    makeEntity({ id: "n2", type: "note", title: "Heat notes", updatedAt: "2026-01-03T00:00:00Z" }),
    makeEntity({
      id: "t1",
      type: "task",
      title: "Read chapter",
      updatedAt: "2026-01-04T00:00:00Z",
    }),
    makeEntity({ id: "s1", type: "session", title: "Lecture", updatedAt: "2026-01-05T00:00:00Z" }),
  ]);
  mockCommand("list_sessions", [
    makeSession({ courseTitle: "Physics", date: "2026-03-10" }, { id: "s1" }),
  ]);
  mockCommand("list_relationships", []);
  extra();
  const types = [
    {
      name: "relates-to",
      label: "Related to",
      inverseLabel: "related from",
      description: "",
      fromType: null,
      toType: targetType,
    },
  ];
  return renderWithProviders(
    <RelatePicker
      spaceId="space-1"
      exclude="me"
      entityType={entityType}
      types={types}
      onSelect={() => {}}
    />,
  );
}

describe("RelatePicker target step", () => {
  it("groups by type and narrows the list with a type chip", async () => {
    const { user } = openPicker("note", null);
    await user.click(await screen.findByText("Related to"));
    expect(await screen.findByRole("group", { name: "Note" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Task" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Task 1$/ }));
    expect(screen.queryByText("Wave notes")).toBeNull();
    expect(screen.getByText("Read chapter")).toBeTruthy();
  });

  it("finds a session by its course title and shows the course on the row", async () => {
    const { user } = openPicker("note", "session");
    await user.click(await screen.findByText("Related to"));
    expect(await screen.findByText(/Physics, /)).toBeTruthy();
    await user.type(screen.getByRole("combobox"), "physics");
    expect(screen.getByText(/Physics, /)).toBeTruthy();
  });
});

describe("RelatePicker course context", () => {
  it("puts the notes of the session's course first", async () => {
    const link = (from: string, to: string, relationshipType: string) => ({
      ...base,
      id: `${from}-${to}`,
      fromEntityId: from,
      toEntityId: to,
      relationshipType,
    });
    const { user } = openPicker("session", "note", () => {
      mockCommandWith("list_relationships", (args) => {
        const id = args && "entityId" in args ? String(args.entityId) : "";
        if (id === "me") return [link("me", "course-1", "session-course")];
        if (id === "course-1") return [link("course-1", "n1", "course-notes")];
        return [];
      });
    });
    await user.click(await screen.findByText("Related to"));
    const course = await screen.findByRole("group", { name: "Notes of this course" });
    expect(within(course).getByText("Wave notes")).toBeTruthy();
    const other = screen.getByRole("group", { name: "Note" });
    expect(within(other).getByText("Heat notes")).toBeTruthy();
    expect(within(other).queryByText("Wave notes")).toBeNull();
  });
});
