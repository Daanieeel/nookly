import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "./editor-extensions";
import { selectedSearchText } from "./FindBar";
import {
  closeFind,
  expandReplacement,
  findStateOf,
  replaceAll,
  replaceCurrent,
  selectAllMatches,
  setFind,
  stepFind,
} from "./find-in-page";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function openNodes(...paragraphs: object[][]) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: paragraphs.map((content) => ({ type: "paragraph", content })),
    },
  });
  return editor;
}

const open = (...paragraphs: string[]) =>
  openNodes(...paragraphs.map((text) => [{ type: "text", text }]));

const selected = (e: Editor) => {
  const { from, to } = e.state.selection;
  return e.state.doc.textBetween(from, to);
};
const texts = (e: Editor) => e.getJSON().content?.map((p) => e.schema.nodeFromJSON(p).textContent);
const found = (e: Editor) => findStateOf(e.state);
/// Typing `text` the way the browser reports it, at `from` to `to`.
const typeText = (e: Editor, from: number, to: number, text: string) =>
  e.view.someProp("handleTextInput", (f) => f(e.view, from, to, text, () => e.state.tr));

describe("finding text in a page", () => {
  it("finds every match across blocks, ignoring case by default", () => {
    const e = open("Foo bar foo", "FOO", "no match");
    setFind(e.view, { query: "foo" });
    expect(found(e).matches).toHaveLength(3);
    expect(found(e).current).toBe(0);
  });

  it("selects the match it is on, and each one as it cycles", () => {
    const e = open("one two one", "one");
    setFind(e.view, { query: "one" });
    expect(selected(e)).toBe("one");
    expect(e.state.selection.from).toBe(1);
    stepFind(e.view, 1);
    expect(e.state.selection.from).toBe(9);
    stepFind(e.view, 1);
    expect(e.state.doc.resolve(e.state.selection.from).parent.textContent).toBe("one");
    expect(e.state.selection.from).toBeGreaterThan(12);
    stepFind(e.view, 1);
    expect(found(e).current).toBe(0);
    stepFind(e.view, -1);
    expect(found(e).current).toBe(2);
  });

  it("starts at the first match after the cursor", () => {
    const e = open("ab ab ab");
    e.commands.setTextSelection(5);
    setFind(e.view, { query: "ab" });
    expect(found(e).current).toBe(2);
  });

  it("matches case when asked", () => {
    const e = open("Foo foo FOO");
    setFind(e.view, { query: "foo", caseSensitive: true });
    expect(found(e).matches).toHaveLength(1);
  });

  it("matches whole words only when asked, also next to letters with accents", () => {
    const e = open("cat concat cat. Katze Katzen é-cat écat");
    setFind(e.view, { query: "cat", wholeWord: true });
    expect(found(e).matches).toHaveLength(3);
    setFind(e.view, { query: "Katze", wholeWord: false });
    expect(found(e).matches).toHaveLength(2);
    setFind(e.view, { query: "Katze", wholeWord: true });
    expect(found(e).matches).toHaveLength(1);
  });

  it("reads the query as a regular expression when asked", () => {
    const e = open("a1 b22 c333");
    setFind(e.view, { query: "[a-z]\\d+" });
    expect(found(e).matches).toHaveLength(0);
    setFind(e.view, { regex: true });
    expect(found(e).matches).toHaveLength(3);
    setFind(e.view, { query: "[a-z" });
    expect(found(e).invalid).toBe(true);
    expect(found(e).matches).toHaveLength(0);
  });

  it("finds a literal query with characters a regular expression would read", () => {
    const e = open("1+1=2 (a) [b] $5 a.b");
    for (const query of ["1+1", "(a)", "[b]", "$5", "a.b"]) {
      setFind(e.view, { query });
      expect(found(e).matches, query).toHaveLength(1);
    }
  });

  it("does not select text across a formula, and keeps positions right after one", () => {
    const e = openNodes([
      { type: "text", text: "x " },
      { type: "inlineMath", attrs: { latex: "a" } },
      { type: "text", text: " x" },
    ]);
    setFind(e.view, { query: "x" });
    expect(found(e).matches.map((m) => [m.from, m.to])).toEqual([
      [1, 2],
      [5, 6],
    ]);
    stepFind(e.view, 1);
    expect(selected(e)).toBe("x");
  });

  it("follows edits to the page", () => {
    const e = open("foo");
    setFind(e.view, { query: "foo" });
    e.commands.insertContentAt(4, " foo");
    expect(found(e).matches).toHaveLength(2);
  });

  it("clears with the bar closed, and keeps the options", () => {
    const e = open("foo");
    setFind(e.view, { query: "foo", caseSensitive: true });
    closeFind(e.view);
    expect(found(e).matches).toHaveLength(0);
    expect(found(e).query).toBe("");
    expect(found(e).caseSensitive).toBe(true);
  });
});

describe("replacing", () => {
  it("replaces the current match and moves on to the next", () => {
    const e = open("foo foo foo");
    setFind(e.view, { query: "foo" });
    replaceCurrent(e.view, "bar");
    expect(texts(e)).toEqual(["bar foo foo"]);
    expect(found(e).matches).toHaveLength(2);
    expect(selected(e)).toBe("foo");
    expect(e.state.selection.from).toBe(5);
  });

  it("replaces all matches, in one undo step", () => {
    const e = open("foo foo", "Foo");
    setFind(e.view, { query: "foo" });
    expect(replaceAll(e.view, "x")).toBe(3);
    expect(texts(e)).toEqual(["x x", "x"]);
    e.commands.undo();
    expect(texts(e)).toEqual(["foo foo", "Foo"]);
  });

  it("replaces with nothing", () => {
    const e = open("a-b-c");
    setFind(e.view, { query: "-" });
    replaceAll(e.view, "");
    expect(texts(e)).toEqual(["abc"]);
  });

  it("fills in $1 and $& with regular expressions only", () => {
    const e = open("john smith");
    setFind(e.view, { query: "(\\w+) (\\w+)", regex: true });
    const [match] = found(e).matches;
    expect(expandReplacement("$2, $1 [$&] $$", match!, true)).toBe("smith, john [john smith] $");
    expect(expandReplacement("$2, $1", match!, false)).toBe("$2, $1");
    replaceAll(e.view, "$2 $1");
    expect(texts(e)).toEqual(["smith john"]);
  });

  it("does nothing while the page cannot be edited", () => {
    const e = open("foo");
    setFind(e.view, { query: "foo" });
    e.setEditable(false);
    expect(replaceAll(e.view, "bar")).toBe(0);
    expect(replaceCurrent(e.view, "bar")).toBe(false);
    expect(texts(e)).toEqual(["foo"]);
  });
});

describe("selecting all occurrences", () => {
  it("marks every match and types over them together", () => {
    const e = open("foo bar foo");
    setFind(e.view, { query: "foo" });
    expect(selectAllMatches(e.view)).toBe(true);
    expect(found(e).multi).toHaveLength(2);
    expect(typeText(e, 1, 4, "x")).toBe(true);
    expect(texts(e)).toEqual(["x bar x"]);
    typeText(e, 2, 2, "y");
    expect(texts(e)).toEqual(["xy bar xy"]);
    expect(found(e).multi).toHaveLength(2);
  });

  it("deletes at every caret with Backspace", () => {
    const e = open("foo bar foo");
    setFind(e.view, { query: "foo" });
    selectAllMatches(e.view);
    const key = (name: string) =>
      e.view.someProp("handleKeyDown", (f) =>
        f(e.view, new KeyboardEvent("keydown", { key: name })),
      );
    key("Backspace");
    expect(texts(e)).toEqual([" bar "]);
    expect(found(e).multi).toHaveLength(2);
    typeText(e, 1, 1, "z");
    expect(texts(e)).toEqual(["z bar z"]);
  });

  it("ends when Escape is pressed or the cursor is moved", () => {
    const e = open("foo foo");
    setFind(e.view, { query: "foo" });
    selectAllMatches(e.view);
    e.view.someProp("handleKeyDown", (f) =>
      f(e.view, new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(found(e).multi).toBeNull();
    selectAllMatches(e.view);
    e.commands.setTextSelection(3);
    expect(found(e).multi).toBeNull();
    expect(typeText(e, 3, 3, "q")).toBeFalsy();
  });

  it("does nothing without matches", () => {
    const e = open("foo");
    setFind(e.view, { query: "zzz" });
    expect(selectAllMatches(e.view)).toBe(false);
  });
});

describe("the text a search starts from", () => {
  it("is the selection when it sits in one line", () => {
    const e = open("hello world");
    e.commands.setTextSelection({ from: 1, to: 6 });
    expect(selectedSearchText(e)).toBe("hello");
  });

  it("is empty for a cursor, and leaves a formula out", () => {
    const e = openNodes([
      { type: "text", text: "a " },
      { type: "inlineMath", attrs: { latex: "x" } },
      { type: "text", text: " b" },
    ]);
    expect(selectedSearchText(e)).toBe("");
    e.commands.setTextSelection({ from: 1, to: 6 });
    expect(selectedSearchText(e)).toBe("a  b");
  });

  it("spans lines with a line break, which the bar does not take", () => {
    const e = open("one", "two");
    e.commands.setTextSelection({ from: 1, to: 7 });
    expect(selectedSearchText(e)).toContain("\n");
  });
});
