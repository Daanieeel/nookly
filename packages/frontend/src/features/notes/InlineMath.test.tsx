import { fireEvent, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import katex from "katex";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  vi.restoreAllMocks();
});

/// Opens a paragraph holding one formula and its editing popover.
async function openFormula(latex = "x^2") {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a " },
            { type: "inlineMath", attrs: { latex } },
          ],
        },
      ],
    },
  });
  const view = renderWithProviders(<EditorContent editor={editor} />);
  // A plain click event: jsdom has no layout for the editor's own mouse handling.
  fireEvent.click(await screen.findByRole("button", { name: /Formula/ }));
  await screen.findByRole("textbox", { name: "LaTeX" });
  return view;
}

describe("the inline formula popover", () => {
  it("recalculates the width from a button, keeping the popover open", async () => {
    const { user } = await openFormula();
    const render = vi.spyOn(katex, "render");
    await user.click(screen.getByRole("button", { name: "Recalculate width" }));
    expect(render).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "LaTeX" })).toBeTruthy();
  });

  it("recalculates when Enter commits an unchanged formula", async () => {
    const { user } = await openFormula();
    const render = vi.spyOn(katex, "render");
    await user.type(screen.getByRole("textbox", { name: "LaTeX" }), "{Enter}");
    expect(render).toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "LaTeX" })).toBeNull();
  });
});
