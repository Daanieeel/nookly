import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { QuickOpenPalette, SearchPalette } from "#/components/search-palette.tsx";
import type { SearchRequest } from "#/lib/api/search.ts";
import type { SearchHit } from "#/lib/api/types.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeEntity, makeLabel, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, calledCommands, mockCommand, mockCommandWith } from "#/test/tauri.ts";

function hit(patch: Partial<SearchHit>): SearchHit {
  return {
    entityId: "e1",
    spaceId: "space-1",
    title: "Quarterly plan",
    type: "note",
    icon: null,
    key: "NOT-1",
    blockId: null,
    snippet: null,
    blockEntityId: null,
    ...patch,
  };
}

const SPACES = [
  makeSpace({ id: "space-1", name: "Work" }),
  makeSpace({ id: "space-2", name: "Study", position: 1 }),
];

/// The `request` of every search so far, as the backend received it.
function requestsOf(): SearchRequest[] {
  return callsOf("search").map((args) => JSON.parse(JSON.stringify(args)).request);
}

beforeEach(() => {
  useNavStore.setState({ recents: [], paletteOpen: false, switcherOpen: false });
  mockCommand("list_spaces", SPACES);
  mockCommand("list_space_modules", ["notes", "tasks"]);
  mockCommand("search", []);
  mockCommand("list_entities_by_ids", []);
});

async function openSearch() {
  const rendered = renderWithProviders(<SearchPalette />);
  act(() => useNavStore.getState().setPaletteOpen(true));
  const input = await screen.findByPlaceholderText("Search, create, or jump anywhere…");
  return { ...rendered, input };
}

describe("opening the search palette", () => {
  it("loads nothing but Recents, and no labels, entities or search", async () => {
    useNavStore.setState({ recents: [{ entityId: "e9", spaceId: "space-1", openedAt: 1 }] });
    mockCommand("list_entities_by_ids", [
      makeEntity({ id: "e9", title: "Last opened", type: "note" }),
    ]);
    await openSearch();
    expect(await screen.findByText("Last opened")).toBeTruthy();
    const loaded = calledCommands();
    expect(loaded).toContain("list_entities_by_ids");
    expect(loaded).not.toContain("list_entities");
    expect(loaded).not.toContain("list_labels");
    expect(loaded).not.toContain("list_entity_label_ids");
    expect(loaded).not.toContain("search");
  });

  it("hints at the typed filters", async () => {
    await openSearch();
    expect(await screen.findByText(/to search one Space/)).toBeTruthy();
  });
});

describe("typing a search", () => {
  it("asks the backend at once, once per keystroke, with no pause", async () => {
    const { user, input } = await openSearch();
    await user.type(input, "pl");
    await waitFor(() => expect(requestsOf().map((r) => r.query)).toContain("pl"));
    expect(requestsOf().map((r) => r.query)).toEqual(["p", "pl"]);
    expect(requestsOf()[0]).toMatchObject({ titlesOnly: false, limit: 50 });
  });

  it("lists one ranked row per result, with its Space and snippet, and no groups", async () => {
    mockCommand("search", [
      hit({ entityId: "e1", title: "Plan A" }),
      hit({
        entityId: "e2",
        title: "Budget",
        spaceId: "space-2",
        blockId: "b1",
        blockEntityId: "e2",
        snippet: "the \u0001plan\u0002 for May",
      }),
    ]);
    const { user, input } = await openSearch();
    await user.type(input, "plan");
    expect(await screen.findByText("Budget")).toBeTruthy();
    expect(screen.getByText("Study")).toBeTruthy();
    expect(screen.getByText(/for May/)).toBeTruthy();
    expect(screen.queryByText(/View all/)).toBeNull();
    const rows = screen.getAllByRole("option");
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
  });

  it("opens the top hit with Enter", async () => {
    mockCommand("search", [hit({ entityId: "e1", title: "Plan A" })]);
    mockCommand("touch_entity_opened", null);
    const { user, input } = await openSearch();
    await user.type(input, "plan");
    await screen.findByRole("option", { name: /Plan\s*A/ });
    await waitFor(() =>
      expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true"),
    );
    await user.keyboard("{Enter}");
    expect(useNavStore.getState().view).toEqual({
      kind: "entity",
      entityId: "e1",
      spaceId: "space-1",
    });
    expect(useNavStore.getState().paletteOpen).toBe(false);
  });

  it("opens the highlighted hit in a new tab with Cmd+Enter", async () => {
    mockCommand("search", [hit({ entityId: "e1", title: "Plan A" })]);
    const tabsBefore = useNavStore.getState().groups.flatMap((g) => g.tabs).length;
    const { user, input } = await openSearch();
    await user.type(input, "plan");
    await screen.findByRole("option", { name: /Plan\s*A/ });
    await waitFor(() =>
      expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true"),
    );
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    const state = useNavStore.getState();
    expect(state.view).toEqual({ kind: "entity", entityId: "e1", spaceId: "space-1" });
    expect(state.groups.flatMap((g) => g.tabs)).toHaveLength(tabsBefore + 1);
  });

  it("opens the highlighted hit in the other split group with Cmd+Option+Enter", async () => {
    mockCommand("search", [hit({ entityId: "e1", title: "Plan A" })]);
    const { user, input } = await openSearch();
    await user.type(input, "plan");
    await screen.findByRole("option", { name: /Plan\s*A/ });
    await waitFor(() =>
      expect(screen.getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true"),
    );
    await user.keyboard("{Meta>}{Alt>}{Enter}{/Alt}{/Meta}");
    const { groups, focusedGroupId } = useNavStore.getState();
    expect(groups).toHaveLength(2);
    const focused = groups.find((g) => g.id === focusedGroupId);
    expect(focused?.tabs.map((t) => t.view)).toContainEqual({
      kind: "entity",
      entityId: "e1",
      spaceId: "space-1",
    });
  });

  it("says when nothing matches", async () => {
    const { user, input } = await openSearch();
    await user.type(input, "zzz");
    expect(await screen.findByText("Nothing matches “zzz”.")).toBeTruthy();
  });
});

describe("type tabs", () => {
  it("cycle with Tab and Shift+Tab, and narrow the search to that type", async () => {
    const { user, input } = await openSearch();
    await user.type(input, "plan");
    await user.keyboard("{Tab}");
    expect(screen.getByRole("tab", { name: "Notes" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(requestsOf().at(-1)).toMatchObject({ types: ["note"] }));
    await user.keyboard("{Tab}");
    expect(screen.getByRole("tab", { name: "Tasks" }).getAttribute("aria-selected")).toBe("true");
    expect(requestsOf().at(-1)).toMatchObject({ types: ["task", "sub_task"] });
    await user.keyboard("{Shift>}{Tab}{/Shift}{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(requestsOf().at(-1)?.types).toBeUndefined());
  });
});

describe("typed filters", () => {
  it("suggests Spaces after in: and turns the pick into a chip that narrows the search", async () => {
    const { user, input } = await openSearch();
    await user.type(input, "in:Stu");
    await user.click(await screen.findByText("Study"));
    expect(screen.getByRole("button", { name: /in:Study/ })).toBeTruthy();
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
    await user.type(input, "plan");
    await waitFor(() =>
      expect(requestsOf().at(-1)).toMatchObject({ query: "plan", spaceId: "space-2" }),
    );
  });

  it("loads labels only once # is typed, and sends the label by name", async () => {
    mockCommandWith("list_labels", () => [makeLabel({ id: "l1", name: "Urgent" })]);
    const { user, input } = await openSearch();
    await user.type(input, "pl");
    expect(calledCommands()).not.toContain("list_labels");
    await user.type(input, " #urg");
    await user.click(await screen.findByText("Urgent"));
    expect(screen.getByRole("button", { name: /#Urgent/ })).toBeTruthy();
    await waitFor(() =>
      expect(requestsOf().at(-1)).toMatchObject({ query: "pl", labels: ["Urgent"] }),
    );
  });

  it("makes a chip of a finished in: word, and Backspace removes the chip", async () => {
    const { user, input } = await openSearch();
    await user.type(input, "in:work ");
    expect(screen.getByRole("button", { name: /in:Work/ })).toBeTruthy();
    await user.keyboard("{Backspace}");
    expect(screen.queryByRole("button", { name: /in:Work/ })).toBeNull();
  });
});

describe("quick open", () => {
  it("searches titles only, without a body search or preloading every entity", async () => {
    mockCommand("search", [hit({ entityId: "e1", title: "Plan A" })]);
    renderWithProviders(<QuickOpenPalette />);
    act(() => useNavStore.getState().setSwitcherOpen(true));
    const input = await screen.findByPlaceholderText("Jump to…");
    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.setup({ delay: null }).type(input, "pla");
    await screen.findByRole("option", { name: /Plan\s*A/ });
    expect(requestsOf().at(-1)).toMatchObject({ query: "pla", titlesOnly: true });
    expect(calledCommands()).not.toContain("list_entities");
    expect(calledCommands()).not.toContain("list_embedded_page_ids");
  });
});

describe("palettes have no axe violations", () => {
  it("search, with results and with filters", async () => {
    mockCommand("search", [
      hit({ entityId: "e1", title: "Plan A", snippet: "the \u0001plan\u0002" }),
    ]);
    const { user, input } = await openSearch();
    await user.type(input, "in:work plan");
    await screen.findByRole("option", { name: /Plan\s*A/ });
    await expectNoA11yViolations();
  });

  it("search, empty", async () => {
    await openSearch();
    await screen.findByText(/to search one Space/);
    await expectNoA11yViolations();
  });

  it("quick open", async () => {
    renderWithProviders(<QuickOpenPalette />);
    act(() => useNavStore.getState().setSwitcherOpen(true));
    await screen.findByPlaceholderText("Jump to…");
    await expectNoA11yViolations();
  });
});
