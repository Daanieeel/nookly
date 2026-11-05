import { mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFile } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { FileDetailView } from "./FileDetailView.tsx";

beforeEach(() => {
  installTauriMock();
  mockConvertFileSrc("macos");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("plain words")),
  );
});
afterEach(() => {
  uninstallTauriMock();
  vi.unstubAllGlobals();
});

// A file in the Space fills its page edge to edge, the way a file of a Moodle course does.
describe("the page of a File", () => {
  it("has no margin around the viewer", async () => {
    const file = makeFile({ localPath: "/files/notes.txt", originalFilename: "notes.txt" });
    mockCommand("get_file", file);
    renderWithProviders(<FileDetailView entity={file.entity} />);
    const copy = await screen.findByRole("button", { name: "Copy content" });
    const body = copy.closest(".overflow-y-auto");
    expect(body).not.toBeNull();
    expect(body?.classList.contains("p-4")).toBe(false);
  });

  // The page already frames the viewer, so it needs no border or corners of its own.
  it.each([["notes.txt"], ["notes.md"]])("draws %s without a border of its own", async (name) => {
    const file = makeFile({ localPath: `/files/${name}`, originalFilename: name });
    mockCommand("get_file", file);
    renderWithProviders(<FileDetailView entity={file.entity} />);
    const copy = await screen.findByRole("button", { name: "Copy content" });
    const viewer = copy.closest(".overflow-y-auto");
    const framed = viewer?.querySelectorAll(".border, .rounded-md");
    // Only the copy button itself keeps its border.
    expect(Array.from(framed ?? []).filter((el) => el !== copy)).toEqual([]);
  });
});
