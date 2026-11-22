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
    await user.click(screen.getByRole("button", { name: /^Show refined/ }));
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

describe("the Jots toolbar", () => {
  it("keeps the filter chips away while a one click view is all that is set", async () => {
    renderWithProviders(<JotsListView spaceId="space-1" />);
    await screen.findByText("Recent idea");
    expect(screen.getByRole("button", { name: /^Show refined/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByText("Refined into a Note")).toBeNull();
    expect(screen.queryByText("Not refined yet")).toBeNull();
  });

  // The count was muted on the filled button too, grey on blue and hard to read.
  it("keeps the refined count readable once Hide refined is filled", async () => {
    const { user } = renderWithProviders(<JotsListView spaceId="space-1" />);
    await screen.findByText("Recent idea");
    const count = () => screen.getByRole("button", { name: /refined/ }).querySelector("span");
    expect(count()?.className).toContain("text-muted-foreground");
    await user.click(screen.getByRole("button", { name: /^Show refined/ }));
    await screen.findByRole("button", { name: /^Hide refined/ });
    expect(count()?.className).not.toContain("text-muted-foreground");
  });

  // The button's own shortcut hint crowded it; the shortcut still works and the empty page names it.
  it("has a plain New Jot button, without its shortcut shown", async () => {
    renderWithProviders(<JotsListView spaceId="space-1" />);
    await screen.findByText("Recent idea");
    const button = screen.getByRole("button", { name: /New Jot/ });
    expect(button.querySelector("kbd")).toBeNull();
  });

  it("leaves out the columns nothing fills", async () => {
    renderWithProviders(<JotsListView spaceId="space-1" />);
    await screen.findByText("Recent idea");
    expect(screen.queryByRole("columnheader", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Session" })).toBeNull();
  });

  it("offers Refine on every unrefined row", async () => {
    renderWithProviders(<JotsListView spaceId="space-1" />);
    await screen.findByText("Recent idea");
    expect(screen.getAllByRole("button", { name: "Refine" })).toHaveLength(2);
  });
});

describe("refined Jots", () => {
  it("stay out of the inbox until asked for, then sit under the ones still to refine", async () => {
    const refined = jot("j3", "Done idea", new Date().toISOString());
    refined.linked = [makeEntity({ id: "n1", type: "note", title: "Note" })];
    mockCommand("list_jot_summaries", [
      jot("j1", "Recent idea", new Date().toISOString()),
      refined,
    ]);
    const { user } = renderWithProviders(<JotsListView spaceId="space-1" />);
    await screen.findByText("Recent idea");
    expect(screen.queryByText("Done idea")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Show refined/ }));
    expect(await screen.findByText("Done idea")).toBeInTheDocument();
    const titles = screen
      .getAllByRole("row")
      .map((row) => within(row).queryByText(/idea|To refine|Refined$/)?.textContent)
      .filter(Boolean);
    expect(titles).toEqual(["To refine", "Recent idea", "Refined", "Done idea"]);
  });
});

describe("an empty Jots page", () => {
  // It sat flush against the page's edges, without the list's own padding.
  it("keeps the same padding as the list", async () => {
    mockCommand("list_jot_summaries", []);
    renderWithProviders(<JotsListView spaceId="space-1" />);
    const heading = await screen.findByRole("heading", { name: "Jots" });
    expect(heading.parentElement?.className).toMatch(/\bp-6\b/);
  });
});
