import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorExtensions } from "../notes/editor-extensions";
import type { SpellSource } from "./spellcheck-extension";
import { misspelledWordAt } from "./spellcheck-extension";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function text(
  value: string,
  marks: { type: string; attrs?: { href: string } }[] = [],
): JSONContent {
  const node: JSONContent = { type: "text", text: value };
  if (marks.length > 0) node.marks = marks;
  return node;
}
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });

/// A spell checker that finds these words wrong, and records what it was asked.
function fakeSource(wrong: string[], on = true) {
  const listeners = new Set<() => void>();
  const asked: string[][] = [];
  const state = { on, wrong };
  const source: SpellSource = {
    enabled: () => state.on,
    check: async (words) => {
      asked.push(words);
      return words.map((word) => !state.wrong.includes(word));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, asked, state, changed: () => listeners.forEach((l) => l()) };
}

function open(content: JSONContent[], source: SpellSource) {
  editor = new Editor({
    extensions: [
      ...editorExtensions({
        spaceId: "s",
        pageId: "p",
        getEntities: () => [],
        spellSource: source,
      }),
    ],
    content: { type: "doc", content },
  });
  return editor;
}

const underlined = (view: Editor) =>
  [...view.view.dom.querySelectorAll(".spell-error")].map((el) => el.textContent);

describe("the spell checker in the editor", () => {
  it("underlines nothing, and asks nothing, while it is off", async () => {
    const fake = fakeSource(["wrng"], false);
    const view = open([paragraph(text("a wrng word"))], fake.source);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(underlined(view)).toEqual([]);
    expect(fake.asked).toEqual([]);
  });

  it("underlines the words that are wrong once it has checked them", async () => {
    const fake = fakeSource(["wrng", "mispeled"]);
    const view = open(
      [paragraph(text("a wrng word")), paragraph(text("mispeled too"))],
      fake.source,
    );
    await vi.waitFor(() => expect(underlined(view)).toEqual(["wrng", "mispeled"]));
    // Each word is asked about once, however often it occurs.
    expect(fake.asked.flat().toSorted()).toEqual(["mispeled", "too", "word", "wrng"].toSorted());
  });

  it("does not check code, links or mentions", async () => {
    const fake = fakeSource(["xqzv"]);
    const view = open(
      [
        paragraph(
          text("hello "),
          text("xqzv", [{ type: "code" }]),
          text(" "),
          text("xqzv", [{ type: "link", attrs: { href: "https://example.com" } }]),
          text(" "),
          text("xqzv", [{ type: "link", attrs: { href: "mention:abc-1" } }]),
        ),
        { type: "codeBlock", content: [text("xqzv")] },
      ],
      fake.source,
    );
    await vi.waitFor(() => expect(fake.asked.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fake.asked.flat()).toEqual(["hello"]);
    expect(underlined(view)).toEqual([]);
  });

  it("underlines a word typed wrong, but not while the cursor is still in it", async () => {
    const fake = fakeSource(["wrng"]);
    const view = open([paragraph(text("hello"))], fake.source);
    await vi.waitFor(() => expect(fake.asked.flat()).toContain("hello"));
    view.commands.setTextSelection(6);
    view.commands.insertContent(" wrng");
    await vi.waitFor(() => expect(fake.asked.flat()).toContain("wrng"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The cursor sits at the end of the word.
    expect(underlined(view)).toEqual([]);
    view.commands.insertContent(" ");
    await vi.waitFor(() => expect(underlined(view)).toEqual(["wrng"]));
  });

  it("takes the underline off a word that was fixed", async () => {
    const fake = fakeSource(["wrng"]);
    const view = open([paragraph(text("a wrng b"))], fake.source);
    await vi.waitFor(() => expect(underlined(view)).toEqual(["wrng"]));
    view.view.dispatch(view.state.tr.insertText("wrong", 3, 7));
    view.commands.setTextSelection(1);
    await vi.waitFor(() => expect(underlined(view)).toEqual([]));
  });

  it("checks everything again when the languages or words change", async () => {
    const fake = fakeSource(["wrng"]);
    const view = open([paragraph(text("a wrng b"))], fake.source);
    await vi.waitFor(() => expect(underlined(view)).toEqual(["wrng"]));
    const before = fake.asked.flat().length;
    fake.state.wrong = [];
    fake.changed();
    await vi.waitFor(() => expect(fake.asked.flat().length).toBeGreaterThan(before));
    await vi.waitFor(() => expect(underlined(view)).toEqual([]));
  });

  it("stops underlining when it is turned off", async () => {
    const fake = fakeSource(["wrng"]);
    const view = open([paragraph(text("a wrng b"))], fake.source);
    await vi.waitFor(() => expect(underlined(view)).toEqual(["wrng"]));
    fake.state.on = false;
    fake.changed();
    await vi.waitFor(() => expect(underlined(view)).toEqual([]));
  });

  it("finds the misspelled word at a position, for the right click menu", async () => {
    const fake = fakeSource(["wrng"]);
    const view = open([paragraph(text("a wrng b"))], fake.source);
    await vi.waitFor(() => expect(underlined(view)).toEqual(["wrng"]));
    view.view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(misspelledWordAt(view.state, 5)).toEqual({ word: "wrng", from: 3, to: 7 });
    expect(misspelledWordAt(view.state, 1)).toBeNull();
  });

  it("stays quick on a long page: typing asks about the new word only", async () => {
    const fake = fakeSource(["wrng"]);
    const paragraphs = Array.from({ length: 2000 }, (_, i) =>
      paragraph(text(`line ${i} has some ordinary words in it`)),
    );
    const view = open(paragraphs, fake.source);
    await vi.waitFor(() => expect(fake.asked.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 300));
    fake.asked.length = 0;
    const started = performance.now();
    for (let i = 0; i < 20; i++) view.commands.insertContentAt(2, "x");
    const took = performance.now() - started;
    expect(took).toBeLessThan(1500);
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Only words of the paragraph that was typed in were asked about.
    expect(fake.asked.flat().every((word) => word.endsWith("ine") || word.startsWith("x"))).toBe(
      true,
    );
    expect(fake.asked.flat().length).toBeLessThan(80);
  });
});
