import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import type { PageSummary } from "#/lib/api/types.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { JotsListView } from "./JotsListView";

const KEY = `${STORAGE_KEYS.jotsQuickFilters}:space-1`;

function jot(id: string, title: string, lastEditedAt: string): PageSummary {
  return {
    entity: makeEntity({ id, type: "jot", title }),
    preview: "",
    lastEditedAt,
    labelIds: [],
    linked: [],
    session: null,
    courses: [],
  };
}

beforeEach(() => {
  installTauriMock();
  preferences.remove(KEY);
  preferences.remove(STORAGE_KEYS.jotsPreset);
  mockCommand("list_labels", []);
  mockCommand("list_spaces", []);
  mockCommand("list_jot_summaries", [
    jot("j1", "Recent idea", new Date().toISOString()),
    jot("j2", "Old idea", "2020-01-01T00:00:00.000Z"),
  ]);
});
afterEach(uninstallTauriMock);

describe("quick filters on the Jots page", () => {
  it("stars a field, and picks its options from the bar", async () => {
    const { user } = renderWithProviders(<JotsListView spaceId="space-1" />);
    await screen.findByText("Recent idea");
    await user.click(screen.getByRole("button", { name: /^All/ }));
    expect(await screen.findByText("Old idea")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(await screen.findByLabelText("Add Last edited to Quick Filters"));
    expect(JSON.parse(preferences.get(KEY) ?? "[]")).toEqual(["edited"]);
    await user.keyboard("{Escape}");

    const bar = screen.getByRole("group", { name: "Quick filters" });
    await user.click(within(bar).getByRole("button", { name: "Last edited" }));
    await user.click(await screen.findByRole("option", { name: "Past 7 days" }));
    expect(screen.queryByText("Old idea")).toBeNull();
    expect(screen.getByText("Recent idea")).toBeInTheDocument();
  });
});
