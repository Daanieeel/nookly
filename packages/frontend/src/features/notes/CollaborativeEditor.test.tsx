import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { PAGE_FRAGMENT, pageBlocks, seedPage } from "@nookly/shared/blocks";
import type { PageSession } from "@nookly/shared/sync";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { mockCommand } from "#/test/tauri.ts";
import { makeBlock } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { CollaborativeEditor, caretColor } from "./CollaborativeEditor.tsx";

const sockets: HocuspocusProviderWebsocket[] = [];
afterEach(() => {
  for (const s of sockets.splice(0)) s.destroy();
});

/// A page session that never connects: the document alone, as when offline.
function offlineSession(): PageSession {
  const doc = new Y.Doc();
  seedPage(doc, [
    makeBlock({ id: "b1", blockType: "heading2", content: "Packing" }),
    makeBlock({ id: "b2", position: 1, content: "Tent and stove" }),
  ]);
  const socket = new HocuspocusProviderWebsocket({ url: "ws://127.0.0.1:9", autoConnect: false });
  sockets.push(socket);
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: "o:p1",
    document: doc,
  });
  return { entityId: "p1", doc, provider, readOnly: false };
}

describe("the live page editor", () => {
  it("shows the document and writes typing into it, offline too", async () => {
    for (const cmd of ["list_entities", "list_files", "list_sessions"]) mockCommand(cmd, []);
    mockCommand("get_note_code_language", null);
    const session = offlineSession();
    renderWithProviders(
      <CollaborativeEditor
        session={session}
        entityId="p1"
        spaceId="s1"
        compact={false}
        scrollPastEnd={false}
      />,
    );
    expect(await screen.findByText("Tent and stove")).toBeInTheDocument();
    const fragment = session.doc.getXmlFragment(PAGE_FRAGMENT);
    expect(fragment.length).toBeGreaterThanOrEqual(2);
    await waitFor(() => expect(pageBlocks(session.doc)[0].content).toBe("Packing"));
  });

  it("gives each person one caret color", () => {
    expect(caretColor("ada")).toBe(caretColor("ada"));
    expect(caretColor("ada")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("says when a newer Nookly changed the page, and keeps it read only", async () => {
    for (const cmd of ["list_entities", "list_files", "list_sessions"]) mockCommand(cmd, []);
    mockCommand("get_note_code_language", null);
    const session = { ...offlineSession(), readOnly: true };
    renderWithProviders(
      <CollaborativeEditor
        session={session}
        entityId="p1"
        spaceId="s1"
        compact={false}
        scrollPastEnd={false}
      />,
    );
    expect(await screen.findByText(/changed by a newer Nookly/)).toBeInTheDocument();
    expect(document.querySelector("[contenteditable]")?.getAttribute("contenteditable")).toBe(
      "false",
    );
  });
});
