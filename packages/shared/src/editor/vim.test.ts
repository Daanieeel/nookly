// @vitest-environment jsdom
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, describe, expect, it } from "vitest";
import { closeVimHelp, vimPlugin, vimState } from "./vim.ts";

/// The plugin on a plain ProseMirror editor, as the phone runs it (the desktop's TipTap
/// tests in `packages/frontend` cover the keys themselves in depth).
const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", toDOM: () => ["p", 0] },
    text: {},
  },
});

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function open(texts: string[], options: { enabled?: () => boolean } = {}) {
  const calls: string[] = [];
  const doc = schema.node(
    "doc",
    null,
    texts.map((t) => schema.node("paragraph", null, t ? [schema.text(t)] : [])),
  );
  const state = EditorState.create({
    doc,
    plugins: [
      vimPlugin({
        enabled: options.enabled ?? (() => true),
        undo: () => {
          calls.push("undo");
          return true;
        },
        redo: () => {
          calls.push("redo");
          return true;
        },
      }),
    ],
  });
  const editor = new EditorView(document.createElement("div"), { state });
  editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)));
  view = editor;
  return { editor, calls };
}

/// Presses keys one by one; returns whether the plugin took the last one.
function press(editor: EditorView, keys: string[], init: KeyboardEventInit = {}): boolean {
  let taken = false;
  for (const key of keys) {
    const event = new KeyboardEvent("keydown", { key, ...init });
    taken = editor.someProp("handleKeyDown", (f) => f(editor, event)) ?? false;
  }
  return taken;
}

const text = (editor: EditorView) =>
  editor.state.doc.content.content.map((p) => p.textContent).join("|");

describe("vimPlugin on a plain ProseMirror editor", () => {
  it("starts in normal mode and edits with motions and operators", () => {
    const { editor } = open(["foo bar baz"]);
    expect(vimState(editor.state).mode).toBe("normal");
    expect(editor.dom.getAttribute("data-vim-mode")).toBe("normal");
    press(editor, ["d", "w"]);
    expect(text(editor)).toBe("bar baz");
    press(editor, ["x"]);
    expect(text(editor)).toBe("ar baz");
  });

  it("types in insert mode and goes back to normal on Escape", () => {
    const { editor } = open(["abc"]);
    press(editor, ["i"]);
    expect(vimState(editor.state).mode).toBe("insert");
    expect(press(editor, ["q"])).toBe(false);
    expect(press(editor, ["Escape"])).toBe(true);
    expect(vimState(editor.state).mode).toBe("normal");
  });

  it("hands u and Ctrl+R to the editor's own undo and redo", () => {
    const { editor, calls } = open(["abc"]);
    press(editor, ["u"]);
    press(editor, ["r"], { ctrlKey: true });
    expect(calls).toEqual(["undo", "redo"]);
  });

  it("opens the key list on ? and closes it when asked", () => {
    const { editor } = open(["abc"]);
    press(editor, ["?"]);
    expect(vimState(editor.state).help).toBe(true);
    closeVimHelp(editor);
    expect(vimState(editor.state).help).toBe(false);
  });

  it("leaves every key to the editor while off", () => {
    let on = false;
    const { editor } = open(["abc"], { enabled: () => on });
    expect(press(editor, ["x"])).toBe(false);
    expect(text(editor)).toBe("abc");
    expect(editor.dom.getAttribute("data-vim-mode")).toBeNull();
    on = true;
    expect(press(editor, ["x"])).toBe(true);
    expect(text(editor)).toBe("bc");
  });

  it("draws a block cursor in normal mode and none while off", () => {
    const { editor } = open(["abc"]);
    expect(editor.dom.querySelector(".vim-cursor")?.textContent).toBe("a");
    press(editor, ["i"]);
    expect(editor.dom.querySelector(".vim-cursor")).toBeNull();
  });
});
