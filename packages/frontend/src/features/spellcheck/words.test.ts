import { Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "../notes/editor-extensions";
import { wordsIn } from "./words";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function block(json: JSONContent): ProseMirrorNode {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [json] },
  });
  return editor.state.doc.child(0);
}

function text(
  value: string,
  marks: { type: string; attrs?: { href: string } }[] = [],
): JSONContent {
  const node: JSONContent = { type: "text", text: value };
  if (marks.length > 0) node.marks = marks;
  return node;
}
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const words = (node: ProseMirrorNode) => wordsIn(node).map((w) => w.word);

describe("wordsIn", () => {
  it("finds the words of a paragraph, with where each one sits in it", () => {
    const node = block(paragraph(text("Hello, wide world.")));
    expect(wordsIn(node)).toEqual([
      { word: "Hello", from: 0, to: 5 },
      { word: "wide", from: 7, to: 11 },
      { word: "world", from: 12, to: 17 },
    ]);
  });

  it("keeps an apostrophe and a hyphen in the right place", () => {
    expect(words(block(paragraph(text("don't well-known Daniel’s"))))).toEqual([
      "don't",
      "well",
      "known",
      "Daniel’s",
    ]);
  });

  it("reads umlauts and other scripts as words", () => {
    expect(words(block(paragraph(text("Übung schön Straßenbahn"))))).toEqual([
      "Übung",
      "schön",
      "Straßenbahn",
    ]);
  });

  it("leaves out numbers, words with digits, single letters and shouted acronyms", () => {
    expect(words(block(paragraph(text("42 a1 x R2D2 I CPU ok"))))).toEqual(["ok"]);
  });

  it("leaves out addresses and file names typed as plain text", () => {
    const node = block(
      paragraph(
        text("see https://example.com/sehr-schoen or me@example.com and C:\\Uni\\a.pdf now"),
      ),
    );
    expect(words(node)).toEqual(["see", "or", "and", "now"]);
  });

  it("leaves out code, links and mentions", () => {
    const node = block(
      paragraph(
        text("before "),
        text("inlinecodee", [{ type: "code" }]),
        text(" middle "),
        text("linkedtext", [{ type: "link", attrs: { href: "https://example.com" } }]),
        text(" "),
        text("Grundlagen", [{ type: "link", attrs: { href: "mention:abc-123" } }]),
        text(" after"),
      ),
    );
    expect(words(node)).toEqual(["before", "middle", "after"]);
  });

  it("keeps the words that sit in bold and italic", () => {
    const node = block(paragraph(text("some "), text("boldd", [{ type: "bold" }]), text(" text")));
    expect(words(node)).toEqual(["some", "boldd", "text"]);
  });

  it("does not run a word together across an inline formula", () => {
    const node = block(
      paragraph(text("before"), { type: "inlineMath", attrs: { latex: "x^2" } }, text("after")),
    );
    expect(words(node)).toEqual(["before", "after"]);
  });

  it("finds nothing in a code block", () => {
    expect(words(block({ type: "codeBlock", content: [text("functoin hello world")] }))).toEqual(
      [],
    );
  });

  it("finds the right offsets after something that is left out", () => {
    const node = block(paragraph(text("ab ", [{ type: "code" }]), text("hello wrld")));
    const found = wordsIn(node);
    expect(found.map((w) => node.textBetween(w.from, w.to))).toEqual(["hello", "wrld"]);
  });
});
