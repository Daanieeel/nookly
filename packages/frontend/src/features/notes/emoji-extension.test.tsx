import { screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { searchEmoji } from "#/lib/emoji.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

async function open() {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  const view = renderWithProviders(<EditorContent editor={editor} />);
  editor.commands.focus();
  return { ...view, editor };
}

const text = (target: Editor) => target.getText();

describe("the colon emoji and symbol picker", () => {
  it("offers emoji while typing a colon word", async () => {
    const { editor: target } = await open();
    target.commands.insertContent(":smile");
    const [first] = searchEmoji("smile");
    const [top] = await screen.findAllByRole("button");
    expect(top).toHaveTextContent(first?.name ?? "");
    expect(screen.getByText("Emojis")).toBeTruthy();
  });

  it("lists symbols before emoji", async () => {
    const { editor: target } = await open();
    target.commands.insertContent(":less");
    await screen.findByText("Symbols");
    const symbols = screen.getByText("Symbols");
    const emojis = screen.queryByText("Emojis");
    if (emojis) {
      expect(
        symbols.compareDocumentPosition(emojis) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("does not open for a time or a link", async () => {
    const { editor: target } = await open();
    target.commands.insertContent("meet at 12:30 or see https://example.com");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Emojis")).toBeNull();
    expect(screen.queryByText("Symbols")).toBeNull();
  });

  it("opens at once on a lone colon, showing symbols and emoji to pick from", async () => {
    const { editor: target } = await open();
    target.commands.insertContent(":");
    expect(await screen.findByText("Symbols")).toBeTruthy();
    expect(screen.getByText("Emojis")).toBeTruthy();
    expect((await screen.findAllByRole("button")).length).toBeGreaterThan(5);
  });

  it("opens on a colon after a space too, and not inside a word", async () => {
    const { editor: target } = await open();
    target.commands.insertContent("see:");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Symbols")).toBeNull();
    target.commands.insertContent(" :");
    expect(await screen.findByText("Symbols")).toBeTruthy();
  });

  it("narrows the list as letters follow the colon, and picks from the full list", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent(":");
    await screen.findByText("Symbols");
    target.commands.insertContent("smile");
    const [first] = searchEmoji("smile");
    await waitFor(async () =>
      expect((await screen.findAllByRole("button"))[0]).toHaveTextContent(first?.name ?? ""),
    );
    await user.click((await screen.findAllByRole("button"))[0] ?? document.body);
    await waitFor(() => expect(text(target)).toBe(first?.emoji));
  });

  it("closes again when what follows the colon matches nothing", async () => {
    const { editor: target } = await open();
    target.commands.insertContent(":");
    await screen.findByText("Symbols");
    target.commands.insertContent("zzzzqx");
    await waitFor(() => expect(screen.queryByText("Symbols")).toBeNull());
  });

  it("inserts the chosen emoji and removes what was typed", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent(":smile");
    const [first] = searchEmoji("smile");
    await user.click((await screen.findAllByRole("button"))[0] ?? document.body);
    await waitFor(() => expect(text(target)).toBe(first?.emoji));
  });

  it("inserts a symbol", async () => {
    const { user, editor: target } = await open();
    target.commands.insertContent(":infinity");
    await user.click((await screen.findAllByRole("button"))[0] ?? document.body);
    await waitFor(() => expect(text(target)).toBe("∞"));
  });

  it("does not open inside a code block", async () => {
    editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: { type: "doc", content: [{ type: "codeBlock", content: [] }] },
    });
    renderWithProviders(<EditorContent editor={editor} />);
    editor.commands.focus();
    editor.commands.insertContent(":smile");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Emojis")).toBeNull();
  });
});
