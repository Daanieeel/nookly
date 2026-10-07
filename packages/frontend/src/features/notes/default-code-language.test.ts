import { Editor, type JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { describe, expect, it } from "vitest";
import { CodeBlockWithHeader } from "./code-block-extension";
import { newCodeBlockLanguage, useDefaultCodeLanguage } from "./default-code-language";

describe("the language a new code block starts with", () => {
  it("is plain text with no setting at all", () => {
    expect(newCodeBlockLanguage(null)).toBeNull();
  });

  it("follows the device default", () => {
    useDefaultCodeLanguage.getState().update("rust");
    expect(newCodeBlockLanguage(null)).toBe("rust");
    useDefaultCodeLanguage.getState().update("plaintext");
  });

  it("lets the note override the device default, including back to plain text", () => {
    useDefaultCodeLanguage.getState().update("rust");
    expect(newCodeBlockLanguage("python")).toBe("python");
    expect(newCodeBlockLanguage("plaintext")).toBeNull();
    useDefaultCodeLanguage.getState().update("plaintext");
  });
});

function editor(getNewLanguage: () => string | null, content?: JSONContent) {
  return new Editor({
    extensions: [Document, Paragraph, Text, CodeBlockWithHeader.configure({ getNewLanguage })],
    content,
  });
}

const languages = (e: Editor) => e.getJSON().content?.map((n) => n.attrs?.language);

describe("new code blocks in the editor", () => {
  it("start with the default language when made by the command", () => {
    const e = editor(() => "go");
    e.commands.toggleCodeBlock();
    expect(languages(e)).toEqual(["go"]);
  });

  it("start with the default language when made by typing a fence", () => {
    const e = editor(() => "go");
    e.commands.insertContent("```");
    e.view.someProp("handleTextInput", (f) => f(e.view, 4, 4, " ", () => e.state.tr));
    expect(languages(e)).toEqual(["go"]);
  });

  it("keep a language typed on the fence", () => {
    const e = editor(() => "go");
    e.commands.insertContent("```rust");
    e.view.someProp("handleTextInput", (f) => f(e.view, 8, 8, " ", () => e.state.tr));
    expect(languages(e)).toEqual(["rust"]);
  });

  it("stay plain without a default", () => {
    const e = editor(() => null);
    e.commands.toggleCodeBlock();
    expect(languages(e)).toEqual([null]);
  });

  it("leave an existing block alone when it is toggled off, and when loaded", () => {
    const e = editor(() => "go", {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "python" },
          content: [{ type: "text", text: "x" }],
        },
      ],
    });
    expect(languages(e)).toEqual(["python"]);
    e.commands.toggleCodeBlock();
    expect(e.getJSON().content?.[0]?.type).toBe("paragraph");
  });

  it("leave an existing unlabeled block unlabeled when loaded", () => {
    const e = editor(() => "go", {
      type: "doc",
      content: [{ type: "codeBlock", content: [{ type: "text", text: "x" }] }],
    });
    expect(languages(e)).toEqual([null]);
  });
});
