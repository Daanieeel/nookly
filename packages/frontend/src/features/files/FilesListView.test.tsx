import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeFile, makeLabel, makeView } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import {
  callsOf,
  installTauriMock,
  mockCommand,
  mockCommandWith,
  uninstallTauriMock,
} from "#/test/tauri.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { FilesListView } from "./FilesListView";

const file = (id: string, title: string, labelIds: string[]) =>
  makeFile(
    { labelIds, localPath: `/files/${id}.pdf`, originalFilename: `${id}.pdf` },
    { id, title },
  );

beforeEach(() => {
  installTauriMock();
  preferences.remove(STORAGE_KEYS.filesDisplay);
  mockCommand("list_labels", [
    makeLabel({ id: "uni", name: "Uni" }),
    makeLabel({ id: "math", name: "Math" }),
  ]);
  mockCommand("list_files", [
    file("a", "Algebra notes", ["uni", "math"]),
    file("b", "Timetable", ["uni"]),
    file("c", "Receipt", []),
  ]);
  mockCommand("list_views", []);
});
// The page stops listening for reindex progress a tick after it unmounts: let that reach the
// fake backend before it goes.
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  uninstallTauriMock();
});

describe("Files Views are built in a dialog, not a list of every label", () => {
  it("shows no list of every label above the files", async () => {
    renderWithProviders(<FilesListView spaceId="space-1" />);
    await screen.findByText("Timetable");
    expect(screen.queryByRole("group", { name: "Browse by label" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Uni\s*2/ })).toBeNull();
  });

  it("makes a View from a name and labels, keeping the page's filters and display", async () => {
    mockCommandWith("create_view", (args) => {
      // SAFETY: `create_view` is only ever invoked with these, as `createView` sends them.
      const sent = args as { title: string; config: string };
      return makeView({ id: "v1", title: sent.title }, "files", sent.config);
    });
    const { user } = renderWithProviders(<FilesListView spaceId="space-1" />);
    await user.click(await screen.findByRole("button", { name: "New view" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /Name/ }), "Maths");
    const labels = within(dialog).getByRole("group", { name: "Labels" });
    // Most used first, each with how many files carry it.
    expect(within(labels).getByRole("option", { name: /Uni\s*2/ })).toBeInTheDocument();
    await user.type(within(labels).getByPlaceholderText("Search labels…"), "mat");
    expect(within(labels).queryByRole("option", { name: /Uni/ })).toBeNull();
    await user.click(within(labels).getByRole("option", { name: /Math\s*1/ }));
    await user.click(within(dialog).getByRole("button", { name: "Create view" }));
    await waitFor(() => expect(callsOf("create_view")).toHaveLength(1));
    // SAFETY: as `createView` sends them.
    const sent = callsOf("create_view")[0] as { title: string; module: string; config: string };
    expect(sent.title).toBe("Maths");
    expect(sent.module).toBe("files");
    const config = JSON.parse(sent.config);
    expect(config.display.shelf).toEqual(["math"]);
    expect(config.display.layout).toBe("grid");
    expect(config.filters).toEqual([]);
  });

  it("has an accessible View dialog and label list", async () => {
    const { user } = renderWithProviders(<FilesListView spaceId="space-1" />);
    await user.click(await screen.findByRole("button", { name: "New view" }));
    await screen.findByRole("group", { name: "Labels" });
    await expectNoA11yViolations();
  });

  it("shows the labels picked as chips, and taking one off shows the rest again", async () => {
    preferences.set(STORAGE_KEYS.filesDisplay, JSON.stringify({ shelf: ["uni"] }));
    const { user } = renderWithProviders(<FilesListView spaceId="space-1" />);
    const picked = await screen.findByRole("group", { name: "Labels shown" });
    await waitFor(() => expect(screen.queryByText("Receipt")).toBeNull());
    expect(screen.getByText("Timetable")).toBeInTheDocument();
    await user.click(within(picked).getByRole("button", { name: "Change labels" }));
    await user.click(await screen.findByRole("option", { name: /Math\s*1/ }));
    await waitFor(() => expect(screen.queryByText("Timetable")).toBeNull());
    await expectNoA11yViolations();
    // Taking off every label keeps the list open to pick another.
    await user.click(screen.getByRole("option", { name: /Math\s*1/ }));
    await user.click(screen.getByRole("option", { name: /Uni\s*2/ }));
    expect(screen.getByRole("option", { name: /Uni\s*2/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
    expect(await screen.findByText("Receipt")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Labels shown" })).toBeNull();
  });

  it("takes a label off with its chip", async () => {
    preferences.set(STORAGE_KEYS.filesDisplay, JSON.stringify({ shelf: ["uni"] }));
    const { user } = renderWithProviders(<FilesListView spaceId="space-1" />);
    const picked = await screen.findByRole("group", { name: "Labels shown" });
    await user.click(within(picked).getByRole("button", { name: "Stop filtering by Uni" }));
    expect(await screen.findByText("Receipt")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Labels shown" })).toBeNull();
  });

  it("nudges quietly toward the files without a label", async () => {
    preferences.set(STORAGE_KEYS.filesDisplay, JSON.stringify({ shelf: ["none"] }));
    renderWithProviders(<FilesListView spaceId="space-1" />);
    expect(await screen.findByText("Receipt")).toBeInTheDocument();
    expect(screen.queryByText("Timetable")).toBeNull();
    expect(screen.getByText(/Give these a label/)).toBeInTheDocument();
  });
});
