import type { Editor } from "@tiptap/core";

let focused: Editor | null = null;

/// Remembers `editor` as the one the user last typed in, so a command from a palette, which
/// takes the focus away, can still act on its selection. Returns the cleanup.
export function trackActiveEditor(editor: Editor): () => void {
  const onFocus = () => {
    focused = editor;
  };
  editor.on("focus", onFocus);
  return () => {
    editor.off("focus", onFocus);
    if (focused === editor) focused = null;
  };
}

/// The editor the user last typed in, while it is still open and can be edited.
export function activeEditor(): Editor | null {
  return focused && !focused.isDestroyed && focused.isEditable ? focused : null;
}
