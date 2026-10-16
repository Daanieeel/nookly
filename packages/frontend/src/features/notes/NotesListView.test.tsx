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

  it("stars a filter into the bar, which filters with one click from then on", async () => {
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" filterCourseId="c1" />);
    await screen.findByText("Sorting lecture");
    await user.click(screen.getByRole("button", { name: "Quick Filter" }));
    expect(JSON.parse(preferences.get(KEY) ?? "[]")).toEqual([
      { fieldId: "course", operator: "is", values: ["c1"] },
    ]);
    await user.click(screen.getByRole("button", { name: "Remove Filter" }));
    await screen.findByText("Groceries");

    const bar = screen.getByRole("group", { name: "Quick filters" });
    await user.click(within(bar).getByRole("button", { name: "Algorithms" }));
    await waitFor(() => expect(screen.queryByText("Groceries")).toBeNull());
    expect(screen.getByText("Sorting lecture")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Algorithms" }));
    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    expect(rowTitles()).toHaveLength(3);
  });

  it("shows what was saved before, and removes a favourite from the bar", async () => {
    preferences.set(KEY, JSON.stringify([{ fieldId: "course", operator: "is", values: ["c2"] }]));
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" />);
    const bar = await screen.findByRole("group", { name: "Quick filters" });
    await user.click(within(bar).getByRole("button", { name: "Remove Quick Filter Databases" }));
    expect(screen.queryByRole("group", { name: "Quick filters" })).toBeNull();
    expect(preferences.get(KEY)).toBeNull();
  });

  it("keeps each Space's favourites apart", async () => {
    preferences.set(KEY, JSON.stringify([{ fieldId: "course", operator: "is", values: ["c2"] }]));
    renderWithProviders(<NotesListView spaceId="space-2" />);
    await screen.findByText("Groceries");
    expect(screen.queryByRole("group", { name: "Quick filters" })).toBeNull();
  });
});
