import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import type { Block } from "../../lib/api/types";
import { blockToNode, nodeToBlockInput } from "./block-markdown";
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

  it.each(["b. ", "ab. ", "a.", "xa) ", "1) "])("%j stays a paragraph", (typed) => {
    expect(firstNode(type(typed))?.type).toBe("paragraph");
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
    expect(nodeToBlockInput(node)?.attrs).toEqual({ marker: "A)" });
  });

  it("clears the marker on a plain numbered list", () => {
    const node = blockToNode(numberedList("One", {}));
    expect(nodeToBlockInput(node)?.attrs).toEqual({ marker: "" });
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
