import { act, screen, waitFor } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
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

// Reported crash (#92): arrowing next to a block that shows its preview let the caret
// into its hidden code, which aborts WebKit. jsdom cannot reproduce the abort, so this
// pins the cause: the selection must never end up inside the hidden code. The real
// check is a manual one in `bun run dev` on macOS.
describe("arrow keys next to a block that shows its preview", () => {
  const types = ["equation", "math", "diagram", "circuit"] as const;
  const para = (text: string): JSONContent => ({
    type: "paragraph",
    attrs: { blockId: `p-${text}` },
    content: [{ type: "text", text }],
  });
  const block = (type: string, view: string): JSONContent => ({
    type,
    attrs: { blockId: "b1", view },
    content: [{ type: "text", text: "x" }],
  });

  async function openDoc(content: JSONContent[]) {
    editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: { type: "doc", content },
    });
    renderWithProviders(<EditorContent editor={editor} />);
    await screen.findByRole("group", { name: "View" });
    return editor;
  }

  const press = (target: Editor, key: string) =>
    target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key })),
    );

  const insideHiddenCode = (target: Editor) => {
    const { $from, $to } = target.state.selection;
    return [$from, $to].some(
      ($pos) => $pos.parent.type.spec.code === true && $pos.parent.attrs.view !== "source",
    );
  };

  it.each(types)(
    "selects a %s preview as a whole on Left from the paragraph below",
    async (type) => {
      const target = await openDoc([block(type, "rendered"), para("after")]);
      target.commands.setTextSelection(target.state.doc.child(0).nodeSize + 1);
      expect(press(target, "ArrowLeft")).toBe(true);
      expect(target.state.selection).toBeInstanceOf(NodeSelection);
      expect(target.state.selection.$from.nodeAfter?.type.name).toBe(type);
      expect(insideHiddenCode(target)).toBe(false);
    },
  );

  it.each(types)(
    "selects a %s preview as a whole on Right from the paragraph above",
    async (type) => {
      const target = await openDoc([para("before"), block(type, "rendered")]);
      target.commands.setTextSelection(1 + "before".length);
      expect(press(target, "ArrowRight")).toBe(true);
      expect(target.state.selection).toBeInstanceOf(NodeSelection);
      expect(target.state.selection.$from.nodeAfter?.type.name).toBe(type);
    },
  );

  it.each(types)("moves a caret that lands in the hidden %s code out of it", async (type) => {
    const target = await openDoc([para("before"), block(type, "rendered"), para("after")]);
    const inside = target.state.doc.child(0).nodeSize + 2;
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, inside)),
    );
    expect(insideHiddenCode(target)).toBe(false);
  });

  it("leaves the arrows alone when the block shows its code", async () => {
    const target = await openDoc([block("math", "source"), para("after")]);
    target.commands.setTextSelection(target.state.doc.child(0).nodeSize + 1);
    expect(press(target, "ArrowLeft")).toBeFalsy();
    expect(target.state.selection).not.toBeInstanceOf(NodeSelection);
  });

  it("lets the caret into the code on the code tab", async () => {
    const target = await openDoc([block("math", "source")]);
    target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 2)));
    expect(target.state.selection).toBeInstanceOf(TextSelection);
  });

  it("keeps the hidden code out of the tab order and out of editing", async () => {
    await openDoc([block("math", "rendered")]);
    const code = document.querySelector("pre.code-block-body");
    expect(code).toHaveAttribute("contenteditable", "false");
  });
});

// Reported (#124): in an empty math block, `^` followed by another key or Backspace
// broke the whole block. Half typed LaTeX such as `^` is not valid, so the preview says
// what is wrong, and the block keeps working while the code changes under it.
describe("half typed LaTeX in a math block", () => {
  const setCode = (target: Editor, code: string) => {
    const { state, view } = target;
    const node = state.doc.firstChild;
    if (!node) throw new Error("no block");
    view.dispatch(
      code
        ? state.tr.replaceWith(1, 1 + node.content.size, state.schema.text(code))
        : state.tr.delete(1, 1 + node.content.size),
    );
  };

  it.each(["math", "equation"] as const)(
    "keeps the %s block working through ^, ^x and an emptied code",
    async (type) => {
      const { editor: target } = await open({
        type,
        attrs: { blockId: "m1", view: "rendered" },
      });
      expect(screen.getByText(/^Empty (math block|equation)$/)).toBeInTheDocument();

      act(() => setCode(target, "^"));
      expect(await screen.findByText(/Expected group after/)).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "View" })).toBeInTheDocument();

      act(() => setCode(target, "^x"));
      await waitFor(() => expect(screen.queryByText(/Expected group after/)).toBeNull());
      expect(document.querySelector(".katex")).not.toBeNull();

      act(() => setCode(target, "^"));
      expect(await screen.findByText(/Expected group after/)).toBeInTheDocument();

      act(() => setCode(target, ""));
      expect(await screen.findByText(/^Empty (math block|equation)$/)).toBeInTheDocument();
      expect(screen.queryByText(/Expected group after/)).toBeNull();
      expect(target.getJSON().content?.[0]?.type).toBe(type);
    },
  );
});

// #122: editing a macro in Settings draws every open formula again.
describe("custom LaTeX macros in an open page", () => {
  afterEach(() => settings.set("notes.latexMacros", ""));

  it("redraws a math block when a command it uses is defined", async () => {
    await open({
      type: "math",
      attrs: { blockId: "m1", view: "rendered" },
      content: [{ type: "text", text: "x \\in \\NN" }],
    });
    expect(await screen.findByText(/undefined control sequence/i)).toBeInTheDocument();
    act(() => settings.set("notes.latexMacros", "\\newcommand{\\NN}{\\mathbb{N}}"));
    await waitFor(() => expect(screen.queryByText(/undefined control sequence/i)).toBeNull());
    expect(document.querySelector(".katex")).not.toBeNull();
  });
});

// #124: typing `^` (a dead key on many layouts, which composes with the next key) broke an
// empty math block in the app. The one difference to a code block, which takes the same keys,
// was an explicit contenteditable="true" on the code's <pre>, inside the editor's own: a
// nested editing element for the browser to start a composition in. The code is now
// editable by being in the editor, like a code block's, and only a hidden one says it is not.
describe("the editable code of a source block", () => {
  const pre = () => document.querySelector("pre.code-block-body");

  it.each(["math", "equation", "diagram", "circuit"] as const)(
    "has no editing element of its own in a %s block",
    async (type) => {
      await open({ type, attrs: { blockId: "b1" }, content: [{ type: "text", text: "x" }] });
      expect(pre()).not.toBeNull();
      expect(pre()?.hasAttribute("contenteditable")).toBe(false);
      expect(pre()?.hasAttribute("hidden")).toBe(false);
    },
  );

  it("is hidden and not editable while the block shows its preview", async () => {
    await open({
      type: "math",
      attrs: { blockId: "b1", view: "rendered" },
      content: [{ type: "text", text: "x" }],
    });
    expect(pre()?.hasAttribute("hidden")).toBe(true);
    expect(pre()?.getAttribute("contenteditable")).toBe("false");
  });
});
