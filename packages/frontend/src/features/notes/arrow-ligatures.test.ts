import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { editorExtensions } from "./editor-extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function open() {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  editor.commands.focus();
  return editor;
}

/// Types `text` into the editor the way the keyboard does, so input rules fire.
function typeInto(target: Editor, text: string) {
  for (const char of text) {
    const { from, to } = target.state.selection;
    const handled = target.view.someProp("handleTextInput", (f) =>
      f(target.view, from, to, char, () => target.state.tr.insertText(char, from, to)),
    );
    if (!handled) target.view.dispatch(target.state.tr.insertText(char, from, to));
  }
  return target.getText();
}

function type(text: string) {
  return typeInto(open(), text);
}

describe("arrow ligatures", () => {
  it("turns arrows and comparisons into symbols by default", () => {
    expect(type("a -> b")).toBe("a → b");
    expect(type("x >= 1")).toBe("x ≥ 1");
  });

  it("leaves what was typed alone once the setting is off", () => {
    settings.set("notes.arrowLigatures", false);
    expect(type("a -> b")).toBe("a -> b");
    expect(type("x >= 1 != 2 <=> 3")).toBe("x >= 1 != 2 <=> 3");
  });

  it("applies a change to an editor that is already open", () => {
    const target = open();
    expect(typeInto(target, "a -> ")).toBe("a → ");
    settings.set("notes.arrowLigatures", false);
    expect(typeInto(target, "b -> ")).toBe("a → b -> ");
    settings.set("notes.arrowLigatures", true);
    expect(typeInto(target, "c -> ")).toBe("a → b -> c → ");
  });
});
