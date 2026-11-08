import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import {
  callsOf,
  installTauriMock,
  mockCommand,
  mockCommandWith,
  uninstallTauriMock,
} from "#/test/tauri.ts";
import type { Reference } from "#/lib/api/types.ts";
import { ReferenceDetailView } from "./ReferenceDetailView.tsx";

beforeEach(() => {
  installTauriMock();
  mockCommand("list_relationships", []);
  mockCommand("list_spaces", []);
});
afterEach(uninstallTauriMock);

function course(patch: Partial<Reference> = {}): Reference {
  return {
    entity: makeEntity({ id: "r1", type: "reference", title: "Physics 101", key: "REF-1" }),
    provider: "moodle_course",
    remoteId: "42",
    lastKnownTitle: "Physics 101",
    lastSeenAt: null,
    lastResult: null,
    pathOnThisDevice: null,
    status: null,
    ...patch,
  };
}

describe("the page of a reference", () => {
  it("looks at the target when it opens and shows where it stands", async () => {
    const reference = course();
    mockCommand("get_reference", reference);
    mockCommand("check_reference", { state: "needsSignIn", asOf: null });
    renderWithProviders(<ReferenceDetailView entity={reference.entity} />);
    expect(await screen.findByText("Needs sign in")).toBeTruthy();
    expect(callsOf("check_reference")).toEqual([{ entityId: "r1" }]);
    expect(screen.getByText("Moodle course")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("checks again on request", async () => {
    const reference = course();
    mockCommand("get_reference", reference);
    let answer = { state: "offline", asOf: "2026-11-01T10:00:00Z" };
    mockCommandWith("check_reference", () => answer);
    renderWithProviders(<ReferenceDetailView entity={reference.entity} />);
    expect(await screen.findByText(/^Offline, as of/)).toBeTruthy();
    answer = { state: "available", asOf: null };
    await userEvent.click(screen.getByRole("button", { name: "Check Again" }));
    expect(await screen.findByText("Available")).toBeTruthy();
    await waitFor(() => expect(callsOf("check_reference").length).toBe(2));
  });

  it("opens a link in the browser and offers nothing like it for Moodle", async () => {
    const link = course({ provider: "link", remoteId: "https://example.com/a" });
    mockCommand("get_reference", link);
    mockCommand("check_reference", { state: "available", asOf: null });
    renderWithProviders(<ReferenceDetailView entity={link.entity} />);
    expect(await screen.findByRole("button", { name: "Open Link" })).toBeTruthy();
  });

  it("has no Open Link for a Moodle course", async () => {
    const reference = course();
    mockCommand("get_reference", reference);
    mockCommand("check_reference", { state: "available", asOf: null });
    renderWithProviders(<ReferenceDetailView entity={reference.entity} />);
    await screen.findByText("Available");
    expect(screen.queryByRole("button", { name: "Open Link" })).toBeNull();
  });
});
