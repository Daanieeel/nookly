import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { makeBlock } from "#/test/fixtures.ts";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import { Highlight } from "./highlight-extension";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function page(content: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: [blockToNode(makeBlock({ blockType: "paragraph", content }))],
    },
  });
  return editor;
}
const docOf = (target: Editor): JSONNode => target.getJSON();
const storedParagraph = (target: Editor) =>
  nodeToBlockInput(docOf(target).content?.[0] ?? { type: "doc" })?.content;
const marksOf = (target: Editor) =>
  docOf(target).content?.[0]?.content?.map((n) => [n.text, n.marks?.map((m) => m.type)]);

describe("the highlight mark in a page", () => {
  it("reads ==text== from the stored page and writes it back unchanged", () => {
    const target = page("see ==this== and **that**");
    expect(marksOf(target)).toEqual([
      ["see ", undefined],
      ["this", ["highlight"]],
      [" and ", undefined],
      ["that", ["bold"]],
    ]);
    expect(storedParagraph(target)).toBe("see ==this== and **that**");
  });

  it("highlights the selection from the command and takes it off again", () => {
    const target = page("hello world");
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, 1, 6)),
    );
    expect(target.commands.toggleHighlight()).toBe(true);
    expect(storedParagraph(target)).toBe("==hello== world");
    target.commands.toggleHighlight();
    expect(storedParagraph(target)).toBe("hello world");
  });

  it("highlights with Mod+Shift+H", () => {
    const target = page("hello world");
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, 7, 12)),
    );
    const handled = target.view.someProp("handleKeyDown", (f) =>
      f(
        target.view,
        new KeyboardEvent("keydown", { key: "H", keyCode: 72, shiftKey: true, ctrlKey: true }),
      ),
    );
    expect(handled).toBe(true);
    expect(storedParagraph(target)).toBe("hello ==world==");
  });

  it("turns ==text== into a highlight as the closing marker is typed", () => {
    const target = page("");
    const type = (text: string) => {
      const { from, to } = target.state.selection;
      const handled = target.view.someProp("handleTextInput", (f) =>
        f(target.view, from, to, text, () => target.state.tr.insertText(text, from, to)),
      );
      if (!handled) target.view.dispatch(target.state.tr.insertText(text, from, to));
    };
    for (const char of "==marked==") type(char);
    expect(marksOf(target)).toEqual([["marked", ["highlight"]]]);
    expect(storedParagraph(target)).toBe("==marked==");
  });

  it("keeps a highlight next to bold, italic and inline math", () => {
    const stored = "==**bold** and *italic* and $x^2$==";
    expect(storedParagraph(page(stored))).toBe(stored);
  });

  it("leaves a page without highlights exactly as it was", () => {
    for (const plain of [
      "a == b",
      "plain **bold** *italic* `code`",
      "$x$ and [l](mention:abc-1)",
    ]) {
      expect(storedParagraph(page(plain))).toBe(plain);
    }
  });
});

describe("the highlight mark in a markdown editor", () => {
  it("reads and writes ==text== through real markdown", () => {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit, Markdown, Highlight],
      content: "a ==b== **c ==d== e**",
      contentType: "markdown",
    });
    const marks = docOf(editor)
      .content?.[0]?.content?.filter((n) => n.marks?.some((m) => m.type === "highlight"))
      .map((n) => n.text);
    expect(marks).toEqual(["b", "d"]);
    expect(editor.getMarkdown()).toContain("==b==");
    expect(editor.getMarkdown()).toContain("==d==");
  });

  it("leaves text without highlights alone", () => {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit, Markdown, Highlight],
      content: "if a == b then c",
      contentType: "markdown",
    });
    expect(editor.getMarkdown()).toBe("if a == b then c");
  });
});
