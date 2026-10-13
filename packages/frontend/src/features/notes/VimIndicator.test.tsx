import { act, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { editorExtensions } from "./editor-extensions";
import { VimIndicator } from "./VimIndicator";

let editor: Editor | null = null;
beforeEach(() => settings.set("notes.vimMode", true));
afterEach(() => {
  editor?.destroy();
  settings.set("notes.vimMode", false);
});

function setup() {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: "<p>hello</p>",
  });
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)));
  return { ...renderWithProviders(<VimIndicator editor={editor} />), editor };
}
const press = (target: Editor, key: string) =>
  act(() => {
    target.view.someProp("handleKeyDown", (f) =>
      f(target.view, new KeyboardEvent("keydown", { key })),
    );
  });

describe("the Vim mode indicator", () => {
  it("names the mode and follows it", () => {
    const { editor: target } = setup();
    expect(screen.getByRole("status")).toHaveTextContent("NORMAL");
    press(target, "i");
    expect(screen.getByRole("status")).toHaveTextContent("INSERT");
    press(target, "Escape");
    press(target, "v");
    expect(screen.getByRole("status")).toHaveTextContent("VISUAL");
    press(target, "Escape");
    press(target, "V");
    expect(screen.getByRole("status")).toHaveTextContent("VISUAL LINE");
  });

  it("is not there while Vim mode is off", () => {
    settings.set("notes.vimMode", false);
    setup();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the keys with ? and closes them with Escape", async () => {
    const { editor: target } = setup();
    press(target, "?");
    expect(await screen.findByRole("dialog", { name: "Vim keys" })).toBeInTheDocument();
    expect(screen.getByText("dw")).toBeInTheDocument();
    press(target, "Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has no accessibility violations with the keys open", async () => {
    const { editor: target } = setup();
    press(target, "?");
    await screen.findByRole("dialog", { name: "Vim keys" });
    await expectNoA11yViolations();
  });
});
