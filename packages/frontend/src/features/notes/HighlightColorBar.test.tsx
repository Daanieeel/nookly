import { act, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeBlock } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { editorExtensions } from "./editor-extensions";
import { HighlightColorBar } from "./HighlightColorBar";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function setup(content: string, caret: number) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: [blockToNode(makeBlock({ blockType: "paragraph", content }))],
    },
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, caret)));
  const view = renderWithProviders(
    <div>
      <EditorContent editor={editor} />
      <HighlightColorBar editor={editor} />
    </div>,
  );
  return { ...view, editor };
}
const stored = (target: Editor) => {
  const doc: JSONNode = target.getJSON();
  return nodeToBlockInput(doc.content?.[0] ?? { type: "doc" })?.content;
};

describe("the highlight colour bar", () => {
  it("shows while the caret is in a highlight", async () => {
    setup("a ==bcd== e", 4);
    expect(await screen.findByRole("toolbar", { name: "Highlight colour" })).toBeInTheDocument();
    for (const color of ["Yellow", "Green", "Blue", "Pink", "Orange", "Purple"]) {
      expect(screen.getByRole("button", { name: color })).toBeInTheDocument();
    }
  });

  // The caret right before the first character is at the highlight's edge, and still in it
  // as far as the person looking at it can tell.
  it("shows with the caret before the first character of a highlight", async () => {
    setup("a ==bcd== e", 3);
    expect(await screen.findByRole("toolbar", { name: "Highlight colour" })).toBeInTheDocument();
  });

  it("colours the highlight from there", async () => {
    const { user, editor: target } = setup("a ==bcd== e", 3);
    await user.click(await screen.findByRole("button", { name: "Green" }));
    expect(stored(target)).toBe("a =={green}bcd== e");
    expect(target.state.selection.from).toBe(3);
  });

  it("shows the colour of the highlight that starts at the caret", async () => {
    setup("a =={pink}bcd== e", 3);
    expect(await screen.findByRole("button", { name: "Pink" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("is not there with the caret just after the highlight's end only if it stepped out", async () => {
    const { editor: target } = setup("a ==bcd==", 6);
    await screen.findByRole("toolbar", { name: "Highlight colour" });
    act(() => {
      target.view.someProp("handleKeyDown", (f) =>
        f(target.view, new KeyboardEvent("keydown", { key: "ArrowRight" })),
      );
    });
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("is not there after stepping out to the left of a highlight at the start of a line", async () => {
    const { editor: target } = setup("==bcd== e", 1);
    await screen.findByRole("toolbar", { name: "Highlight colour" });
    act(() => {
      target.view.someProp("handleKeyDown", (f) =>
        f(target.view, new KeyboardEvent("keydown", { key: "ArrowLeft" })),
      );
    });
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("is not there outside a highlight", async () => {
    setup("a ==bcd== e", 1);
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("is not there for a page that cannot be edited", async () => {
    const { editor: target } = setup("a ==bcd== e", 4);
    act(() => target.setEditable(false));
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  it("marks the colour the highlight has", async () => {
    setup("a =={green}bcd== e", 4);
    expect(await screen.findByRole("button", { name: "Green" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Yellow" })).toHaveAttribute("aria-pressed", "false");
  });

  it("colours the highlight with a click, and the caret stays where it was", async () => {
    const { user, editor: target } = setup("a ==bcd== e", 4);
    await user.click(await screen.findByRole("button", { name: "Blue" }));
    expect(stored(target)).toBe("a =={blue}bcd== e");
    expect(target.state.selection.from).toBe(4);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "true"),
    );
    await user.click(screen.getByRole("button", { name: "Yellow" }));
    expect(stored(target)).toBe("a ==bcd== e");
  });

  it("colours the next text typed in a highlight that is still empty", async () => {
    const { user, editor: target } = setup("", 1);
    act(() => {
      target.commands.toggleHighlight();
    });
    await user.click(await screen.findByRole("button", { name: "Pink" }));
    target.view.dispatch(target.state.tr.insertText("x"));
    expect(stored(target)).toBe("=={pink}x==");
  });

  it("has no accessibility violations", async () => {
    setup("a ==bcd== e", 4);
    // The bar itself; the editor's own field has no name of its own to check here.
    await expectNoA11yViolations(await screen.findByRole("toolbar", { name: "Highlight colour" }));
  });
});
