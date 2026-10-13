import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { activeEditor, trackActiveEditor } from "./active-editor.ts";

const initial = useNavStore.getState();

function editorIn(groupId: string | null): Editor {
  const host = document.createElement("div");
  if (groupId) host.dataset.tabGroup = groupId;
  document.body.append(host);
  const element = document.createElement("div");
  host.append(element);
  return new Editor({ element, extensions: [StarterKit] });
}

afterEach(() => {
  useNavStore.setState(initial, true);
  document.body.innerHTML = "";
});

describe("the editor palette commands act on", () => {
  it("is the one last typed in", () => {
    const editor = editorIn(null);
    const stop = trackActiveEditor(editor);
    editor.emit("focus", { editor, event: new FocusEvent("focus"), transaction: editor.state.tr });
    expect(activeEditor()).toBe(editor);
    stop();
    editor.destroy();
  });

  it("is none once its tab group is no longer focused", () => {
    useNavStore.setState({ focusedGroupId: "R" });
    const editor = editorIn("L");
    const stop = trackActiveEditor(editor);
    editor.emit("focus", { editor, event: new FocusEvent("focus"), transaction: editor.state.tr });
    expect(activeEditor()).toBeNull();
    useNavStore.setState({ focusedGroupId: "L" });
    expect(activeEditor()).toBe(editor);
    stop();
    editor.destroy();
  });
});
