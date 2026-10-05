import { screen } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

/// Opens the editor on one block and waits for the block's own view, which the
/// editor mounts after its first render.
async function open(block: JSONContent) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [block] },
  });
  const view = renderWithProviders(<EditorContent editor={editor} />);
  await screen.findByRole("group", { name: "View" });
  return { ...view, editor };
}

const circuit = (attrs: Record<string, string> = {}): JSONContent => ({
  type: "circuit",
  attrs: { blockId: "c1", ...attrs },
  content: [{ type: "text", text: "Y = A & B" }],
});

const attrsOf = (target: Editor) => target.getJSON().content?.[0]?.attrs ?? {};

describe("the circuit block", () => {
  it("has a code, an interactive and a preview tab", async () => {
    await open(circuit());
    const tabs = screen.getByRole("group", { name: "View" });
    expect(tabs).toHaveTextContent(/Code.*Interactive.*Preview/);
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the drawing canvas on the interactive tab and keeps the choice", async () => {
    const { user, editor: target } = await open(circuit());
    await user.click(screen.getByRole("button", { name: "Interactive" }));
    expect(screen.getByRole("application", { name: /circuit drawing/i })).toBeInTheDocument();
    expect(attrsOf(target).view).toBe("interactive");
    expect(screen.getByRole("button", { name: "Interactive" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("saves what is drawn in the block", async () => {
    const { user, editor: target } = await open(circuit({ view: "interactive" }));
    await user.click(screen.getByRole("button", { name: "Add AND gate" }));
    expect(String(attrsOf(target).drawing)).toContain('"AND"');
    // The code is left alone.
    expect(target.getText()).toContain("Y = A & B");
  });

  it("draws the code on the preview tab", async () => {
    const { user } = await open(circuit());
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("img", { name: /circuit with 1 gates?/i })).toBeInTheDocument();
  });

  it("says what is wrong with the code on the preview tab", async () => {
    const { user } = await open({
      type: "circuit",
      attrs: { blockId: "c1" },
      content: [{ type: "text", text: "Y = A &" }],
    });
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText(/^Line 1:/)).toBeInTheDocument();
  });

  it("opens a view this version does not know as the code", async () => {
    await open(circuit({ view: "from-the-future" }));
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves the equation block with its two tabs", async () => {
    await open({
      type: "equation",
      attrs: { blockId: "e1" },
      content: [{ type: "text", text: "x" }],
    });
    expect(screen.queryByRole("button", { name: "Interactive" })).toBeNull();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("brings a drawing back from the editor's document", async () => {
    const stored =
      '{"v":1,"parts":[{"id":"p1","kind":"NOT","x":20,"y":20,"label":"","pins":1,"negated":[false]}],"wires":[]}';
    const { editor: target } = await open(circuit({ view: "interactive", drawing: stored }));
    expect(screen.getByRole("button", { name: "NOT gate 1" })).toBeInTheDocument();
    expect(attrsOf(target).drawing).toBe(stored);
  });
});
