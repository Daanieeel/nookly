import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { BlockEditor } from "./BlockEditor";

/// The editor mounts once the page's blocks have loaded.
async function findEditor(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector(".tiptap-content")).not.toBeNull());
  return container.querySelector(".tiptap-content")!;
}

describe("the block editor's scroll room", () => {
  beforeEach(() => {
    installTauriMock();
    mockCommand("list_blocks", []);
  });
  afterEach(uninstallTauriMock);

  it("leaves a screen of room below the last block when asked, for a full page", async () => {
    const { container } = renderWithProviders(
      <BlockEditor entityId="e1" spaceId="s1" scrollPastEnd />,
    );
    const content = await findEditor(container);
    expect(content.getAttribute("style")).toContain("padding-bottom: 100vh");
  });

  it("adds none by default, so content below an inline editor sits right under it", async () => {
    const { container } = renderWithProviders(<BlockEditor entityId="e1" spaceId="s1" />);
    const content = await findEditor(container);
    expect(content.getAttribute("style") ?? "").not.toContain("padding-bottom");
  });

  it("adds none to a compact editor embedded in another page", async () => {
    const { container } = renderWithProviders(<BlockEditor entityId="e1" spaceId="s1" compact />);
    const content = await findEditor(container);
    expect(content.getAttribute("style") ?? "").not.toContain("padding-bottom");
  });
});
