import type { Editor } from "@tiptap/core";
import { useNavStore } from "#/lib/store/nav.ts";

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

/// The editor the user last typed in, while it is still open, can be edited and sits
/// in the focused tab group (or in no group, like a dialog's).
export function activeEditor(): Editor | null {
  if (!focused || focused.isDestroyed || !focused.isEditable) return null;
  const group = focused.view.dom.closest<HTMLElement>("[data-tab-group]")?.dataset.tabGroup;
  return group === undefined || group === useNavStore.getState().focusedGroupId ? focused : null;
}
