import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { editorExtensions } from "./editor-extensions";
import { vimState } from "./vim-extension";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  settings.set("notes.vimMode", false);
});
beforeEach(() => settings.set("notes.vimMode", true));

const para = (text: string, id = "p"): JSONContent => ({
  type: "paragraph",
  attrs: { blockId: id },
  content: text ? [{ type: "text", text }] : undefined,
});

/// A page of paragraphs with the caret at `offset` in the first.
function open(texts: string[], offset = 0) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: texts.map((t, i) => para(t, `p${i}`)) },
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1 + offset)),
  );
  return editor;
}

/// Presses one key the way the browser delivers it. Returns whether the editor took it.
function press(target: Editor, key: string, init: KeyboardEventInit = {}): boolean {
  return Boolean(
    target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key, ...init })),
    ),
  );
}
/// Presses each character of `sequence` in turn (`<Esc>` is the Escape key).
function keys(target: Editor, sequence: string) {
  for (const key of sequence
    .split(/(<Esc>|<C-r>|<Enter>)/)
    .flatMap((part) => (/^<.*>$/.test(part) ? [part] : [...part]))) {
    if (key === "<Esc>") press(target, "Escape");
    else if (key === "<C-r>") press(target, "r", { ctrlKey: true });
    else if (key === "<Enter>") press(target, "Enter");
    else
      press(
        target,
        key,
        key === key.toUpperCase() && key !== key.toLowerCase() ? { shiftKey: true } : {},
      );
  }
}
const lines = (target: Editor) => target.state.doc.children.map((n) => n.textContent);
const caret = (target: Editor) => target.state.selection.from - 1;
const mode = (target: Editor) => vimState(target.state).mode;

describe("with Vim mode off", () => {
  it("leaves every key to the editor", () => {
    settings.set("notes.vimMode", false);
    const target = open(["hello"]);
    expect(press(target, "x")).toBe(false);
    expect(press(target, "Escape")).toBe(false);
    expect(lines(target)).toEqual(["hello"]);
  });
});

describe("modes", () => {
  it("starts in normal mode and does not type letters", () => {
    const target = open(["hello"]);
    expect(mode(target)).toBe("normal");
    expect(press(target, "z")).toBe(true);
    expect(lines(target)).toEqual(["hello"]);
  });

  it("types in insert mode and goes back to normal on Escape, one character left", () => {
    const target = open(["hello"], 2);
    keys(target, "i");
    expect(mode(target)).toBe("insert");
    expect(press(target, "z")).toBe(false);
    target.view.dispatch(target.state.tr.insertText("Z"));
    keys(target, "<Esc>");
    expect(mode(target)).toBe("normal");
    expect(lines(target)).toEqual(["heZllo"]);
    expect(caret(target)).toBe(2);
  });

  it("enters insert mode at the right place with a, A, I, o and O", () => {
    const target = open(["  hello", "next"], 3);
    keys(target, "a");
    expect(caret(target)).toBe(4);
    keys(target, "<Esc>A");
    expect(caret(target)).toBe(7);
    keys(target, "<Esc>I");
    expect(caret(target)).toBe(2);
    keys(target, "<Esc>o");
    expect(lines(target)).toEqual(["  hello", "", "next"]);
    expect(mode(target)).toBe("insert");
    keys(target, "<Esc>O");
    expect(lines(target)).toEqual(["  hello", "", "", "next"]);
  });

  it("leaves shortcuts with Cmd or Ctrl to the app, and arrow keys to the editor", () => {
    const target = open(["hello"]);
    expect(press(target, "k", { metaKey: true })).toBe(false);
    expect(press(target, "k", { ctrlKey: true })).toBe(false);
    expect(press(target, "ArrowRight")).toBe(false);
    expect(press(target, "F5")).toBe(false);
  });

  it("does not take keys while the setting is off, even in the middle of a mode", () => {
    const target = open(["hello"]);
    keys(target, "i");
    settings.set("notes.vimMode", false);
    expect(press(target, "Escape")).toBe(false);
  });
});

describe("motions", () => {
  it("moves with h and l without leaving the line", () => {
    const target = open(["abc"], 1);
    keys(target, "l");
    expect(caret(target)).toBe(2);
    keys(target, "l");
    expect(caret(target)).toBe(2);
    keys(target, "hhh");
    expect(caret(target)).toBe(0);
  });

  it("goes to the line start, first word and end with 0, ^ and $", () => {
    const target = open(["  hello world"], 5);
    keys(target, "0");
    expect(caret(target)).toBe(0);
    keys(target, "^");
    expect(caret(target)).toBe(2);
    keys(target, "$");
    expect(caret(target)).toBe(12);
  });

  it("moves by word with w, b and e", () => {
    const target = open(["foo bar baz"]);
    keys(target, "w");
    expect(caret(target)).toBe(4);
    keys(target, "e");
    expect(caret(target)).toBe(6);
    keys(target, "w");
    expect(caret(target)).toBe(8);
    keys(target, "b");
    expect(caret(target)).toBe(4);
    keys(target, "bb");
    expect(caret(target)).toBe(0);
  });

  it("goes down and up through lines with j and k, keeping its column", () => {
    const target = open(["abcdef", "ab", "abcdef"], 4);
    keys(target, "j");
    expect(target.state.selection.$from.index(0)).toBe(1);
    expect(target.state.selection.$from.parentOffset).toBe(1);
    keys(target, "j");
    expect(target.state.selection.$from.index(0)).toBe(2);
    expect(target.state.selection.$from.parentOffset).toBe(4);
    keys(target, "kk");
    expect(target.state.selection.$from.index(0)).toBe(0);
  });

  it("goes to the first and last line with gg and G", () => {
    const target = open(["one", "two", "three"], 1);
    keys(target, "G");
    expect(target.state.selection.$from.index(0)).toBe(2);
    keys(target, "gg");
    expect(target.state.selection.$from.index(0)).toBe(0);
  });

  it("takes a count", () => {
    const target = open(["a b c d e"]);
    keys(target, "3w");
    expect(caret(target)).toBe(6);
    keys(target, "2l");
    expect(caret(target)).toBe(8);
  });
});

describe("editing", () => {
  it("deletes characters with x, also counted", () => {
    const target = open(["hello"]);
    keys(target, "x");
    expect(lines(target)).toEqual(["ello"]);
    keys(target, "2x");
    expect(lines(target)).toEqual(["lo"]);
  });

  it("deletes with an operator and a motion", () => {
    const target = open(["foo bar baz"]);
    keys(target, "dw");
    expect(lines(target)).toEqual(["bar baz"]);
    keys(target, "d$");
    expect(lines(target)).toEqual([""]);
  });

  it("deletes the rest of the line with D and to the start with d0", () => {
    const target = open(["foo bar"], 4);
    keys(target, "D");
    expect(lines(target)).toEqual(["foo "]);
    // Like Vim, d0 stops before the character under the cursor, the last space here.
    keys(target, "d0");
    expect(lines(target)).toEqual([" "]);
  });

  it("deletes whole lines with dd, also counted", () => {
    const target = open(["one", "two", "three", "four"]);
    keys(target, "dd");
    expect(lines(target)).toEqual(["two", "three", "four"]);
    keys(target, "2dd");
    expect(lines(target)).toEqual(["four"]);
    keys(target, "dd");
    expect(lines(target)).toEqual([""]);
  });

  it("changes text and enters insert mode with cw, cc and C", () => {
    const target = open(["foo bar"]);
    keys(target, "cw");
    expect(lines(target)).toEqual([" bar"]);
    expect(mode(target)).toBe("insert");
    keys(target, "<Esc>cc");
    expect(lines(target)).toEqual([""]);
    expect(mode(target)).toBe("insert");
  });

  it("works on text objects: diw, daw and ciw", () => {
    const target = open(["foo bar baz"], 5);
    keys(target, "diw");
    expect(lines(target)).toEqual(["foo  baz"]);
    keys(target, "<Esc>");
    const second = open(["foo bar baz"], 5);
    keys(second, "daw");
    expect(lines(second)).toEqual(["foo baz"]);
    const third = open(["foo bar baz"], 5);
    keys(third, "ciw");
    expect(lines(third)).toEqual(["foo  baz"]);
    expect(mode(third)).toBe("insert");
  });

  it("copies with yy and yw and pastes with p and P", () => {
    const target = open(["one", "two"]);
    keys(target, "yyp");
    expect(lines(target)).toEqual(["one", "one", "two"]);
    keys(target, "ywj$p");
    expect(lines(target)).toEqual(["one", "one", "twoone"]);
    keys(target, "P");
    expect(lines(target)).toEqual(["one", "one", "twoononee"]);
  });

  it("pastes what dd removed", () => {
    const target = open(["one", "two"]);
    keys(target, "ddp");
    expect(lines(target)).toEqual(["two", "one"]);
  });

  it("replaces a character with r", () => {
    const target = open(["cat"]);
    keys(target, "rb");
    expect(lines(target)).toEqual(["bat"]);
    expect(mode(target)).toBe("normal");
  });

  it("undoes and redoes with u and Ctrl+R", () => {
    const target = open(["hello"]);
    keys(target, "x");
    expect(lines(target)).toEqual(["ello"]);
    keys(target, "u");
    expect(lines(target)).toEqual(["hello"]);
    keys(target, "<C-r>");
    expect(lines(target)).toEqual(["ello"]);
  });

  it("does nothing for an operator Escape cancels", () => {
    const target = open(["hello"]);
    keys(target, "d<Esc>w");
    expect(lines(target)).toEqual(["hello"]);
  });
});

describe("visual mode", () => {
  it("selects with v and motions, then deletes, copies or changes", () => {
    const target = open(["hello world"]);
    keys(target, "vee");
    expect(mode(target)).toBe("visual");
    keys(target, "d");
    expect(lines(target)).toEqual([""]);
    expect(mode(target)).toBe("normal");

    const second = open(["hello world"]);
    keys(second, "vey$p");
    expect(lines(second)).toEqual(["hello worldhello"]);

    const third = open(["hello world"]);
    keys(third, "vec");
    expect(lines(third)).toEqual([" world"]);
    expect(mode(third)).toBe("insert");
  });

  it("selects whole lines with V", () => {
    const target = open(["one", "two", "three"]);
    keys(target, "Vjd");
    expect(lines(target)).toEqual(["three"]);
  });

  it("leaves visual mode on Escape without changing the text", () => {
    const target = open(["hello"]);
    keys(target, "vl<Esc>");
    expect(mode(target)).toBe("normal");
    expect(lines(target)).toEqual(["hello"]);
    expect(target.state.selection.empty).toBe(true);
  });

  it("deletes with x too", () => {
    const target = open(["hello"]);
    keys(target, "vlx");
    expect(lines(target)).toEqual(["llo"]);
  });
});

describe("help", () => {
  it("opens the key help with ? and closes it with Escape", () => {
    const target = open(["hello"]);
    keys(target, "?");
    expect(vimState(target.state).help).toBe(true);
    keys(target, "<Esc>");
    expect(vimState(target.state).help).toBe(false);
  });
});
