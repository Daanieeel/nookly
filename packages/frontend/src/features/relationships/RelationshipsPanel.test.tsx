import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RelationshipTypeInfo } from "#/lib/api/types.ts";
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

const RELATES: RelationshipTypeInfo = {
  name: "relates-to",
  label: "Related to",
  inverseLabel: "related from",
  description: "",
  fromType: null,
  toType: null,
};
const SESSION_COURSE: RelationshipTypeInfo = {
  name: "session-course",
  label: "Session of course",
  inverseLabel: "course of session",
  description: "",
  fromType: "session",
  toType: "course",
};

const link = (from: string, to: string, relationshipType: string) => ({
  ...base,
  id: `${from}-${to}`,
  fromEntityId: from,
  toEntityId: to,
  relationshipType,
});

type Link = ReturnType<typeof link>;

function openPicker({
  entityType = "note",
  types = [RELATES],
  relationships = (): Link[] => [],
  onSelect = () => {},
}: {
  entityType?: string;
  types?: RelationshipTypeInfo[];
  relationships?: (entityId: string) => Link[];
  onSelect?: (target: { id: string }, type: string, reverse: boolean) => void;
} = {}) {
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
    makeEntity({
      id: "course-1",
      type: "course",
      title: "Physics",
      updatedAt: "2026-01-01T00:00:00Z",
    }),
    makeEntity({ id: "me", type: entityType, title: "This one" }),
  ]);
  mockCommand("list_sessions", [
    makeSession({ courseTitle: "Physics", date: "2026-03-10" }, { id: "s1" }),
  ]);
  mockCommandWith("list_relationships", (args) =>
    relationships(args && "entityId" in args ? String(args.entityId) : ""),
  );
  return renderWithProviders(
    <RelatePicker
      spaceId="space-1"
      exclude="me"
      entityType={entityType}
      types={types}
      onSelect={onSelect}
    />,
  );
}

const SEARCH = "Search what to relate to…";

/// Opens the picker on the step that asks what type of thing to relate to, and walks to
/// the list of items of `type` through the relationship step when there is one.
async function toItems(
  user: ReturnType<typeof openPicker>["user"],
  type: string,
  relation?: string,
) {
  await user.click(await screen.findByRole("option", { name: new RegExp(`^${type}`) }));
  if (relation) await user.click(await screen.findByRole("option", { name: new RegExp(relation) }));
}

describe("RelatePicker, step 1: what type of thing", () => {
  it("opens on the types there is something to relate to, with how many, and no items yet", async () => {
    openPicker();
    expect(await screen.findByRole("option", { name: /^Note.*2/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /^Task.*1/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /^Session.*1/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /^Course.*1/ })).toBeTruthy();
    // The items come on the last step.
    expect(screen.queryByText("Wave notes")).toBeNull();
  });

  it("never counts the item itself", async () => {
    openPicker({ entityType: "task" });
    // Two tasks exist, one of them the item being related.
    expect(await screen.findByRole("option", { name: /^Task.*1/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^Task.*2/ })).toBeNull();
  });

  it("leaves out a type the relations cannot point at", async () => {
    openPicker({ types: [{ ...RELATES, toType: "course" }] });
    await screen.findByRole("option", { name: /^Course/ });
    expect(screen.queryByRole("option", { name: /^Note/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /^Task/ })).toBeNull();
  });

  it("filters the types as you type", async () => {
    const { user } = openPicker();
    await user.type(await screen.findByPlaceholderText("Search types…"), "tas");
    expect(screen.getByRole("option", { name: /^Task/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^Note/ })).toBeNull();
  });
});

describe("RelatePicker, step 2: how", () => {
  const BLOCKS: RelationshipTypeInfo = {
    ...RELATES,
    name: "blocks",
    label: "Blocks",
    inverseLabel: "Blocked by",
  };

  it("asks how when more than one relation fits, most specific first", async () => {
    const { user } = openPicker({ entityType: "session", types: [RELATES, SESSION_COURSE] });
    await user.click(await screen.findByRole("option", { name: /^Course/ }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Session of course"),
      expect.stringContaining("Related to"),
    ]);
  });

  it("skips the step when only one relation fits, and says which one it is", async () => {
    const { user } = openPicker();
    await user.click(await screen.findByRole("option", { name: /^Note/ }));
    // Straight to the items, with the choices made so far on top.
    expect(await screen.findByText("Wave notes")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Relation" })).toHaveTextContent(
      /Note.*Related to/,
    );
  });

  it("lists every way to link, the reverse ones included", async () => {
    const { user } = openPicker({ types: [RELATES, BLOCKS] });
    await user.click(await screen.findByRole("option", { name: /^Note/ }));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual([
      expect.stringContaining("Related to"),
      expect.stringContaining("Blocks"),
      expect.stringContaining("Blocked by"),
    ]);
  });
});

describe("RelatePicker, step 3: which one", () => {
  it("lists only items of the chosen type, with a second line saying what they are", async () => {
    const { user } = openPicker();
    await toItems(user, "Note");
    expect(await screen.findByText("Wave notes")).toBeTruthy();
    expect(screen.getByText("Heat notes")).toBeTruthy();
    expect(screen.queryByText("Read chapter")).toBeNull();
    const row = screen.getByText("Wave notes").closest("[cmdk-item]");
    if (!(row instanceof HTMLElement)) throw new Error("the row is missing");
    expect(within(row).getByText(/^Note/)).toBeTruthy();
  });

  it("finds a session by its course and shows the course and time on the row", async () => {
    const { user } = openPicker();
    await toItems(user, "Session");
    expect(await screen.findByText(/Physics, /)).toBeTruthy();
    await user.type(screen.getByPlaceholderText(SEARCH), "physics");
    expect(screen.getByText(/Physics, /)).toBeTruthy();
  });

  it.each(["mar 10", "10 march", "tuesday", "tue", "9:00", "9am", "2026-03-10", "physics tue"])(
    "finds a session by %s",
    async (query) => {
      const { user } = openPicker();
      await toItems(user, "Session");
      await user.type(await screen.findByPlaceholderText(SEARCH), query);
      expect(await screen.findByText(/Physics, /)).toBeTruthy();
    },
  );

  it.each(["mar 11", "monday", "9pm", "november"])(
    "does not find that session by %s",
    async (query) => {
      const { user } = openPicker();
      await toItems(user, "Session");
      await user.type(await screen.findByPlaceholderText(SEARCH), query);
      expect(await screen.findByText("No matches.")).toBeTruthy();
      expect(screen.queryByText(/Physics, /)).toBeNull();
    },
  );

  it("links with the relation that was chosen", async () => {
    const onSelect = vi.fn();
    const { user } = openPicker({
      entityType: "session",
      types: [RELATES, SESSION_COURSE],
      onSelect,
    });
    await toItems(user, "Course", "Session of course");
    await user.click(await screen.findByText("Physics"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]).toMatchObject([{ id: "course-1" }, "session-course", false]);
  });

  it("links with a reverse relation the way it points", async () => {
    const onSelect = vi.fn();
    const blocks: RelationshipTypeInfo = {
      ...RELATES,
      name: "blocks",
      label: "Blocks",
      inverseLabel: "Blocked by",
    };
    const { user } = openPicker({ types: [RELATES, blocks], onSelect });
    await toItems(user, "Note", "Blocked by");
    await user.click(await screen.findByText("Wave notes"));
    expect(onSelect.mock.calls[0]).toMatchObject([{ id: "n1" }, "blocks", true]);
  });

  it("suggests the course's notes first before anything is typed, then the most recent", async () => {
    const { user } = openPicker({
      entityType: "session",
      relationships: (id) =>
        id === "me"
          ? [link("me", "course-1", "session-course")]
          : id === "course-1"
            ? [link("course-1", "n1", "course-notes")]
            : [],
    });
    await toItems(user, "Note");
    const suggested = await screen.findByRole("group", { name: "Suggested" });
    expect(within(suggested).getByText("Wave notes")).toBeTruthy();
    const recent = screen.getByRole("group", { name: "Recent" });
    expect(within(recent).getByText("Heat notes")).toBeTruthy();
    expect(within(recent).queryByText("Wave notes")).toBeNull();
  });

  it("drops the headings and shows one ranked list once something is typed", async () => {
    const { user } = openPicker({
      entityType: "session",
      relationships: (id) =>
        id === "me"
          ? [link("me", "course-1", "session-course")]
          : id === "course-1"
            ? [link("course-1", "n1", "course-notes")]
            : [],
    });
    await toItems(user, "Note");
    await screen.findByRole("group", { name: "Suggested" });
    await user.type(screen.getByPlaceholderText(SEARCH), "heat");
    expect(screen.queryByRole("group", { name: "Suggested" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Recent" })).toBeNull();
    expect(screen.getByText("Heat notes")).toBeTruthy();
    expect(screen.queryByText("Wave notes")).toBeNull();
  });
});

describe("RelatePicker, going back", () => {
  it("steps back with the Back button, one step at a time", async () => {
    const BLOCKS: RelationshipTypeInfo = {
      ...RELATES,
      name: "blocks",
      label: "Blocks",
      inverseLabel: "Blocked by",
    };
    const { user } = openPicker({ types: [RELATES, BLOCKS] });
    await toItems(user, "Note", "Blocks");
    await screen.findByText("Wave notes");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("option", { name: /Blocks/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("option", { name: /^Task/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("goes back past a skipped step to the types", async () => {
    const { user } = openPicker();
    await toItems(user, "Note");
    await screen.findByText("Wave notes");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("option", { name: /^Task/ })).toBeTruthy();
  });

  it("goes back with Backspace in an empty search", async () => {
    const { user } = openPicker();
    await toItems(user, "Note");
    await user.click(await screen.findByPlaceholderText(SEARCH));
    await user.keyboard("{Backspace}");
    expect(await screen.findByRole("option", { name: /^Task/ })).toBeTruthy();
  });
});
