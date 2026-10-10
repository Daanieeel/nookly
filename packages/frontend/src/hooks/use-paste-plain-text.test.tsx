import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorExtensions } from "#/features/notes/editor-extensions.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { usePastePlainText } from "./use-paste-plain-text.ts";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  vi.unstubAllGlobals();
});

function Probe() {
  usePastePlainText();
  const [value, setValue] = useState("");
  return (
    <>
      <input aria-label="Name" value={value} onChange={(e) => setValue(e.target.value)} />
      <textarea aria-label="Notes" defaultValue="" />
      <button type="button">Elsewhere</button>
    </>
  );
}

const pasteShortcut = "{Control>}{Shift>}v{/Shift}{/Control}";

describe("paste without formatting", () => {
  it("pastes the clipboard text into an input", async () => {
    mockCommand("plugin:clipboard-manager|read_text", "plain words");
    const user = userEvent.setup({ delay: null });
    render(<Probe />);
    await user.click(screen.getByRole("textbox", { name: "Name" }));
    await user.keyboard(pasteShortcut);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("plain words"),
    );
  });

  it("replaces the selection and keeps the text around it", async () => {
    mockCommand("plugin:clipboard-manager|read_text", "X");
    const user = userEvent.setup({ delay: null });
    render(<Probe />);
    const input = screen.getByLabelText<HTMLInputElement>("Name");
    await user.type(input, "abcdef");
    input.setSelectionRange(1, 3);
    await user.keyboard(pasteShortcut);
    await waitFor(() => expect(input).toHaveValue("aXdef"));
  });

  it("pastes into a textarea", async () => {
    mockCommand("plugin:clipboard-manager|read_text", "line one");
    const user = userEvent.setup({ delay: null });
    render(<Probe />);
    await user.click(screen.getByRole("textbox", { name: "Notes" }));
    await user.keyboard(pasteShortcut);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("line one"),
    );
  });

  it("turns formatted clipboard text into plain text in the editor", async () => {
    // jsdom has no ClipboardEvent, which ProseMirror builds when it pastes text.
    vi.stubGlobal("ClipboardEvent", class extends Event {});
    mockCommand("plugin:clipboard-manager|read_text", "just text");
    editor = new Editor({
      extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    const view = renderWithProviders(
      <>
        <Probe />
        <EditorContent editor={editor} />
      </>,
    );
    // jsdom does not focus a contenteditable by itself.
    act(() => {
      editor?.view.dom.setAttribute("tabindex", "0");
      editor?.view.dom.focus();
    });
    await view.user.keyboard(pasteShortcut);
    await waitFor(() => expect(editor?.getText()).toContain("just text"));
    // Plain: no marks came along.
    expect(JSON.stringify(editor?.getJSON())).not.toContain("marks");
  });

  it("does nothing when focus is on something that is not a text field", async () => {
    mockCommand("plugin:clipboard-manager|read_text", "ignored");
    const user = userEvent.setup({ delay: null });
    render(<Probe />);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    await user.keyboard(pasteShortcut);
    expect(callsOf("plugin:clipboard-manager|read_text")).toHaveLength(0);
  });

  it("does not paste into a read only field", async () => {
    mockCommand("plugin:clipboard-manager|read_text", "ignored");
    const user = userEvent.setup({ delay: null });
    render(
      <>
        <Probe />
        <input aria-label="Locked" readOnly defaultValue="kept" />
      </>,
    );
    await user.click(screen.getByRole("textbox", { name: "Locked" }));
    await user.keyboard(pasteShortcut);
    expect(screen.getByRole("textbox", { name: "Locked" })).toHaveValue("kept");
  });

  it("leaves the ordinary paste shortcut alone", async () => {
    mockCommand("plugin:clipboard-manager|read_text", "ignored");
    const user = userEvent.setup({ delay: null });
    render(<Probe />);
    await user.click(screen.getByRole("textbox", { name: "Name" }));
    await user.keyboard("{Control>}v{/Control}");
    expect(callsOf("plugin:clipboard-manager|read_text")).toHaveLength(0);
  });
});
