/**
 * @jest-environment jsdom
 */
import "../test/jsdom-globals.ts";
import { undo, redo, ySyncPlugin, yUndoPlugin, yUndoPluginKey } from "@tiptap/y-tiptap";
import { splitBlock } from "prosemirror-commands";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import * as Y from "yjs";
import { blockIds } from "./commands.ts";
import { pageSchema } from "./schema.ts";

function editor() {
  const doc = new Y.Doc();
  const host = document.createElement("div");
  document.body.append(host);
  const view = new EditorView(host, {
    state: EditorState.create({
      schema: pageSchema,
      plugins: [ySyncPlugin(doc.getXmlFragment("default")), yUndoPlugin(), blockIds],
    }),
  });
  return view;
}

describe("undo and redo on the phone", () => {
  it("takes back what was typed, and puts it back", () => {
    const view = editor();
    view.dispatch(view.state.tr.insertText("hello", 1));
    yUndoPluginKey.getState(view.state)?.undoManager.stopCapturing();
    view.dispatch(view.state.tr.insertText(" world", 6));
    expect(view.state.doc.textContent).toBe("hello world");
    expect(undo(view.state)).toBe(true);
    expect(view.state.doc.textContent).toBe("hello");
    expect(redo(view.state)).toBe(true);
    expect(view.state.doc.textContent).toBe("hello world");
  });

  it("takes back a new line and the text in it", () => {
    const view = editor();
    const stop = () => yUndoPluginKey.getState(view.state)?.undoManager.stopCapturing();
    view.dispatch(view.state.tr.insertText("one", 1));
    stop();
    splitBlock(view.state, view.dispatch);
    view.dispatch(view.state.tr.insertText("two"));
    stop();
    expect(view.state.doc.childCount).toBe(2);
    expect(undo(view.state)).toBe(true);
    expect(view.state.doc.textContent).toBe("one");
    expect(undo(view.state)).toBe(true);
    expect(view.state.doc.textContent).toBe("");
  });
});
