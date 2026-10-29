import { fireEvent, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { ContextMenuHost } from "#/components/context-menu/context-menu-host.tsx";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";
import "./context-actions.tsx";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function Harness({ e }: { e: Editor }) {
  return (
    <div>
      <button
        type="button"
        {...contextTarget("note.block", {
          editor: e,
          blockId: "c1",
          entityId: "p",
          resolveStoredId: async () => "s1",
        })}
      >
        Block
      </button>
      <ContextMenuHost />
    </div>
  );
}

function open() {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "c1" },
          content: [{ type: "text", text: "The cat sat" }],
        },
      ],
    },
  });
  return editor;
}

/// The menu's items and separators, top to bottom.
function layout(): string[] {
  const menu = screen.getByRole("menu");
  return [...menu.querySelectorAll('[role="menuitem"], [role="separator"]')].map((el) =>
    el.getAttribute("role") === "separator" ? "---" : (el.textContent ?? ""),
  );
}

describe("the block menu with text selected", () => {
  it("has the selection copies above the block copies, with a line between", async () => {
    const e = open();
    e.commands.setTextSelection({ from: 5, to: 8 });
    renderWithProviders(<Harness e={e} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Block" }));
    await screen.findByRole("menuitem", { name: "Copy Mention for Selection" });
    const items = layout();
    const mention = items.indexOf("Copy Mention for Selection");
    const link = items.indexOf("Copy Link for Selection");
    const block = items.indexOf("Copy Mention for Block");
    expect(link).toBe(mention + 1);
    expect(items[link + 1]).toBe("---");
    expect(block).toBe(link + 2);
    expect(items[block + 1]).toBe("Copy Link for Block");
  });

  it("has no selection copies, and no extra line, without a selection", async () => {
    const e = open();
    renderWithProviders(<Harness e={e} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Block" }));
    await screen.findByRole("menuitem", { name: "Copy Mention for Block" });
    expect(layout().join("|")).not.toContain("Selection");
  });
});
