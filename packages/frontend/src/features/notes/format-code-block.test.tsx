import { act, screen, waitFor } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notify } from "#/components/notify.tsx";
import { settings } from "#/lib/settings/settings.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";
import { formatCodeBlock } from "./format-code-block";

let editor: Editor | null = null;
afterEach(() => {
  vi.restoreAllMocks();
  editor?.destroy();
  settings.set("notes.formatCodeOnPaste", false);
});

const code = (text: string, language: string | null): JSONContent => ({
  type: "codeBlock",
  attrs: { blockId: "c1", language },
  content: text ? [{ type: "text", text }] : undefined,
});

function open(blocks: JSONContent[]) {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: blocks },
  });
  return editor;
}
const textOf = (target: Editor) => target.state.doc.child(0).textContent;

describe("formatCodeBlock", () => {
  it("replaces the code with the formatted code", async () => {
    const target = open([code("const a={b:1}", "javascript")]);
    expect(await formatCodeBlock(target, 0)).toBe("formatted");
    expect(textOf(target)).toBe("const a = { b: 1 };");
  });

  it("is one step in the history, so undo brings the old code back", async () => {
    const target = open([code("const a={b:1}", "javascript")]);
    await formatCodeBlock(target, 0);
    target.commands.undo();
    expect(textOf(target)).toBe("const a={b:1}");
  });

  it("changes nothing for code that is formatted already", async () => {
    const target = open([code("const a = 1;", "javascript")]);
    const before = target.state.doc;
    expect(await formatCodeBlock(target, 0)).toBe("unchanged");
    expect(target.state.doc).toBe(before);
  });

  it("leaves a language without a formatter alone", async () => {
    const target = open([code("fn main(){}", "rust")]);
    expect(await formatCodeBlock(target, 0)).toBe("unsupported");
    expect(textOf(target)).toBe("fn main(){}");
  });

  it("leaves code that cannot be parsed alone", async () => {
    const target = open([code("const a = {", "javascript")]);
    expect(await formatCodeBlock(target, 0)).toBe("failed");
    expect(textOf(target)).toBe("const a = {");
  });

  it("leaves the code alone when it was edited while formatting ran", async () => {
    const target = open([code("const a={b:1}", "javascript")]);
    const pending = formatCodeBlock(target, 0);
    target.view.dispatch(target.state.tr.insertText("// hi\n", 1));
    expect(await pending).toBe("changed");
    expect(textOf(target)).toBe("// hi\nconst a={b:1}");
  });

  it("does nothing where there is no code block", async () => {
    const target = open([{ type: "paragraph", attrs: { blockId: "p1" } }]);
    expect(await formatCodeBlock(target, 0)).toBe("unsupported");
  });
});

describe("the Format button of a code block", () => {
  async function render(language: string | null, text = "const a={b:1}") {
    const target = open([code(text, language)]);
    const view = renderWithProviders(<EditorContent editor={target} />);
    return { ...view, target, button: await screen.findByRole("button", { name: "Format code" }) };
  }

  it("formats the block", async () => {
    const { user, target, button } = await render("javascript");
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(textOf(target)).toBe("const a = { b: 1 };"));
  });

  it("is off, with the reason as its tooltip, for a language without a formatter", async () => {
    const { user, button } = await render("rust", "fn main(){}");
    expect(button).toBeDisabled();
    // SAFETY: the button always sits in the span that carries the tooltip.
    await user.hover(button.parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/no formatter for rust/i);
  });

  it("tells you when the code could not be parsed and leaves it as it is", async () => {
    const { user, target, button } = await render("javascript", "const a = {");
    const error = vi.spyOn(notify, "error");
    await user.click(button);
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith("Couldn't format the code", expect.anything()),
    );
    expect(textOf(target)).toBe("const a = {");
  });
});

describe("formatting pasted code", () => {
  const paste = (target: Editor, text: string) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text/plain" ? text : ""),
        types: ["text/plain"],
        files: [],
        items: [],
      },
    });
    act(() => {
      target.view.dom.dispatchEvent(event);
    });
  };

  beforeEach(() => {
    settings.set("notes.formatCodeOnPaste", false);
  });

  function inCodeBlock(language: string | null) {
    const target = open([code("", language)]);
    target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, 1)));
    return target;
  }

  it("formats the block after a paste when the setting is on", async () => {
    settings.set("notes.formatCodeOnPaste", true);
    const target = inCodeBlock("javascript");
    paste(target, "const a={b:1}");
    await waitFor(() => expect(textOf(target)).toBe("const a = { b: 1 };"));
  });

  it("leaves pasted code as it came when the setting is off", async () => {
    const target = inCodeBlock("javascript");
    paste(target, "const a={b:1}");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(textOf(target)).toBe("const a={b:1}");
  });

  it("leaves pasted code alone in a language without a formatter", async () => {
    settings.set("notes.formatCodeOnPaste", true);
    const target = inCodeBlock("rust");
    paste(target, "fn main(){}");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(textOf(target)).toBe("fn main(){}");
  });
});

describe("where a code block holds its text", () => {
  it("is a block element, like the other blocks, not an inline code element", async () => {
    const target = open([code("a", "javascript")]);
    renderWithProviders(<EditorContent editor={target} />);
    await screen.findByRole("button", { name: "Format code" });
    const holder = document.querySelector("pre.code-block-body > [data-node-view-content]");
    expect(holder?.tagName).toBe("DIV");
  });
});
