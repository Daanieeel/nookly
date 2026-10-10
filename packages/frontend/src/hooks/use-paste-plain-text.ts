import { Editor } from "@tiptap/core";
import { useEffect } from "react";
import { readClipboardText } from "#/lib/clipboard.ts";

type TextField = HTMLInputElement | HTMLTextAreaElement;

/// Input types that hold free text; a checkbox or a date picker has nothing to paste into.
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel", "password"]);

function editableTextField(element: Element | null): TextField | null {
  if (element instanceof HTMLTextAreaElement)
    return element.readOnly || element.disabled ? null : element;
  if (element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type)) {
    return element.readOnly || element.disabled ? null : element;
  }
  return null;
}

/// A Tiptap view's root element, which remembers the editor that owns it.
interface EditorRoot extends HTMLElement {
  editor?: unknown;
}

/// The editor whose document holds `element`.
function editorAt(element: Element | null): Editor | null {
  const editor = element?.closest<EditorRoot>(".ProseMirror")?.editor;
  return editor instanceof Editor && editor.isEditable ? editor : null;
}

/// Puts `text` into a field at the caret or over the selection, the way typing it would,
/// so the field's own change handlers and undo history see it.
function insertIntoField(field: TextField, text: string) {
  field.focus();
  // The browser's own insertion keeps the native undo stack; not every webview has it.
  if (document.execCommand?.("insertText", false, text)) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setRangeText(text, start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/// Cmd+Shift+V (Ctrl+Shift+V elsewhere) pastes the clipboard as plain text: in the page
/// editor and in any text field, dropping whatever formatting the copy carried. Anywhere
/// else the key does nothing and is left alone.
export function usePastePlainText() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "v") return;
      const active = document.activeElement;
      const editor = editorAt(active);
      const field = editor ? null : editableTextField(active);
      if (!editor && !field) return;
      event.preventDefault();
      void readClipboardText()
        .then((text) => {
          if (!text) return;
          if (editor && !editor.isDestroyed) editor.view.pasteText(text);
          else if (field?.isConnected) insertIntoField(field, text);
        })
        // Nothing to paste (an empty or unreadable clipboard) leaves the field as it was.
        .catch(() => undefined);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
