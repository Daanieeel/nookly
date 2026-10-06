import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

/// Types `text` into an empty paragraph the way the keyboard does, so input rules fire.
function type(text: string) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  editor.commands.focus();
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (f) =>
      f(editor!.view, from, to, char, () => editor!.state.tr.insertText(char, from, to)),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
  return editor;
}

const firstNode = (target: Editor) => target.getJSON().content?.[0];

describe("starting a numbered list", () => {
  it.each(["1. ", "a. ", "a) ", "A. ", "A) "])("%j starts a numbered list", (typed) => {
    const target = type(typed);
    expect(firstNode(target)?.type).toBe("orderedList");
    expect(firstNode(target)?.attrs?.start).toBe(1);
  });

  it.each(["b. ", "ab. ", "a.", "xa) ", "1) "])("%j stays a paragraph", (typed) => {
    expect(firstNode(type(typed))?.type).toBe("paragraph");
  });

  it("does not start a list from a letter in the middle of a sentence", () => {
    expect(firstNode(type("so a. "))?.type).toBe("paragraph");
  });
});
