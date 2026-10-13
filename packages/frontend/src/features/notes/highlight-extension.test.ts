import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { makeBlock } from "#/test/fixtures.ts";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import { Highlight } from "./highlight-extension";

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
const docOf = (target: Editor): JSONNode => target.getJSON();
const storedParagraph = (target: Editor) =>
  nodeToBlockInput(docOf(target).content?.[0] ?? { type: "doc" })?.content;
const marksOf = (target: Editor) =>
  docOf(target).content?.[0]?.content?.map((n) => [n.text, n.marks?.map((m) => m.type)]);

describe("the highlight mark in a page", () => {
  it("reads ==text== from the stored page and writes it back unchanged", () => {
    const target = page("see ==this== and **that**");
    expect(marksOf(target)).toEqual([
      ["see ", undefined],
      ["this", ["highlight"]],
      [" and ", undefined],
      ["that", ["bold"]],
    ]);
    expect(storedParagraph(target)).toBe("see ==this== and **that**");
  });

  it("highlights the selection from the command and takes it off again", () => {
    const target = page("hello world");
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, 1, 6)),
    );
    expect(target.commands.toggleHighlight()).toBe(true);
    expect(storedParagraph(target)).toBe("==hello== world");
    target.commands.toggleHighlight();
    expect(storedParagraph(target)).toBe("hello world");
  });

  it("highlights with Mod+Shift+H", () => {
    const target = page("hello world");
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, 7, 12)),
    );
    const handled = target.view.someProp("handleKeyDown", (f) =>
      f(
        target.view,
        new KeyboardEvent("keydown", { key: "H", keyCode: 72, shiftKey: true, ctrlKey: true }),
      ),
    );
    expect(handled).toBe(true);
    expect(storedParagraph(target)).toBe("hello ==world==");
  });

  it("turns ==text== into a highlight as the closing marker is typed", () => {
    const target = page("");
    const type = (text: string) => {
      const { from, to } = target.state.selection;
      const handled = target.view.someProp("handleTextInput", (f) =>
        f(target.view, from, to, text, () => target.state.tr.insertText(text, from, to)),
      );
      if (!handled) target.view.dispatch(target.state.tr.insertText(text, from, to));
    };
    for (const char of "==marked==") type(char);
    expect(marksOf(target)).toEqual([["marked", ["highlight"]]]);
    expect(storedParagraph(target)).toBe("==marked==");
  });

  it("keeps a highlight next to bold, italic and inline math", () => {
    const stored = "==**bold** and *italic* and $x^2$==";
    expect(storedParagraph(page(stored))).toBe(stored);
  });

  it("leaves a page without highlights exactly as it was", () => {
    for (const plain of [
      "a == b",
      "plain **bold** *italic* `code`",
      "$x$ and [l](mention:abc-1)",
    ]) {
      expect(storedParagraph(page(plain))).toBe(plain);
    }
  });
});

describe("the highlight mark in a markdown editor", () => {
  it("reads and writes ==text== through real markdown", () => {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit, Markdown, Highlight],
      content: "a ==b== **c ==d== e**",
      contentType: "markdown",
    });
    const marks = docOf(editor)
      .content?.[0]?.content?.filter((n) => n.marks?.some((m) => m.type === "highlight"))
      .map((n) => n.text);
    expect(marks).toEqual(["b", "d"]);
    expect(editor.getMarkdown()).toContain("==b==");
    expect(editor.getMarkdown()).toContain("==d==");
  });

  it("leaves text without highlights alone", () => {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit, Markdown, Highlight],
      content: "if a == b then c",
      contentType: "markdown",
    });
    expect(editor.getMarkdown()).toBe("if a == b then c");
  });
});

describe("starting a highlight by typing ==", () => {
  function typeInto(target: Editor, text: string) {
    for (const char of text) {
      const { from, to } = target.state.selection;
      const handled = target.view.someProp("handleTextInput", (f) =>
        f(target.view, from, to, char, () => target.state.tr.insertText(char, from, to)),
      );
      if (!handled) {
        const marks = target.state.storedMarks;
        const tr = target.state.tr.insertText(char, from, to);
        if (marks) tr.ensureMarks(marks);
        target.view.dispatch(tr);
      }
    }
  }
  it("starts highlighting after the second =, without leaving the markers in the text", () => {
    const target = page("");
    typeInto(target, "==abc");
    expect(marksOf(target)).toEqual([["abc", ["highlight"]]]);
    expect(storedParagraph(target)).toBe("==abc==");
  });

  it("stops highlighting when == is typed again", () => {
    const target = page("");
    typeInto(target, "==abc==def");
    expect(marksOf(target)).toEqual([
      ["abc", ["highlight"]],
      ["def", undefined],
    ]);
    expect(storedParagraph(target)).toBe("==abc==def");
  });

  it("works in the middle of a line", () => {
    const target = page("");
    typeInto(target, "see ==this== now");
    expect(storedParagraph(target)).toBe("see ==this== now");
  });

  it("leaves a single = alone", () => {
    const target = page("");
    typeInto(target, "a=b");
    expect(storedParagraph(target)).toBe("a=b");
  });

  const arrowRight = (target: Editor) =>
    target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key: "ArrowRight" })),
    );

  it("steps out of the highlight at its end, so the next text is plain", () => {
    const target = page("");
    typeInto(target, "==abc");
    expect(arrowRight(target)).toBe(true);
    typeInto(target, "def");
    expect(storedParagraph(target)).toBe("==abc==def");
  });

  // The caret has no other place to be drawn, so a small gap shows it outside the highlight.
  it("shows a gap after the highlight while the caret is outside it, and only then", () => {
    const target = page("==abc==def");
    target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 4)));
    const gap = () => target.view.dom.querySelectorAll(".highlight-exit");
    expect(gap()).toHaveLength(0);
    arrowRight(target);
    expect(gap()).toHaveLength(1);
    // The gap sits outside the highlight's own element.
    expect(gap()[0]?.closest("mark")).toBeNull();
    // The next arrow is the browser's own move, which changes the selection.
    expect(arrowRight(target)).toBeFalsy();
    target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 5)));
    expect(gap()).toHaveLength(0);
  });

  describe("at the start of a line", () => {
    const arrowLeft = (target: Editor) =>
      target.view.someProp("handleKeyDown", (f) =>
        f(target.view, new KeyboardEvent("keydown", { key: "ArrowLeft" })),
      );
    const atStart = () => {
      const target = page("==abc== def");
      target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 1)));
      return target;
    };

    it("types inside the highlight until the caret steps out to its left", () => {
      const target = atStart();
      expect(target.isActive("highlight")).toBe(true);
      expect(arrowLeft(target)).toBe(true);
      expect(target.isActive("highlight")).toBe(false);
      typeInto(target, "x");
      expect(storedParagraph(target)).toBe("x==abc== def");
    });

    it("shows the gap between the caret and the highlight", () => {
      const target = atStart();
      arrowLeft(target);
      const gap = target.view.dom.querySelector(".highlight-exit");
      expect(gap).not.toBeNull();
      expect(gap?.closest("mark")).toBeNull();
    });

    it("moves on to the line before with the next arrow", () => {
      const target = atStart();
      arrowLeft(target);
      expect(arrowLeft(target)).toBeFalsy();
    });

    it("steps back into the highlight with ArrowRight", () => {
      const target = atStart();
      arrowLeft(target);
      expect(arrowRight(target)).toBeFalsy();
    });

    it("is not needed where text comes before the highlight", () => {
      const target = page("a ==bc==");
      target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 3)));
      expect(target.isActive("highlight")).toBe(false);
      expect(arrowLeft(target)).toBeFalsy();
    });

    it("leaves ArrowLeft alone inside a highlight", () => {
      const target = page("==abc==");
      target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 3)));
      expect(arrowLeft(target)).toBeFalsy();
    });
  });

  it("drops the gap as soon as text is typed", () => {
    const target = page("");
    typeInto(target, "==abc");
    arrowRight(target);
    expect(target.view.dom.querySelectorAll(".highlight-exit")).toHaveLength(1);
    typeInto(target, "d");
    expect(target.view.dom.querySelectorAll(".highlight-exit")).toHaveLength(0);
  });

  it("steps out of a highlight that text follows in the same way, then moves on", () => {
    const target = page("==abc==def");
    target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 4)));
    expect(arrowRight(target)).toBe(true);
    expect(target.state.selection.from).toBe(4);
    expect(arrowRight(target)).toBeFalsy();
  });

  it("leaves a highlight that nothing was typed in yet, to type plain text", () => {
    const target = page("");
    typeInto(target, "==");
    expect(arrowRight(target)).toBe(true);
    typeInto(target, "plain");
    expect(storedParagraph(target)).toBe("plain");
  });

  it("moves normally with ArrowRight inside a highlight", () => {
    const target = page("==abc==");
    target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 2)));
    const handled = target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key: "ArrowRight" })),
    );
    expect(handled).toBeFalsy();
  });

  it("leaves ArrowRight alone outside a highlight", () => {
    const target = page("abc");
    const handled = target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key: "ArrowRight" })),
    );
    expect(handled).toBeFalsy();
  });
});

describe("the highlight colour", () => {
  it("is set on the highlighted text around the caret", () => {
    const target = page("a ==bcd== e");
    target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 4)));
    expect(target.commands.setHighlightColor("green")).toBe(true);
    expect(storedParagraph(target)).toBe("a =={green}bcd== e");
    target.commands.setHighlightColor("yellow");
    expect(storedParagraph(target)).toBe("a ==bcd== e");
  });

  it("applies to the next typed text when the highlight is still empty", () => {
    const target = page("");
    target.commands.toggleHighlight();
    target.commands.setHighlightColor("pink");
    target.view.dispatch(target.state.tr.insertText("x"));
    expect(storedParagraph(target)).toBe("=={pink}x==");
  });

  it("does nothing outside a highlight", () => {
    const target = page("abc");
    expect(target.commands.setHighlightColor("green")).toBe(false);
  });

  it("is a data-color on the mark, so the stylesheet can paint it", () => {
    const target = page("=={green}abc==");
    expect(target.getHTML()).toContain('<mark data-color="green">abc</mark>');
  });
});

// Deleting everything inside an inline mark takes the mark away with it, so a line emptied
// this way is a plain line and typing in it is plain.
describe("deleting all of a highlight or of inline code", () => {
  const key = (target: Editor, name: string) =>
    target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key: name })),
    );
  const select = (target: Editor, from: number, to = from) =>
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, from, to)),
    );
  const typePlain = (target: Editor, text: string) => {
    const { from, to } = target.state.selection;
    const handled = target.view.someProp("handleTextInput", (f) =>
      f(target.view, from, to, text, () => target.state.tr.insertText(text, from, to)),
    );
    if (!handled) target.view.dispatch(target.state.tr.insertText(text, from, to));
  };

  it.each([
    ["==", "highlight"],
    ["`", "code"],
  ])("removes %s marks when the last character goes with Backspace", (marker, mark) => {
    const target = page(`a ${marker}b${marker} d`);
    select(target, 4);
    expect(key(target, "Backspace")).toBe(true);
    expect(target.state.doc.textContent).toBe("a  d");
    expect(target.isActive(mark)).toBe(false);
    typePlain(target, "x");
    expect(storedParagraph(target)).toBe("a x d");
  });

  it.each([
    ["==", "highlight"],
    ["`", "code"],
  ])("does the same on an emptied line (%s)", (marker, mark) => {
    const target = page(`${marker}b${marker}`);
    select(target, 2);
    expect(key(target, "Backspace")).toBe(true);
    expect(target.state.doc.textContent).toBe("");
    expect(target.isActive(mark)).toBe(false);
    expect(target.state.storedMarks?.some((m) => m.type.name === mark) ?? false).toBe(false);
    typePlain(target, "x");
    expect(storedParagraph(target)).toBe("x");
  });

  it("does the same with Delete from before the last character", () => {
    const target = page("==b==");
    select(target, 1);
    expect(key(target, "Delete")).toBe(true);
    expect(target.state.doc.textContent).toBe("");
    expect(target.isActive("highlight")).toBe(false);
  });

  it("does the same when the whole content is selected and deleted", () => {
    const target = page("a ==bcd== e");
    select(target, 3, 6);
    expect(key(target, "Backspace")).toBe(true);
    expect(target.state.doc.textContent).toBe("a  e");
    expect(target.isActive("highlight")).toBe(false);
  });

  it("leaves a deletion that keeps some of the content to the editor", () => {
    const target = page("==bc==");
    select(target, 3);
    expect(key(target, "Backspace")).toBeFalsy();
    // The editor deletes a selection itself; the rest of the highlight stays highlighted.
    select(target, 2, 3);
    key(target, "Backspace");
    expect(target.state.doc.textContent).toBe("b");
    select(target, 1);
    expect(target.isActive("highlight")).toBe(true);
  });

  it("leaves plain text alone", () => {
    const target = page("abc");
    select(target, 2);
    expect(key(target, "Backspace")).toBeFalsy();
  });

  it("types plain text where the browser left an empty mark behind", () => {
    const target = page("");
    // The browser keeps an empty <mark> in the line after its text was deleted, and typing goes
    // into it, which would give the new text the highlight.
    const mark = document.createElement("mark");
    target.view.dom.querySelector("p")?.append(mark);
    target.view.domAtPos = () => ({ node: mark, offset: 0 });
    const { from, to } = target.state.selection;
    const handled = target.view.someProp("handleTextInput", (f) =>
      f(target.view, from, to, "x", () => target.state.tr.insertText("x", from, to)),
    );
    expect(handled).toBe(true);
    expect(storedParagraph(target)).toBe("x");
  });
});
