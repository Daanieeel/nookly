import { QueryClient } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppToaster } from "#/components/app-toaster.tsx";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeEntity, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { startNewPage } from "./new-page.ts";

const spaces = [makeSpace({ id: "space-1" }), makeSpace({ id: "space-2", name: "Work" })];
const note = makeEntity({ id: "note-1", spaceId: "space-2", type: "note", title: "" });

beforeEach(() => {
  window.matchMedia = (media) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
  mockCommand("list_spaces", spaces);
  mockCommand("touch_entity_opened", null);
  useNavStore.setState({ view: { kind: "dashboard" }, activeSpaceId: null });
});

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderWithProviders(<AppToaster />);
  return { ...view, done: startNewPage(client) };
}

describe("startNewPage", () => {
  it("creates an untitled note in the active Space and opens it", async () => {
    mockCommand("create_note", note);
    useNavStore.setState({ activeSpaceId: "space-2" });
    await run().done;
    expect(callsOf("create_note")).toEqual([{ spaceId: "space-2", title: "" }]);
    expect(useNavStore.getState().view).toEqual({
      kind: "entity",
      entityId: "note-1",
      spaceId: "space-2",
    });
  });

  it("falls back to the first Space when none is active or the active one is gone", async () => {
    mockCommand("create_note", note);
    useNavStore.setState({ activeSpaceId: "deleted" });
    await run().done;
    expect(callsOf("create_note")).toEqual([{ spaceId: "space-1", title: "" }]);
  });

  it("does nothing without a Space", async () => {
    mockCommand("list_spaces", []);
    await run().done;
    expect(callsOf("create_note")).toEqual([]);
  });

  it("says so when the note could not be created", async () => {
    mockCommandWith("create_note", () => {
      throw new Error("disk full");
    });
    useNavStore.setState({ activeSpaceId: "space-1" });
    await run().done;
    expect(await screen.findByText("Couldn't create the page")).toBeInTheDocument();
    expect(useNavStore.getState().view).toEqual({ kind: "dashboard" });
  });
});
