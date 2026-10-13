import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { makeBlock } from "#/test/fixtures.ts";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";

// A highlight and inline code are the same kind of thing to the caret, so every test here runs
// for both.
const MARKS = [
  { name: "highlight", wrap: (text: string) => `==${text}==`, tag: "mark" },
  { name: "code", wrap: (text: string) => `\`${text}\``, tag: "code" },
] as const;

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function page(content: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: [blockToNode(makeBlock({ blockType: "paragraph", content }))],
    },
  });
  return editor;
}
const stored = (target: Editor) => {
  const doc: JSONNode = target.getJSON();
  return nodeToBlockInput(doc.content?.[0] ?? { type: "doc" })?.content;
};
const select = (target: Editor, from: number, to = from) =>
  target.view.dispatch(
    target.state.tr.setSelection(TextSelection.create(target.state.doc, from, to)),
  );
const key = (target: Editor, name: string) =>
  target.view.someProp("handleKeyDown", (f) =>
    f(target.view, new KeyboardEvent("keydown", { key: name })),
  );
/// Types the way the editor sees it: through `handleTextInput`, or straight in.
function type(target: Editor, text: string) {
  const { from, to } = target.state.selection;
  const handled = target.view.someProp("handleTextInput", (f) =>
    f(target.view, from, to, text, () => target.state.tr.insertText(text, from, to)),
  );
  if (!handled) target.view.dispatch(target.state.tr.insertText(text, from, to));
}
/// A `beforeinput` delete of `from` to `to`, as the browser sends it with its target range.
function beforeInput(target: Editor, inputType: string, from: number, to: number) {
  const first = target.view.domAtPos(from);
  const last = target.view.domAtPos(to);
  const event = new InputEvent("beforeinput", { inputType, cancelable: true, bubbles: true });
  Object.defineProperty(event, "getTargetRanges", {
    value: () => [
      {
        startContainer: first.node,
        startOffset: first.offset,
        endContainer: last.node,
        endOffset: last.offset,
      },
    ],
  });
  target.view.dom.dispatchEvent(event);
  return event;
}

describe.each(MARKS)("inline $name", ({ name, wrap, tag }) => {
  describe("deleting everything in it", () => {
    it("takes the mark with the last character, on Backspace and Delete", () => {
      const target = page(`a ${wrap("b")} d`);
      select(target, 4);
      expect(key(target, "Backspace")).toBe(true);
      expect(target.state.doc.textContent).toBe("a  d");
      expect(target.isActive(name)).toBe(false);
      type(target, "x");
      expect(stored(target)).toBe("a x d");

      const forward = page(wrap("b"));
      select(forward, 1);
      expect(key(forward, "Delete")).toBe(true);
      expect(forward.isActive(name)).toBe(false);
    });

    it("leaves a plain line behind when the line was only the mark", () => {
      const target = page(wrap("b"));
      select(target, 2);
      key(target, "Backspace");
      expect(target.state.doc.textContent).toBe("");
      expect(target.isActive(name)).toBe(false);
      type(target, "x");
      expect(stored(target)).toBe("x");
    });

    it("leaves a deletion that keeps some of the content to the editor", () => {
      const target = page(wrap("bc"));
      select(target, 3);
      expect(key(target, "Backspace")).toBeFalsy();
    });

    it("takes the mark when a whole word or line is deleted, which the browser reports as beforeinput", () => {
      for (const inputType of ["deleteWordBackward", "deleteSoftLineBackward", "deleteByCut"]) {
        const target = page(`a ${wrap("bcd")} e`);
        const event = beforeInput(target, inputType, 3, 6);
        expect(event.defaultPrevented, inputType).toBe(true);
        expect(target.state.doc.textContent).toBe("a  e");
        expect(target.isActive(name)).toBe(false);
        type(target, "x");
        expect(stored(target)).toBe("a x e");
        target.destroy();
      }
    });

    it("leaves a beforeinput delete of part of it to the browser", () => {
      const target = page(wrap("bcd"));
      expect(beforeInput(target, "deleteContentBackward", 2, 3).defaultPrevented).toBe(false);
      expect(target.state.doc.textContent).toBe("bcd");
    });

    it("types plain text where the browser left an empty element behind", () => {
      const target = page("");
      const leftover = document.createElement(tag);
      target.view.dom.querySelector("p")?.append(leftover);
      target.view.domAtPos = () => ({ node: leftover, offset: 0 });
      const { from, to } = target.state.selection;
      const handled = target.view.someProp("handleTextInput", (f) =>
        f(target.view, from, to, "x", () => target.state.tr.insertText("x", from, to)),
      );
      expect(handled).toBe(true);
      expect(stored(target)).toBe("x");
    });
  });

  describe("one started and not typed in yet", () => {
    it("is dropped by Backspace", () => {
      const target = page("ab");
      select(target, 3);
      target.commands.setMark(name);
      expect(target.state.storedMarks?.some((m) => m.type.name === name)).toBe(true);
      expect(key(target, "Backspace")).toBe(true);
      expect(target.state.doc.textContent).toBe("ab");
      type(target, "x");
      expect(stored(target)).toBe("abx");
    });
  });

  describe("the right arrow", () => {
    it("steps out at its right edge, so the next text is plain", () => {
      const target = page(`${wrap("abc")}def`);
      select(target, 4);
      expect(target.isActive(name)).toBe(true);
      expect(key(target, "ArrowRight")).toBe(true);
      expect(target.isActive(name)).toBe(false);
      type(target, "x");
      expect(stored(target)).toBe(`${wrap("abc")}xdef`);
    });

    it("steps out at the end of the line too, without adding a space", () => {
      const target = page(wrap("abc"));
      select(target, 4);
      expect(key(target, "ArrowRight")).toBe(true);
      type(target, "x");
      expect(stored(target)).toBe(`${wrap("abc")}x`);
    });

    it("shows a gap outside the mark while the caret is out, and only then", () => {
      const target = page(`${wrap("abc")}def`);
      select(target, 4);
      const gap = () => target.view.dom.querySelectorAll(".mark-exit");
      expect(gap()).toHaveLength(0);
      key(target, "ArrowRight");
      expect(gap()).toHaveLength(1);
      expect(gap()[0]?.closest(tag)).toBeNull();
      expect(key(target, "ArrowRight")).toBeFalsy();
      select(target, 5);
      expect(gap()).toHaveLength(0);
    });

    it("moves as usual inside the mark and outside it", () => {
      const target = page(`x ${wrap("abc")}`);
      select(target, 4);
      expect(key(target, "ArrowRight")).toBeFalsy();
      select(target, 1);
      expect(key(target, "ArrowRight")).toBeFalsy();
    });
  });

  describe("the left arrow at the start of a line", () => {
    const atStart = () => {
      const target = page(`${wrap("abc")} def`);
      select(target, 1);
      return target;
    };

    it("steps out to the left, so the next text is plain and before the mark", () => {
      const target = atStart();
      expect(target.isActive(name)).toBe(true);
      expect(key(target, "ArrowLeft")).toBe(true);
      expect(target.isActive(name)).toBe(false);
      type(target, "x");
      expect(stored(target)).toBe(`x${wrap("abc")} def`);
    });

    it("shows the gap between the caret and the mark, then moves on with the next arrow", () => {
      const target = atStart();
      key(target, "ArrowLeft");
      const gap = target.view.dom.querySelector(".mark-exit");
      expect(gap).not.toBeNull();
      expect(gap?.closest(tag)).toBeNull();
      expect(key(target, "ArrowLeft")).toBeFalsy();
    });

    it("is not needed where text comes before the mark", () => {
      const target = page(`a ${wrap("bc")}`);
      select(target, 3);
      expect(target.isActive(name)).toBe(false);
      expect(key(target, "ArrowLeft")).toBeFalsy();
    });
  });
});
