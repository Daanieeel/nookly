import { mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntity, ReferenceFacts, ReferenceStateKey } from "#/lib/api/types.ts";
import { makeFile } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import {
  callsOf,
  installTauriMock,
  mockCommand,
  mockCommandWith,
  uninstallTauriMock,
} from "#/test/tauri.ts";
import { FileDetailView } from "./FileDetailView.tsx";

beforeEach(() => {
  installTauriMock();
  mockConvertFileSrc("macos");
  mockCommand("list_relationships", []);
  mockCommand("list_spaces", []);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("plain words")),
  );
});
afterEach(() => {
  uninstallTauriMock();
  vi.unstubAllGlobals();
});

function pointer(state: ReferenceStateKey, onThisDevice: boolean): FileEntity {
  const reference: ReferenceFacts = {
    provider: "file",
    remoteId: "/Users/me/notes.txt",
    lastKnownTitle: "notes.txt",
    lastSeenAt: null,
    lastResult: null,
    pathOnThisDevice: onThisDevice ? "/Users/me/notes.txt" : null,
    status: { state, asOf: null },
  };
  return makeFile({
    originalFilename: "notes.txt",
    sourcePath: onThisDevice ? "/Users/me/notes.txt" : null,
    reference,
  });
}

describe("a File that points at a file on disk", () => {
  it("shows the file as before while it is available, with its state beside it", async () => {
    const file = pointer("available", true);
    mockCommand("get_file", file);
    mockCommand("check_reference", { state: "available", asOf: null });
    renderWithProviders(<FileDetailView entity={file.entity} />);
    expect(await screen.findByRole("button", { name: "Copy content" })).toBeTruthy();
    expect(await screen.findByText("Available")).toBeTruthy();
    expect(screen.getByText("On disk, not copied")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Locate…" })).toBeNull();
  });

  it("says it is not on this device and lets the person locate it here", async () => {
    const file = pointer("notOnThisDevice", false);
    mockCommand("get_file", file);
    mockCommand("check_reference", { state: "notOnThisDevice", asOf: null });
    mockCommand("plugin:dialog|open", "/Volumes/Backup/notes.txt");
    mockCommandWith("locate_file", () => ({ ...file, sourcePath: "/Volumes/Backup/notes.txt" }));
    renderWithProviders(<FileDetailView entity={file.entity} />);

    expect((await screen.findAllByText("Not on this device")).length).toBeGreaterThan(0);
    // The sidebar and the body both offer it; the body's is the way out of the dead end.
    const [locate] = await screen.findAllByRole("button", { name: "Locate…" });
    await userEvent.click(locate);
    await waitFor(() =>
      expect(callsOf("locate_file")).toEqual([
        { entityId: file.entity.id, path: "/Volumes/Backup/notes.txt" },
      ]),
    );
  });

  it("asks for nothing when the person cancels the picker", async () => {
    const file = pointer("missing", true);
    mockCommand("get_file", file);
    mockCommand("check_reference", { state: "missing", asOf: null });
    mockCommand("plugin:dialog|open", null);
    renderWithProviders(<FileDetailView entity={file.entity} />);
    const [locate] = await screen.findAllByRole("button", { name: "Locate…" });
    await userEvent.click(locate);
    await waitFor(() => expect(callsOf("plugin:dialog|open").length).toBe(1));
    expect(callsOf("locate_file")).toEqual([]);
  });

  it("does not offer to copy in a file this device does not have", async () => {
    const file = pointer("notOnThisDevice", false);
    mockCommand("get_file", file);
    mockCommand("check_reference", { state: "notOnThisDevice", asOf: null });
    renderWithProviders(<FileDetailView entity={file.entity} />);
    await screen.findAllByText("Not on this device");
    expect(screen.queryByRole("button", { name: /Copy into Nookly/ })).toBeNull();
  });

  it("shows a missing file as missing instead of a broken viewer", async () => {
    const file = pointer("missing", true);
    mockCommand("get_file", file);
    mockCommand("check_reference", { state: "missing", asOf: null });
    renderWithProviders(<FileDetailView entity={file.entity} />);
    expect((await screen.findAllByText("Missing")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Copy content" })).toBeNull();
  });

  it("shows a stored file with no state at all", async () => {
    const file = makeFile({ localPath: "/files/notes.txt", originalFilename: "notes.txt" });
    mockCommand("get_file", file);
    renderWithProviders(<FileDetailView entity={file.entity} />);
    await screen.findByRole("button", { name: "Copy content" });
    expect(screen.queryByText("Available")).toBeNull();
    expect(callsOf("check_reference")).toEqual([]);
  });
});
