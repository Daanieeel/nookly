import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "./editor-extensions.ts";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

describe("the editor's drop cursor", () => {
  it("is drawn in the primary color, like the line shown when dragging blocks", () => {
    editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    });
    const cursor = editor.extensionManager.extensions.find((e) => e.name === "dropCursor");
    // `color: false` hands the color to the class instead of the text color.
    expect(cursor?.options).toMatchObject({ color: false, class: "nookly-drop-cursor" });
  });
});
