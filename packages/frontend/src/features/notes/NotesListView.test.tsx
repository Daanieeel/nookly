import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import type { Entity, PageSummary } from "#/lib/api/types.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeEntity, makeLabel } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { NotesListView } from "./NotesListView";

const KEY = `${STORAGE_KEYS.notesQuickFilters}:space-1`;
const algorithms = makeEntity({ id: "c1", type: "course", title: "Algorithms", key: "CRS-1" });
const databases = makeEntity({ id: "c2", type: "course", title: "Databases", key: "CRS-2" });

function note(id: string, title: string, courses: Entity[] = []): PageSummary {
  return {
    entity: makeEntity({ id, type: "note", title }),
    preview: "",
    lastEditedAt: "2026-10-01T10:00:00.000Z",
    labelIds: [],
    linked: [],
    session: null,
    courses,
  };
}

beforeEach(() => {
  installTauriMock();
  preferences.remove(KEY);
  // These tests are about the table; the default layout has its own tests below.
  preferences.set(STORAGE_KEYS.notesLayout, "table");
  mockCommand("list_labels", []);
  mockCommand("list_note_summaries", [
    note("n1", "Sorting lecture", [algorithms]),
    note("n2", "Joins lecture", [databases]),
    note("n3", "Groceries"),
  ]);
});
afterEach(uninstallTauriMock);

// The table groups its rows under a heading per course, which are rows too.
const rowTitles = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).queryByText(/lecture|Groceries/)?.textContent)
    .filter(Boolean);

describe("quick filters on the Notes page", () => {
  it("opens on the course a link asked for", async () => {
    renderWithProviders(<NotesListView spaceId="space-1" filterCourseId="c2" />);
    await screen.findByText("Joins lecture");
    expect(screen.queryByText("Sorting lecture")).toBeNull();
    expect(screen.queryByText("Groceries")).toBeNull();
  });

  it("keeps the applied filters on a row of their own, with Clear filters left of the Filter button", async () => {
    renderWithProviders(<NotesListView spaceId="space-1" filterCourseId="c1" />);
    await screen.findByText("Sorting lecture");
    const filter = screen.getByRole("button", { name: "Filter" });
    const clear = screen.getByRole("button", { name: "Clear filters" });
    const chips = screen.getByRole("button", { name: "Remove Filter" }).closest("div.flex-wrap");
    expect(chips).not.toContainElement(filter);
    expect(chips).not.toContainElement(clear);
    expect(clear.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filter.parentElement).toContainElement(clear);
  });

  it("stars a field into the bar, which opens its options from then on", async () => {
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" />);
    await screen.findByText("Groceries");
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(await screen.findByLabelText("Add Course to Quick Filters"));
    expect(JSON.parse(preferences.get(KEY) ?? "[]")).toEqual(["course"]);
    await user.keyboard("{Escape}");

    const bar = screen.getByRole("group", { name: "Quick filters" });
    await user.click(within(bar).getByRole("button", { name: "Course" }));
    await user.click(await screen.findByRole("option", { name: /Algorithms/ }));
    await waitFor(() => expect(screen.queryByText("Groceries")).toBeNull());
    expect(screen.getByText("Sorting lecture")).toBeInTheDocument();
    // The filter has its chip now, so the field leaves the bar until the chip is removed.
    expect(screen.queryByRole("group", { name: "Quick filters" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove Filter" }));
    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Course" })).toBeInTheDocument();
    expect(rowTitles()).toHaveLength(3);
  });

  it("shows what was saved before, and removes a favourite from the bar", async () => {
    preferences.set(KEY, JSON.stringify(["course"]));
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" />);
    const bar = await screen.findByRole("group", { name: "Quick filters" });
    await user.click(within(bar).getByRole("button", { name: "Remove Course from Quick Filters" }));
    expect(screen.queryByRole("group", { name: "Quick filters" })).toBeNull();
    expect(preferences.get(KEY)).toBeNull();
  });

  it("still shows a favourite saved as a whole filter by an earlier version", async () => {
    preferences.set(KEY, JSON.stringify([{ fieldId: "course", operator: "is", values: ["c2"] }]));
    renderWithProviders(<NotesListView spaceId="space-1" />);
    const bar = await screen.findByRole("group", { name: "Quick filters" });
    expect(within(bar).getByRole("button", { name: "Course" })).toBeInTheDocument();
  });

  it("keeps each Space's favourites apart", async () => {
    preferences.set(KEY, JSON.stringify(["course"]));
    renderWithProviders(<NotesListView spaceId="space-2" />);
    await screen.findByText("Groceries");
    expect(screen.queryByRole("group", { name: "Quick filters" })).toBeNull();
  });
});

describe("the default Notes layout", () => {
  beforeEach(() => preferences.remove(STORAGE_KEYS.notesLayout));

  it("shows cards under a heading per course, with notes of no course last", async () => {
    renderWithProviders(<NotesListView spaceId="space-1" />);
    await screen.findByText("Sorting lecture");
    const headings = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(headings).toEqual(["Algorithms", "Databases", "No course"]);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lets a card's footer shrink so long labels never push the edit time out of the card", async () => {
    mockCommand("list_labels", [
      makeLabel({ id: "l1", name: "A very long label name" }),
      makeLabel({ id: "l2", name: "Another long label" }),
      makeLabel({ id: "l3", name: "Third" }),
    ]);
    mockCommand("list_note_summaries", [
      { ...note("n1", "Sorting lecture", [algorithms]), labelIds: ["l1", "l2", "l3"] },
    ]);
    renderWithProviders(<NotesListView spaceId="space-1" />);
    const title = await screen.findByText("Sorting lecture");
    const card = title.closest("button");
    const footer = card?.lastElementChild;
    expect(footer).toHaveClass("min-w-0");
    const labels = (await screen.findByText("A very long label name")).closest("span.flex");
    expect(labels).toHaveClass("min-w-0");
    expect(screen.getByText("+1")).toHaveClass("shrink-0");
  });

  it("folds a course away on its header", async () => {
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" />);
    await screen.findByText("Sorting lecture");
    await user.click(
      within(screen.getByRole("region", { name: "Algorithms" })).getByRole("button", {
        name: /Algorithms/,
      }),
    );
    expect(screen.queryByText("Sorting lecture")).toBeNull();
    expect(screen.getByText("Joins lecture")).toBeInTheDocument();
  });

  it("picks the layout from Display, and remembers it", async () => {
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" />);
    await screen.findByText("Sorting lecture");
    await user.click(screen.getByRole("button", { name: "Display" }));
    await user.click(await screen.findByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(preferences.get(STORAGE_KEYS.notesLayout)).toBe("table");
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(preferences.get(STORAGE_KEYS.notesLayout)).toBe("list");
  });

  it("hides properties from Display, on the cards and in the table", async () => {
    mockCommand("list_note_summaries", [
      { ...note("n1", "Sorting lecture"), preview: "Quicksort and friends" },
    ]);
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" />);
    expect(await screen.findByText("Quicksort and friends")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Display" }));
    await user.click(await screen.findByRole("button", { name: "Preview" }));
    expect(screen.queryByText("Quicksort and friends")).toBeNull();
    expect(JSON.parse(preferences.get(STORAGE_KEYS.notesHidden) ?? "[]")).toEqual(["preview"]);
    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.queryByRole("columnheader", { name: "Preview" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: /Last edited/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Last edited" }));
    expect(screen.queryByRole("columnheader", { name: /Last edited/ })).toBeNull();
  });

  it("groups by label, and remembers it, from Display", async () => {
    mockCommand("list_labels", [makeLabel({ id: "l1", name: "Exam" })]);
    mockCommand("list_note_summaries", [
      { ...note("n1", "Sorting lecture", [algorithms]), labelIds: ["l1"] },
      note("n2", "Joins lecture", [databases]),
    ]);
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" />);
    await screen.findByText("Sorting lecture");
    await user.click(screen.getByRole("button", { name: "Display" }));
    await user.click(await screen.findByRole("combobox", { name: "Group by" }));
    await user.click(await screen.findByRole("option", { name: "Label" }));
    await waitFor(() => {
      const headings = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
      expect(headings).toEqual(["Exam", "No label"]);
    });
    expect(preferences.get(STORAGE_KEYS.notesGroupBy)).toBe("label");
  });

  it("lists every note together when not grouping", async () => {
    preferences.set(STORAGE_KEYS.notesGroupBy, "none");
    renderWithProviders(<NotesListView spaceId="space-1" />);
    await screen.findByText("Sorting lecture");
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual([
      "All notes",
    ]);
  });

  it("hides the Continue row from Display", async () => {
    mockCommand(
      "list_note_summaries",
      [1, 2, 3, 4, 5].map((i) => note(`m${i}`, `Memo ${i}`)),
    );
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" />);
    expect(await screen.findByRole("region", { name: "Continue" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Display" }));
    await user.click(await screen.findByRole("switch", { name: 'Show category "Continue"' }));
    expect(screen.queryByRole("region", { name: "Continue" })).toBeNull();
    expect(preferences.get(STORAGE_KEYS.notesContinue)).toBe("off");
  });

  it("offers Continue only once there are more notes than it would show", async () => {
    mockCommand(
      "list_note_summaries",
      [1, 2, 3, 4, 5].map((i) => note(`m${i}`, `Memo ${i}`)),
    );
    renderWithProviders(<NotesListView spaceId="space-1" />);
    expect(await screen.findByRole("region", { name: "Continue" })).toBeInTheDocument();
  });
});

describe("an empty Notes page", () => {
  // It sat flush against the page's edges, without the list's own padding.
  it("keeps the same padding as the list", async () => {
    mockCommand("list_note_summaries", []);
    renderWithProviders(<NotesListView spaceId="space-1" />);
    const heading = await screen.findByRole("heading", { name: "Notes" });
    expect(heading.parentElement?.className).toMatch(/\bp-6\b/);
  });
});
