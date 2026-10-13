import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorExtensions } from "./editor-extensions";
import { lineEdge } from "./line-edge";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

/// A paragraph of "ab ", a formula and " cd" on one visual line, then "ef" wrapped
/// onto the next. jsdom has no layout, so each position gets the line it would sit on.
const LINE_HEIGHT = 20;
const lineOf = (pos: number) => (pos <= 8 ? 0 : 1);
const view = {
  coordsAtPos: (pos: number) => ({
    left: pos,
    right: pos,
    top: lineOf(pos) * LINE_HEIGHT,
    bottom: lineOf(pos) * LINE_HEIGHT + LINE_HEIGHT,
  }),
};

describe("lineEdge", () => {
  it("walks to the first position of the line", () => {
    expect(lineEdge(view, 6, 1, 11, -1)).toBe(1);
  });

  it("walks to the last position of the line", () => {
    expect(lineEdge(view, 4, 1, 11, 1)).toBe(8);
  });

  it("stays put at an edge", () => {
    expect(lineEdge(view, 1, 1, 11, -1)).toBe(1);
    expect(lineEdge(view, 8, 1, 11, 1)).toBe(8);
  });

  it("stops at the start of a wrapped line", () => {
    expect(lineEdge(view, 11, 1, 11, -1)).toBe(9);
  });

  it("stops at the block when a position has no coordinates", () => {
    const broken = {
      coordsAtPos: (pos: number) => {
        if (pos < 3) throw new RangeError("no position");
        return view.coordsAtPos(pos);
      },
    };
    expect(lineEdge(broken, 6, 1, 11, -1)).toBe(3);
  });
});

// Reported (#125): Cmd+Left on a line with inline math jumped to the first line of the
// note. The editor now moves to the line's edge itself on such lines.
describe("moving to the edge of a line with inline math", () => {
  function open(content: object[][]) {
    editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: {
        type: "doc",
        content: content.map((inline) => ({ type: "paragraph", content: inline })),
      },
    });
    vi.spyOn(editor.view, "coordsAtPos").mockImplementation(view.coordsAtPos as never);
    return editor;
  }
  const math = { type: "inlineMath", attrs: { latex: "x" } };
  const line = [{ type: "text", text: "ab " }, math, { type: "text", text: " cd" }];
  const press = (target: Editor, key: string, init: KeyboardEventInit = {}) =>
    target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key, ...init })),
    );
  const at = (target: Editor, pos: number) =>
    target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, pos)));

  it("moves to the start of the line on Cmd+Left", () => {
    const target = open([[{ type: "text", text: "first line" }], line]);
    const start = target.state.doc.child(0).nodeSize + 1;
    at(target, start + 6);
    expect(press(target, "ArrowLeft", { metaKey: true })).toBe(true);
    expect(target.state.selection.from).toBe(start);
  });

  it("moves to the end of the line on Cmd+Right and Home and End", () => {
    const target = open([line]);
    at(target, 3);
    expect(press(target, "ArrowRight", { metaKey: true })).toBe(true);
    const end = target.state.doc.child(0).content.size + 1;
    expect(target.state.selection.from).toBe(end);
    expect(press(target, "Home")).toBe(true);
    expect(target.state.selection.from).toBe(1);
    expect(press(target, "End")).toBe(true);
    expect(target.state.selection.from).toBe(end);
  });

  it("extends the selection with Shift", () => {
    const target = open([line]);
    at(target, 4);
    expect(press(target, "ArrowLeft", { metaKey: true, shiftKey: true })).toBe(true);
    expect(target.state.selection.anchor).toBe(4);
    expect(target.state.selection.head).toBe(1);
  });

  it("leaves lines without inline math to the browser", () => {
    const target = open([[{ type: "text", text: "plain text" }]]);
    at(target, 5);
    expect(press(target, "ArrowLeft", { metaKey: true })).toBeFalsy();
    expect(press(target, "Home")).toBeFalsy();
  });
});
