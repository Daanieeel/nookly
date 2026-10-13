import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import type { Block } from "../../lib/api/types";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { editorExtensions } from "./editor-extensions";
import { letterListExtensions } from "./ordered-list-extension";

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

  it.each(["ab. ", "a.", "xa) ", "1) ", "bb) "])("%j stays a paragraph", (typed) => {
    expect(firstNode(type(typed))?.type).toBe("paragraph");
  });

  // A list can start anywhere in its count, and goes on from there.
  it.each([
    ["b. ", 2, "a."],
    ["c) ", 3, "a)"],
    ["B. ", 2, "A."],
    ["D) ", 4, "A)"],
    ["z. ", 26, "a."],
  ])("%j starts a lettered list at %i", (typed, start, marker) => {
    const node = firstNode(type(typed));
    expect(node?.type).toBe("orderedList");
    expect(node?.attrs?.start).toBe(start);
    expect(node?.attrs?.marker).toBe(marker);
  });

  it.each([
    ["12. ", 12],
    ["3. ", 3],
    ["100. ", 100],
  ])("%j starts a numbered list at %i", (typed, start) => {
    const node = firstNode(type(typed));
    expect(node?.type).toBe("orderedList");
    expect(node?.attrs?.start).toBe(start);
    expect(node?.attrs?.marker).toBeNull();
  });

  it("does not start a list from a letter in the middle of a sentence", () => {
    expect(firstNode(type("so a. "))?.type).toBe("paragraph");
  });
});

function numberedList(content: string, attrs: Block["attrs"]): Block {
  return {
    id: "b1",
    entityId: "p",
    position: 0,
    blockType: "numbered_list",
    content,
    language: null,
    filename: null,
    attrs,
    createdAt: "",
    updatedAt: "",
  };
}

describe("a lettered list keeps its letters", () => {
  it.each(["a.", "a)", "A.", "A)"])("%j is remembered as the list's marker", (marker) => {
    expect(firstNode(type(`${marker} `))?.attrs?.marker).toBe(marker);
  });

  it("a 1. list has no marker", () => {
    expect(firstNode(type("1. "))?.attrs?.marker).toBeNull();
  });

  it("renders the marker on the list so it can be styled", () => {
    const target = type("a) ");
    expect(target.getHTML()).toContain('data-marker="a)"');
  });

  it("saves the marker and loads it back", () => {
    const node = blockToNode(numberedList("One\nTwo", { marker: "A)" }));
    expect(node.attrs?.marker).toBe("A)");
    expect(nodeToBlockInput(node)?.attrs).toMatchObject({ marker: "A)" });
  });

  it("clears the marker on a plain numbered list", () => {
    const node = blockToNode(numberedList("One", {}));
    expect(nodeToBlockInput(node)?.attrs).toEqual({ marker: "", start: "", nestedStarts: "" });
  });
});

describe("a list that starts later in its count", () => {
  it("saves where it starts and loads it back, for letters and for numbers", () => {
    for (const [marker, start] of [
      ["a.", "3"],
      ["A)", "2"],
      ["", "12"],
    ] as const) {
      const node = blockToNode(numberedList("One\nTwo", { marker, start }));
      expect(node.attrs?.start).toBe(Number(start));
      expect(nodeToBlockInput(node)?.attrs).toEqual({ marker, start, nestedStarts: "" });
    }
  });

  it("starts at one when no start was saved", () => {
    expect(blockToNode(numberedList("One", { marker: "a." })).attrs?.start).toBe(1);
  });

  it("saves no start for a list that starts at one", () => {
    const node = blockToNode(numberedList("One", { start: "1" }));
    expect(nodeToBlockInput(node)?.attrs?.start).toBe("");
  });
});

describe("indenting an item of a numbered list", () => {
  function listEditor(marker: string | null, start = 1, items = ["One", "Two", "Three"]) {
    editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: {
        type: "doc",
        content: [
          {
            type: "orderedList",
            attrs: { blockId: "l1", marker, start },
            content: items.map((text) => ({
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text }] }],
            })),
          },
        ],
      },
    });
    return editor;
  }
  const caretIn = (target: Editor, text: string) => {
    let found = -1;
    target.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === text) found = pos + 1;
    });
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, found)),
    );
  };
  const tab = (target: Editor, shiftKey = false) =>
    target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key: "Tab", shiftKey })),
    );
  const docOf = (target: Editor): JSONNode => target.getJSON();
  const nestedList = (target: Editor): JSONNode | undefined =>
    docOf(target).content?.[0]?.content?.[0]?.content?.[1];

  it("keeps the letters of a lettered list, starting at the letter the item had", () => {
    const target = listEditor("a.");
    caretIn(target, "Two");
    expect(tab(target)).toBe(true);
    const nested = nestedList(target);
    expect(nested?.type).toBe("orderedList");
    expect(nested?.attrs?.marker).toBe("a.");
    expect(nested?.attrs?.start).toBe(2);
    expect(target.getHTML()).toContain('data-marker="a."');
  });

  it("keeps the number of a numbered list too", () => {
    const target = listEditor(null, 1);
    caretIn(target, "Two");
    tab(target);
    expect(nestedList(target)?.attrs?.start).toBe(2);
    expect(nestedList(target)?.attrs?.marker).toBeNull();
  });

  it("counts from where the outer list started", () => {
    const target = listEditor("A)", 3);
    caretIn(target, "Two");
    tab(target);
    expect(nestedList(target)?.attrs?.marker).toBe("A)");
    expect(nestedList(target)?.attrs?.start).toBe(4);
  });

  it("goes on counting when a second item joins the nested list", () => {
    const target = listEditor("a.");
    caretIn(target, "Two");
    tab(target);
    caretIn(target, "Three");
    tab(target);
    const nested = nestedList(target);
    expect(nested?.content?.length).toBe(2);
    expect(nested?.attrs?.start).toBe(2);
  });

  it("leaves a bullet list alone", () => {
    editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: "<ul><li><p>One</p></li><li><p>Two</p></li></ul>",
    });
    caretIn(editor, "Two");
    expect(tab(editor)).toBe(true);
    expect(nestedList(editor)?.type).toBe("bulletList");
  });

  it("is saved and loaded again with the nested start", () => {
    const target = listEditor("a.");
    caretIn(target, "Two");
    tab(target);
    const doc: JSONNode = target.getJSON();
    const saved = nodeToBlockInput(doc.content?.[0] ?? { type: "doc" });
    expect(saved?.content).toBe("One\n\tTwo\nThree");
    expect(saved?.attrs).toEqual({ marker: "a.", start: "", nestedStarts: "1:2" });
    const reloaded = blockToNode(numberedList(saved?.content ?? "", saved?.attrs ?? {}));
    const nested = reloaded.content?.[0]?.content?.[1];
    expect(nested?.attrs?.marker).toBe("a.");
    expect(nested?.attrs?.start).toBe(2);
  });

  it("brings the item back out with Shift+Tab", () => {
    const target = listEditor("a.");
    caretIn(target, "Two");
    tab(target);
    tab(target, true);
    expect(docOf(target).content?.[0]?.content?.length).toBe(3);
  });
});

describe("a lettered list in a markdown editor", () => {
  function markdownEditor(markdown: string) {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ orderedList: false, listItem: false }),
        Markdown,
        ...letterListExtensions,
      ],
      content: markdown,
      contentType: "markdown",
    });
    return editor;
  }

  it.each(["a)", "a.", "A)", "A."])("%j loads, and saves back with the same marker", (first) => {
    const second = first.replace(/[aA]/, (c) => (c === "a" ? "b" : "B"));
    const markdown = `${first} One\n${second} Two`;
    const target = markdownEditor(markdown);
    expect(firstNode(target)?.type).toBe("orderedList");
    expect(firstNode(target)?.attrs?.marker).toBe(first);
    expect(target.getMarkdown()).toBe(markdown);
  });

  it("a numbered list still saves as numbers", () => {
    expect(markdownEditor("1. One\n2. Two").getMarkdown()).toBe("1. One\n2. Two");
  });

  it("typing a) starts a lettered list that saves as letters", () => {
    const target = markdownEditor("");
    target.commands.focus();
    for (const char of "a) One") {
      const { from, to } = target.state.selection;
      const handled = target.view.someProp("handleTextInput", (f) =>
        f(target.view, from, to, char, () => target.state.tr.insertText(char, from, to)),
      );
      if (!handled) target.view.dispatch(target.state.tr.insertText(char, from, to));
    }
    expect(target.getMarkdown().trimEnd()).toBe("a) One");
  });
});
