import { act, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Block } from "#/lib/api/types.ts";
import { makeBlock } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, installTauriMock, mockCommandWith, uninstallTauriMock } from "#/test/tauri.ts";
import { BlockEditor } from "./BlockEditor";

const paragraph = (id: string, position: number) =>
  makeBlock({ id, entityId: "e1", position, blockType: "paragraph", content: id });

describe("saving a page that was reordered outside the open editor", () => {
  let stored: Block[];
  beforeEach(() => {
    installTauriMock();
    stored = [paragraph("a", 0), paragraph("b", 1), paragraph("c", 2)];
    mockCommandWith("list_blocks", () => stored.map((block) => ({ ...block })));
    mockCommandWith("create_block", () => {
      const created = paragraph("new", stored.length);
      stored = [...stored, created];
      return created;
    });
    mockCommandWith("reorder_blocks", () => null);
  });
  afterEach(uninstallTauriMock);

  it("keeps that order, and the blocks added with it, when a block is added here", async () => {
    // Bug: adding a block wrote the editor's old order over the one set by the CLI.
    const { container } = renderWithProviders(<BlockEditor entityId="e1" spaceId="s1" />);
    await waitFor(() => expect(container.querySelector(".tiptap-content")).not.toBeNull());
    // SAFETY: TipTap puts the editor on its own element.
    const { editor } = container.querySelector(".tiptap-content") as HTMLElement & {
      editor: Editor;
    };
    // The CLI moves the last block to the top and adds one at the end. The editor has not
    // read the page again yet.
    stored = [paragraph("c", 0), paragraph("a", 1), paragraph("b", 2), paragraph("cli", 3)];
    act(() => {
      editor.commands.insertContentAt(0, {
        type: "paragraph",
        content: [{ type: "text", text: "new" }],
      });
    });

    await waitFor(() => expect(callsOf("reorder_blocks")).toHaveLength(1), { timeout: 3000 });
    expect(callsOf("reorder_blocks")[0]).toEqual({
      entityId: "e1",
      orderedBlockIds: ["new", "c", "a", "b", "cli"],
    });
  });
});
