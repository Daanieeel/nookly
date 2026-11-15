import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeFile, makeLabel } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
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

describe("the label shelf (D74)", () => {
  it("drills into a label, then the labels its files also carry", async () => {
    const { user } = renderWithProviders(<FilesListView spaceId="space-1" />);
    const shelf = await screen.findByRole("group", { name: "Browse by label" });
    expect(within(shelf).getByRole("button", { name: /Uni\s*2/ })).toBeInTheDocument();
    await user.click(within(shelf).getByRole("button", { name: /Uni/ }));
    await waitFor(() => expect(screen.queryByText("Receipt")).toBeNull());
    expect(screen.getByText("Timetable")).toBeInTheDocument();
    await user.click(within(shelf).getByRole("button", { name: /Math\s*1/ }));
    await waitFor(() => expect(screen.queryByText("Timetable")).toBeNull());
    expect(screen.getByText("Algebra notes")).toBeInTheDocument();
  });

  it("nudges quietly toward the files without a label", async () => {
    const { user } = renderWithProviders(<FilesListView spaceId="space-1" />);
    const shelf = await screen.findByRole("group", { name: "Browse by label" });
    await user.click(within(shelf).getByRole("button", { name: /Unlabelled\s*1/ }));
    await waitFor(() => expect(screen.queryByText("Timetable")).toBeNull());
    expect(screen.getByText("Receipt")).toBeInTheDocument();
    expect(screen.getByText(/Give these a label/)).toBeInTheDocument();
  });
});
