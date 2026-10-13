import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "./editor-extensions";
import { SLASH_ITEMS, slashItemsFor } from "./slash-command-extension";

const titles = (query: string) => slashItemsFor(query).map((item) => item.title);

describe("slash menu search", () => {
  it("shows every item for an empty query", () => {
    expect(titles("").length).toBeGreaterThan(20);
  });

  it("lists Inline math first for /in", () => {
    const found = titles("in");
    expect(found[0]).toBe("Inline math");
    expect(found).toContain("Heading 1");
  });

  it("lists titles that start with the term before ones that only contain it", () => {
    expect(titles("math").slice(0, 2)).toEqual(["Math block", "Inline math"]);
  });

  it("still finds an item by one of its keywords", () => {
    expect(titles("todo")).toContain("Checklist");
  });
});

describe("inserting a source block", () => {
  function open(content: object[]) {
    return new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: { type: "doc", content: [{ type: "paragraph", content }] },
    });
  }
  /// Runs the menu item for `title` over the "/..." typed at the end of the first paragraph.
  function run(editor: Editor, title: string, typed: string) {
    const to = editor.state.doc.firstChild!.nodeSize - 1;
    const item = SLASH_ITEMS.find((i) => i.title === title)!;
    item.run(editor, { from: to - typed.length, to });
  }
  /// The editor keeps an empty paragraph after a final block, so it is left out.
  const types = (editor: Editor) =>
    editor
      .getJSON()
      .content?.map((n) => n.type)
      .slice(0, -1);

  it("replaces an empty paragraph with the block", () => {
    const editor = open([{ type: "text", text: "/math block" }]);
    run(editor, "Math block", "/math block");
    expect(types(editor)).toEqual(["math"]);
  });

  it("keeps the line above a soft break as text and adds the block below", () => {
    const editor = open([
      { type: "text", text: "Normaler Text 123" },
      { type: "hardBreak" },
      { type: "text", text: "/math block" },
    ]);
    run(editor, "Math block", "/math block");
    const doc = editor.getJSON().content ?? [];
    expect(types(editor)).toEqual(["paragraph", "math"]);
    expect(JSON.stringify(doc[0])).toContain("Normaler Text 123");
    expect(doc[1].content).toBeUndefined();
  });

  it.each(["Equation", "Diagram", "Circuit"])("does the same for %s", (title) => {
    const editor = open([{ type: "text", text: "Hello /x" }]);
    run(editor, title, "/x");
    expect(types(editor)).toEqual(["paragraph", title.toLowerCase()]);
    expect(editor.getText()).toContain("Hello");
  });
});

describe("the Highlight item", () => {
  it("is found by highlight, marker and ==", () => {
    expect(titles("highl")).toContain("Highlight");
    expect(titles("marker")).toContain("Highlight");
    expect(titles("==")).toContain("Highlight");
  });

  it("starts a highlight, so what is typed next is marked", () => {
    const editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "a /highl" }] }],
      },
    });
    const to = editor.state.doc.firstChild!.nodeSize - 1;
    // The caret is where the "/" menu was typed, at the end of the line.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, to)));
    SLASH_ITEMS.find((i) => i.title === "Highlight")!.run(editor, { from: to - 6, to });
    editor.view.dispatch(editor.state.tr.insertText("x"));
    expect(editor.getHTML()).toContain("<mark>x</mark>");
    expect(editor.getText()).toContain("a x");
    editor.destroy();
  });
});
