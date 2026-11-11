import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { makeBlock } from "#/test/fixtures.ts";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function page(content: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: editorExtensions({
      spaceId: "s",
      pageId: "p",
      getEntities: () => [],
    }),
    content: {
      type: "doc",
      content: [blockToNode(makeBlock({ blockType: "paragraph", content }))],
    },
  });
  return editor;
}
const select = (target: Editor, from: number, to: number) =>
  target.view.dispatch(
    target.state.tr.setSelection(TextSelection.create(target.state.doc, from, to)),
  );
const stored = (target: Editor) => {
  const doc: JSONNode = target.getJSON();
  return nodeToBlockInput(doc.content?.[0] ?? { type: "doc" })?.content;
};

describe("the text colour mark in a page", () => {
  it("reads {red}text{/} from the stored page and writes it back unchanged", () => {
    const target = page("see {red}this{/} and **that**");
    const doc: JSONNode = target.getJSON();
    expect(doc.content?.[0]?.content?.map((n) => [n.text, n.marks?.[0]?.type])).toEqual([
      ["see ", undefined],
      ["this", "textColor"],
      [" and ", undefined],
      ["that", "bold"],
    ]);
    expect(stored(target)).toBe("see {red}this{/} and **that**");
  });

  it("colours the selection from the command", () => {
    const target = page("hello world");
    select(target, 1, 6);
    expect(target.commands.setTextColor("blue")).toBe(true);
    expect(stored(target)).toBe("{blue}hello{/} world");
  });

  it("changes a colour to another one, and takes it off again", () => {
    const target = page("{red}hello{/} world");
    select(target, 1, 6);
    target.commands.setTextColor("green");
    expect(stored(target)).toBe("{green}hello{/} world");
    expect(target.commands.unsetTextColor()).toBe(true);
    expect(stored(target)).toBe("hello world");
  });

  it("keeps bold and a highlight on text it colours", () => {
    const target = page("**a** ==b==");
    select(target, 1, 4);
    target.commands.setTextColor("purple");
    expect(stored(target)).toBe("{purple}**a** ==b=={/}");
  });

  it("colours the text typed next when the caret is alone", () => {
    const target = page("");
    select(target, 1, 1);
    target.commands.setTextColor("pink");
    target.view.dispatch(target.state.tr.insertText("x"));
    expect(stored(target)).toBe("{pink}x{/}");
  });

  it("ignores a colour it does not know", () => {
    const target = page("hello");
    select(target, 1, 6);
    // @ts-expect-error not a TextColorId
    expect(target.commands.setTextColor("chartreuse")).toBe(false);
    expect(stored(target)).toBe("hello");
  });
});
