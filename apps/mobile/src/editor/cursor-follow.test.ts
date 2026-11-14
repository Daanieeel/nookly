/**
 * @jest-environment jsdom
 */
import "../test/jsdom-globals.ts";
import { ySyncPlugin } from "@tiptap/y-tiptap";
import { splitBlock } from "prosemirror-commands";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import * as Y from "yjs";
import type { Origin } from "./bridge.ts";
import { blockIds } from "./commands.ts";
import { pageSchema } from "./schema.ts";

/// Two devices on one page, each with the editor as the app builds it (blocks with ids).
function devices() {
  const docs = [new Y.Doc(), new Y.Doc()];
  docs.forEach((doc, i) =>
    doc.on("update", (update: Uint8Array, origin: Origin) => {
      if (origin !== "remote") Y.applyUpdate(docs[1 - i], update, "remote");
    }),
  );
  const editor = (doc: Y.Doc) => {
    const host = document.createElement("div");
    document.body.append(host);
    return new EditorView(host, {
      state: EditorState.create({
        schema: pageSchema,
        plugins: [ySyncPlugin(doc.getXmlFragment("default")), blockIds],
      }),
    });
  };
  const mine = editor(docs[0]);
  mine.dispatch(mine.state.tr.insertText("hello world", 1));
  // The cursor in "world", after "wo".
  mine.dispatch(mine.state.tr.setSelection(TextSelection.create(mine.state.doc, 9)));
  mine.focus();
  return { mine, other: editor(docs[1]) };
}

/// The text of the line the cursor is in, up to the cursor.
const beforeCursor = (view: EditorView) => {
  const { $head } = view.state.selection;
  return $head.parent.textContent.slice(0, $head.parentOffset);
};

describe("my cursor while another device edits", () => {
  it("stays in its word when they type earlier in the same line", () => {
    const { mine, other } = devices();
    other.dispatch(other.state.tr.insertText("Oh ", 1));
    expect(mine.state.doc.textContent).toBe("Oh hello world");
    expect(beforeCursor(mine)).toBe("Oh hello wo");
  });

  it("stays put when they type later in the same line", () => {
    const { mine, other } = devices();
    other.dispatch(other.state.tr.insertText("!", 12));
    expect(beforeCursor(mine)).toBe("hello wo");
  });

  it("stays in its word when they add a line above", () => {
    const { mine, other } = devices();
    other.dispatch(other.state.tr.setSelection(TextSelection.create(other.state.doc, 1)));
    splitBlock(other.state, other.dispatch);
    other.dispatch(other.state.tr.insertText("New", 1));
    expect(beforeCursor(mine)).toBe("hello wo");
  });

  it("follows its word into the new line when they split the line before it", () => {
    const { mine, other } = devices();
    other.dispatch(other.state.tr.setSelection(TextSelection.create(other.state.doc, 3)));
    splitBlock(other.state, other.dispatch);
    expect(beforeCursor(mine)).toBe("llo wo");
  });
});
