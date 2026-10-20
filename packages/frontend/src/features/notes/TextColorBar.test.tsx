import { act, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import type { BlockType } from "#/lib/api/types.ts";
import { makeBlock } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import { TextColorBar } from "./TextColorBar";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function setup(content: string, from: number, to: number, blockType: BlockType = "paragraph") {
  editor = new Editor({
    extensions: editorExtensions({
      spaceId: "s",
      pageId: "p",
      getEntities: () => [],
    }),
    content: {
      type: "doc",
      content: [blockToNode(makeBlock({ blockType, content }))],
    },
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  );
  const view = renderWithProviders(
    <div>
      <EditorContent editor={editor} />
      <TextColorBar editor={editor} />
    </div>,
  );
  return { ...view, editor };
}
const stored = (target: Editor) => {
  const doc: JSONNode = target.getJSON();
  return nodeToBlockInput(doc.content?.[0] ?? { type: "doc" })?.content;
};

describe("the text colour bar", () => {
  it("shows while text is selected, with every colour and a way to remove it", async () => {
    setup("hello world", 1, 6);
    expect(await screen.findByRole("toolbar", { name: "Text color" })).toBeInTheDocument();
    for (const color of ["Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink", "Gray"]) {
      expect(screen.getByRole("button", { name: color })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Remove color" })).toBeInTheDocument();
  });

  it("is not there for a caret alone", async () => {
    setup("hello world", 3, 3);
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("is not there for a page that cannot be edited", async () => {
    const { editor: target } = setup("hello world", 1, 6);
    await screen.findByRole("toolbar", { name: "Text color" });
    act(() => target.setEditable(false));
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("colours the selection with a click, and the selection stays", async () => {
    const { user, editor: target } = setup("hello world", 1, 6);
    await user.click(await screen.findByRole("button", { name: "Red" }));
    expect(stored(target)).toBe("{red}hello{/} world");
    expect(target.state.selection.from).toBe(1);
    expect(target.state.selection.to).toBe(6);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("marks the colour the selection has", async () => {
    setup("{green}hello{/} world", 1, 6);
    expect(await screen.findByRole("button", { name: "Green" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "false");
  });

  it("removes the colour", async () => {
    const { user, editor: target } = setup("{green}hello{/} world", 1, 6);
    await user.click(await screen.findByRole("button", { name: "Remove color" }));
    expect(stored(target)).toBe("hello world");
  });

  it("is not there in a code block, which takes no marks", async () => {
    setup("code", 1, 3, "code");
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("has no accessibility violations", async () => {
    setup("hello world", 1, 6);
    await expectNoA11yViolations(await screen.findByRole("toolbar", { name: "Text color" }));
  });
});
