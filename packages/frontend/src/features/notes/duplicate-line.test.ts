import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { IS_MAC } from "#/lib/platform.ts";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value: string) => ({ type: "paragraph", content: [text(value)] });
const code = (value: string) => ({ type: "codeBlock", content: [text(value)] });

function open(content: object[]) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content },
  });
  return editor;
}

/// The key press itself, so the shortcut registration is covered too.
function pressDuplicate(view: Editor) {
  return view.view.someProp("handleKeyDown", (f) =>
    f(view.view, new KeyboardEvent("keydown", { key: "d", metaKey: IS_MAC, ctrlKey: !IS_MAC })),
  );
}

/// Puts the cursor `offset` characters into the nth text block that contains `needle`.
function cursorIn(view: Editor, needle: string, offset: number) {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found === -1 && node.isTextblock && node.textContent.includes(needle)) found = pos + 1;
    return found === -1;
  });
  if (found === -1) throw new Error(needle);
  view.view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, found + offset)),
  );
}

/// The cursor as a column inside its text block.
const column = (view: Editor) => view.state.selection.$head.parentOffset;
const blockText = (view: Editor) => view.state.selection.$head.parent.textContent;

describe("Cmd+D duplicates the current line", () => {
  it("copies a paragraph below it and keeps the original", () => {
    const view = open([paragraph("first"), paragraph("second line")]);
    cursorIn(view, "second", 3);
    expect(pressDuplicate(view)).toBe(true);
    const lines = (view.getJSON().content ?? []).map((_, i) => view.state.doc.child(i).textContent);
    expect(lines).toEqual(["first", "second line", "second line"]);
  });

  it("puts the cursor in the copy, in the same column", () => {
    const view = open([paragraph("hello world")]);
    cursorIn(view, "hello", 6);
    pressDuplicate(view);
    expect(view.state.selection.$head.index(0)).toBe(1);
    expect(column(view)).toBe(6);
    expect(blockText(view)).toBe("hello world");
  });

  it("keeps the formatting of the line", () => {
    const view = open([
      { type: "paragraph", content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }] },
    ]);
    cursorIn(view, "bold", 0);
    pressDuplicate(view);
    const [a, b] = view.getJSON().content ?? [];
    expect(b.content).toEqual(a.content);
  });

  it("gives the copy its own block id", () => {
    const view = open([paragraph("one")]);
    cursorIn(view, "one", 0);
    pressDuplicate(view);
    const ids = (view.getJSON().content ?? []).map((n) => n.attrs?.blockId);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("copies one line of a code block, not the whole block", () => {
    const view = open([code("let a = 1;\nlet b = 2;\nlet c = 3;")]);
    cursorIn(view, "let a", 0);
    cursorIn(view, "let a", "let a = 1;\nlet b".length);
    pressDuplicate(view);
    expect(view.state.doc.child(0).textContent).toBe(
      "let a = 1;\nlet b = 2;\nlet b = 2;\nlet c = 3;",
    );
  });

  it("keeps the column in a code line", () => {
    const view = open([code("one\ntwo three")]);
    cursorIn(view, "one", "one\ntwo t".length);
    pressDuplicate(view);
    const { $head } = view.state.selection;
    const before = $head.parent.textContent.slice(0, $head.parentOffset);
    expect(before).toBe("one\ntwo three\ntwo t");
  });

  it("copies the last line of a code block even when it is the shortest", () => {
    const view = open([code("a long first line\nx")]);
    cursorIn(view, "x", "a long first line\nx".length);
    pressDuplicate(view);
    expect(view.state.doc.child(0).textContent).toBe("a long first line\nx\nx");
    const { $head } = view.state.selection;
    expect($head.parentOffset).toBe("a long first line\nx\nx".length);
  });

  it("copies a code line at the very start of the block", () => {
    const view = open([code("\nsecond")]);
    cursorIn(view, "second", 0);
    pressDuplicate(view);
    expect(view.state.doc.child(0).textContent).toBe("\n\nsecond");
  });

  it("copies a list entry as another entry of the same list", () => {
    const view = open([
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [paragraph("milk")] },
          { type: "listItem", content: [paragraph("eggs")] },
        ],
      },
    ]);
    cursorIn(view, "milk", 2);
    pressDuplicate(view);
    const list = view.state.doc.child(0);
    expect(list.childCount).toBe(3);
    expect(list.children.map((item) => item.textContent)).toEqual(["milk", "milk", "eggs"]);
    expect(column(view)).toBe(2);
  });

  it("copies a task with its checked state", () => {
    const view = open([
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [paragraph("done")] },
          { type: "taskItem", attrs: { checked: false }, content: [paragraph("todo")] },
        ],
      },
    ]);
    cursorIn(view, "done", 4);
    pressDuplicate(view);
    const tasks = view.state.doc.child(0).children.map((t) => [t.textContent, t.attrs.checked]);
    expect(tasks).toEqual([
      ["done", true],
      ["done", true],
      ["todo", false],
    ]);
  });

  it("is one undo step", () => {
    const view = open([paragraph("keep"), paragraph("again")]);
    cursorIn(view, "again", 2);
    pressDuplicate(view);
    expect(view.state.doc.childCount).toBe(3);
    view.commands.undo();
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.textContent).toBe("keepagain");
  });

  it("does nothing without a text cursor", () => {
    const view = open([{ type: "divider" }, paragraph("x")]);
    view.commands.selectAll();
    expect(pressDuplicate(view)).toBeFalsy();
    expect(view.state.doc.childCount).toBe(2);
  });
});
