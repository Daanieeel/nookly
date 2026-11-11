import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import type { Entity, PageSummary } from "#/lib/api/types.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeEntity } from "#/test/fixtures.ts";
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
  mockCommand("list_labels", []);
  mockCommand("list_note_summaries", [
    note("n1", "Sorting lecture", [algorithms]),
    note("n2", "Joins lecture", [databases]),
    note("n3", "Groceries"),
  ]);
});
afterEach(uninstallTauriMock);

const rowTitles = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).queryByText(/lecture|Groceries/)?.textContent);

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
