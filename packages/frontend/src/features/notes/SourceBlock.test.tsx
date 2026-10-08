import { screen } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

/// Opens the editor on one block and waits for the block's own view, which the
/// editor mounts after its first render.
async function open(block: JSONContent) {
  editor = new Editor({
    extensions: editorExtensions({
      spaceId: "s",
      pageId: "p",
      getEntities: () => [],
    }),
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
  // The interactive tab is switched off for now (`interactiveDisabled` in
  // `source-block-extensions.ts`); the canvas itself is tested in `CircuitCanvas.test.tsx`.
  it("shows the interactive tab disabled, with a tooltip saying so", async () => {
    const { user } = await open(circuit());
    const tab = screen.getByRole("button", { name: "Interactive" });
    expect(tab).toBeDisabled();
    await user.hover(tab);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/not available yet/i);
  });

  it("does not open the canvas when the interactive tab is clicked", async () => {
    const { user, editor: target } = await open(circuit());
    await user.click(screen.getByRole("button", { name: "Interactive" }));
    expect(screen.queryByRole("application", { name: /circuit drawing/i })).toBeNull();
    expect(attrsOf(target).view).toBe("source");
  });

  it("opens a block saved on the interactive tab as the code, keeping its drawing", async () => {
    const stored = '{"v":1,"parts":[],"wires":[]}';
    const { editor: target } = await open(circuit({ view: "interactive", drawing: stored }));
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("application", { name: /circuit drawing/i })).toBeNull();
    expect(attrsOf(target).drawing).toBe(stored);
  });

  it("has a code, an interactive and a preview tab", async () => {
    await open(circuit());
    const tabs = screen.getByRole("group", { name: "View" });
    expect(tabs).toHaveTextContent(/Code.*Interactive.*Preview/);
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true");
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

  it("explains how to write a circuit below the code, only on the code tab", async () => {
    const { user } = await open(circuit());
    expect(screen.getByText(/Y = A & !B/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByText(/Y = A & !B/)).toBeNull();
  });

  it("keeps the legend to one line until its details are shown", async () => {
    const { user } = await open(circuit());
    const toggle = screen.getByRole("button", { name: /show details/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/name = expression/i)).toBeNull();
    await user.click(toggle);
    expect(screen.getByText(/name = expression/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /hide details/i }));
    expect(screen.queryByText(/name = expression/i)).toBeNull();
  });

  it("gives the equation block no legend", async () => {
    await open({
      type: "equation",
      attrs: { blockId: "e1" },
      content: [{ type: "text", text: "x" }],
    });
    expect(screen.queryByText(/name = expression/i)).toBeNull();
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
});

describe("copying the LaTeX of equation and math blocks", () => {
  const latex = (type: "equation" | "math"): JSONContent => ({
    type,
    attrs: { blockId: "m1" },
    content: [{ type: "text", text: "x^2 + y^2 = z^2" }],
  });

  it.each(["equation", "math"] as const)(
    "copies the %s code from the code and the preview tab",
    async (type) => {
      const { user } = await open(latex(type));
      const copied = vi.spyOn(navigator.clipboard, "writeText");
      await user.click(screen.getByRole("button", { name: "Copy LaTeX" }));
      expect(copied).toHaveBeenLastCalledWith("x^2 + y^2 = z^2");

      await user.click(screen.getByRole("button", { name: "Preview" }));
      await user.click(screen.getByRole("button", { name: "Copy LaTeX" }));
      expect(copied).toHaveBeenCalledTimes(2);
      expect(copied).toHaveBeenLastCalledWith("x^2 + y^2 = z^2");
    },
  );

  it("leaves the diagram block without it", async () => {
    await open({
      type: "diagram",
      attrs: { blockId: "d1" },
      content: [{ type: "text", text: "flowchart LR\n  A --> B" }],
    });
    expect(screen.queryByRole("button", { name: /^Copy/ })).toBeNull();
  });

  it("copies a circuit block's code, not its LaTeX", async () => {
    const { user } = await open(circuit());
    const copied = vi.spyOn(navigator.clipboard, "writeText");
    expect(screen.queryByRole("button", { name: "Copy LaTeX" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    expect(copied).toHaveBeenLastCalledWith("Y = A & B");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    expect(copied).toHaveBeenCalledTimes(2);
  });
});
