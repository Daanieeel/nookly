import { act } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";
import { TableControls } from "./TableControls";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  vi.restoreAllMocks();
});

const cells = (tag: string) =>
  Array.from({ length: 8 }, () => `<${tag}><p>x</p></${tag}>`).join("");

// Reported (#131): scrolling a wide table sideways carried the controls with it, out of
// the editor and out of reach. They belong to the table's visible edge, not its content.
describe("the table controls", () => {
  it("stay at the visible edge of the table while it scrolls sideways", async () => {
    editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: `<table><tr>${cells("th")}</tr><tr>${cells("td")}</tr></table>`,
    });
    renderWithProviders(
      <div>
        <EditorContent editor={editor} />
        <TableControls editor={editor} />
      </div>,
    );
    const table = document.querySelector("table");
    const wrapper = table?.parentElement;
    if (!table || !wrapper) throw new Error("no table");
    // The editor starts at 20px, the visible part of the table with it; the table itself
    // has been scrolled 300px to the left.
    vi.spyOn(editor.view.dom, "getBoundingClientRect").mockReturnValue(
      new DOMRect(20, 0, 600, 400),
    );
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 60, 600, 100));
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue(new DOMRect(-280, 60, 1200, 100));

    act(() => {
      const { doc } = editor!.state;
      editor!.view.dispatch(editor!.state.tr.setSelection(TextSelection.near(doc.resolve(4))));
    });
    const controls = () => document.querySelector<HTMLElement>("[style*='--controls-left']");
    await vi.waitFor(() => expect(controls()).not.toBeNull());
    expect(controls()?.style.getPropertyValue("--controls-top")).toBe("60px");
    expect(controls()?.style.getPropertyValue("--controls-left")).toBe("0px");
  });
});
