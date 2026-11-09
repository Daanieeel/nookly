import { screen, waitFor, within } from "@testing-library/react";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Entity, PageSummary } from "#/lib/api/types.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import {
  callsOf,
  installTauriMock,
  mockCommand,
  mockCommandWith,
  uninstallTauriMock,
} from "#/test/tauri.ts";
import { JotsListView } from "./JotsListView";
import { NotesListView } from "./NotesListView";

/// Saved Views of the Notes and Jots pages: the same table, opened on what the View saved.

const configOf = (args: InvokeArgs | undefined) =>
  z.object({ config: z.string() }).parse(args).config;

const algorithms = makeEntity({ id: "c1", type: "course", title: "Algorithms", key: "CRS-1" });

function page(
  type: "note" | "jot",
  id: string,
  title: string,
  patch: Partial<PageSummary> = {},
): PageSummary {
  return {
    entity: makeEntity({ id, type, title, spaceId: "space-1" }),
    preview: "",
    lastEditedAt: "2026-10-01T10:00:00.000Z",
    labelIds: [],
    linked: [],
    session: null,
    courses: [],
    ...patch,
  };
}

/// A View config as the backend stores it, with a key from a newer Nookly where asked.
interface StoredConfig {
  version: number;
  source: "note" | "jot";
  filters: { fieldId: string; operator: string; values: string[] }[];
  display?: { table: { sort: { field: string; direction: string }[]; columns: unknown[] } };
  future?: { kept: boolean };
}

function savedView(module: "notes" | "jots", config: StoredConfig) {
  const view = {
    entity: makeEntity({ id: "v1", type: "view", title: "Lectures", spaceId: "space-1" }),
    module,
    config: JSON.stringify(config),
    position: 0,
  };
  mockCommand("get_view", view);
  mockCommandWith("update_view_config", (args) => ({ ...view, config: configOf(args) }));
}

const titles = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).queryByText(/lecture|Groceries|idea/)?.textContent);

beforeEach(() => {
  installTauriMock();
  preferences.remove(STORAGE_KEYS.jotsPreset);
  preferences.remove(STORAGE_KEYS.notesSort);
  mockCommand("list_labels", []);
  mockCommand("list_spaces", []);
  mockCommand("list_note_summaries", [
    page("note", "n1", "Sorting lecture", { courses: [algorithms] }),
    page("note", "n2", "Graphs lecture", {
      courses: [algorithms],
      lastEditedAt: "2026-10-02T10:00:00.000Z",
    }),
    page("note", "n3", "Groceries"),
  ]);
});
afterEach(uninstallTauriMock);

describe("a saved View of the Notes page", () => {
  it("opens with its name, filters and sort", async () => {
    savedView("notes", {
      version: 2,
      source: "note",
      filters: [{ fieldId: "course", operator: "is", values: ["c1"] }],
      display: { table: { sort: [{ field: "title", direction: "asc" }], columns: [] } },
    });
    renderWithProviders(<NotesListView spaceId="space-1" viewId="v1" />);
    await waitFor(() => expect(titles()).toEqual(["Graphs lecture", "Sorting lecture"]));
    expect(screen.getByRole("textbox", { name: "View name" })).toHaveValue("Lectures");
  });

  it("keeps changes as a draft until saved, and keeps what it can not read", async () => {
    const future = { kept: true };
    savedView("notes", {
      version: 2,
      source: "note",
      future,
      filters: [
        { fieldId: "course", operator: "is", values: ["c1"] },
        { fieldId: "edited", operator: "withinNext", values: ["3"] },
      ],
      display: { table: { sort: [], columns: [{ field: "title", width: 300 }] } },
    });
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" viewId="v1" />);
    await waitFor(() => expect(titles()).toHaveLength(2));
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Remove Filter" }));
    await waitFor(() => expect(titles()).toHaveLength(3));
    const bar = screen.getByRole("region", { name: "Unsaved changes" });
    expect(within(bar).getByText("Unsaved changes to this view")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Save view" }));

    await waitFor(() => expect(callsOf("update_view_config")).toHaveLength(1));
    const saved = JSON.parse(configOf(callsOf("update_view_config")[0]));
    expect(saved.future).toEqual(future);
    expect(saved.source).toBe("note");
    expect(saved.filters).toEqual([{ fieldId: "edited", operator: "withinNext", values: ["3"] }]);
    expect(saved.display.table.columns).toEqual([{ field: "title", width: 300 }]);
  });

  it("shows only what its conditions keep, as chips to adjust", async () => {
    savedView("notes", {
      version: 2,
      source: "note",
      filters: [{ fieldId: "title", operator: "contains", values: ["lecture"] }],
    });
    renderWithProviders(<NotesListView spaceId="space-1" viewId="v1" />);
    await waitFor(() => expect(titles()).toEqual(["Graphs lecture", "Sorting lecture"]));
    expect(screen.getByText("contains")).toBeInTheDocument();
  });

  it("saves a new sort into the View, not into the page's own", async () => {
    savedView("notes", { version: 2, source: "note", filters: [] });
    const { user } = renderWithProviders(<NotesListView spaceId="space-1" viewId="v1" />);
    await waitFor(() => expect(titles()).toHaveLength(3));
    await user.click(screen.getByRole("button", { name: "Sort by Title" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Ascending" }));
    const bar = await screen.findByRole("region", { name: "Unsaved changes" });
    await user.click(within(bar).getByRole("button", { name: "Save view" }));

    await waitFor(() => expect(callsOf("update_view_config")).toHaveLength(1));
    const saved = JSON.parse(configOf(callsOf("update_view_config")[0]));
    expect(saved.display.table.sort).toEqual([{ field: "title", direction: "asc" }]);
    expect(preferences.get(STORAGE_KEYS.notesSort)).toBeNull();
  });

  it("leaves the plain page as it was, with no save bar while filtering", async () => {
    const { user } = renderWithProviders(
      <NotesListView spaceId="space-1" filterCourseId={algorithms.id} />,
    );
    await waitFor(() => expect(titles()).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Remove Filter" }));
    await waitFor(() => expect(titles()).toHaveLength(3));
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  });
});

describe("a saved View of the Jots page", () => {
  beforeEach(() => {
    const note: Entity = makeEntity({ id: "n9", type: "note", title: "Clean copy" });
    mockCommand("list_jot_summaries", [
      page("jot", "j1", "Raw idea"),
      page("jot", "j2", "Refined idea", { linked: [note] }),
    ]);
  });

  it("opens on its own filters, not on the last picked preset", async () => {
    preferences.set(STORAGE_KEYS.jotsPreset, "unrefined");
    savedView("jots", {
      version: 2,
      source: "jot",
      filters: [{ fieldId: "link", operator: "is", values: ["linked"] }],
    });
    const { user } = renderWithProviders(<JotsListView spaceId="space-1" viewId="v1" />);
    await waitFor(() => expect(titles()).toEqual(["Refined idea"]));
    expect(screen.getByRole("button", { name: /^Refined/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // A preset changes the View's draft, and leaves the page's own choice alone.
    await user.click(screen.getByRole("button", { name: /^All/ }));
    await waitFor(() => expect(titles()).toHaveLength(2));
    expect(preferences.get(STORAGE_KEYS.jotsPreset)).toBe("unrefined");
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeInTheDocument();
  });
});
