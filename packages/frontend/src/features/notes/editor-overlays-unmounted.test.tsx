import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";
import { BlockHandles } from "./BlockHandles";
import { TableColumnHandles } from "./TableColumnHandles";
import { TableRowHandles } from "./TableRowHandles";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

/// An editor that let go of its view: the React hook destroys the old one on a later tick
/// while the handles around the page can still hold it. Reading `editor.view` then throws,
/// which took the whole view down ("Something went wrong showing this view").
function editorWithoutView() {
  const gone = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: "<p>x</p>",
  });
  gone.unmount();
  return gone;
}

describe("the handles around a page", () => {
  it("wait quietly while the editor has no view", () => {
    editor = editorWithoutView();
    const resolve = async () => "stored";
    expect(() =>
      renderWithProviders(
        <div>
          <TableRowHandles editor={editor} entityId="p" resolveStoredId={resolve} />
          <TableColumnHandles editor={editor} entityId="p" resolveStoredId={resolve} />
          <BlockHandles editor={editor} />
        </div>,
      ),
    ).not.toThrow();
  });
});
