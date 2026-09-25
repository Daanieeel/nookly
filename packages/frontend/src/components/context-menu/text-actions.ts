import { IconClipboard, IconCopy, IconCut, IconSelectAll } from "@tabler/icons-react";
import { copyText, readClipboardText } from "#/lib/clipboard.ts";
import { registerActions } from "./registry";

declare module "./registry" {
  interface ContextTargets {
    /// Right-clicked inside a text input, textarea or editable content. Always
    /// resolved by the host itself, never claimed; its actions come first,
    /// followed by whatever the surrounding target (a Note block) adds.
    text: TextTarget;
  }
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

export interface TextTarget {
  element: HTMLElement;
  readOnly: boolean;
  selectedText: string;
  /// Focuses the element again with the selection it had when the menu opened.
  restoreSelection: () => void;
}

/// Input types that hold free text; a checkbox or a date picker has nothing to cut.
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel", "password", "number"]);

function isTextField(element: Element): element is TextField {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type);
}

/// The editable element under `node`, if any: a text field, or the root of the
/// editable region it sits in (a Note's editor).
export function editableAt(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const field = node.closest("input, textarea");
  if (field && isTextField(field)) return field;
  const editable = node.closest<HTMLElement>("[contenteditable]");
  if (!editable?.isContentEditable) return null;
  let root = editable;
  while (root.parentElement?.isContentEditable) root = root.parentElement;
  return root;
}

/// Snapshots the element's selection now, since opening the menu moves focus away.
export function captureTextTarget(element: HTMLElement): TextTarget {
  if (isTextField(element)) {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    return {
      element,
      readOnly: element.readOnly || element.disabled,
      selectedText: start !== null && end !== null ? element.value.slice(start, end) : "",
      restoreSelection: () => {
        element.focus({ preventScroll: true });
        if (start !== null && end !== null) element.setSelectionRange(start, end);
      },
    };
  }
  const selection = window.getSelection();
  const range =
    selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange()
      : null;
  return {
    element,
    readOnly: false,
    selectedText: range?.toString() ?? "",
    restoreSelection: () => {
      element.focus({ preventScroll: true });
      if (!range) return;
      const current = window.getSelection();
      current?.removeAllRanges();
      current?.addRange(range);
    },
  };
}

/// `execCommand` is deprecated but still the one way to edit a field or an
/// editable region the way typing does: it keeps the undo history intact and
/// fires the input events React and the Note editor listen to.
function edit(command: "delete" | "insertText" | "selectAll", value?: string) {
  document.execCommand(command, false, value);
}

registerActions("text", [
  {
    id: "cut",
    group: "edit",
    label: "Cut",
    icon: IconCut,
    shortcut: "⌘X",
    afterClose: true,
    disabled: (t) => t.readOnly || !t.selectedText,
    run: async (t) => {
      await copyText(t.selectedText);
      t.restoreSelection();
      edit("delete");
    },
    errorLabel: "Couldn't cut, try again",
  },
  {
    id: "copy",
    group: "edit",
    label: "Copy",
    icon: IconCopy,
    shortcut: "⌘C",
    afterClose: true,
    disabled: (t) => !t.selectedText,
    run: async (t) => {
      await copyText(t.selectedText);
      t.restoreSelection();
    },
    errorLabel: "Couldn't copy, try again",
  },
  {
    id: "paste",
    group: "edit",
    label: "Paste",
    icon: IconClipboard,
    shortcut: "⌘V",
    afterClose: true,
    disabled: (t) => t.readOnly,
    run: async (t) => {
      const text = await readClipboardText();
      t.restoreSelection();
      if (text) edit("insertText", text);
    },
    errorLabel: "Couldn't paste, try again",
  },
  {
    id: "select-all",
    group: "edit",
    label: "Select All",
    icon: IconSelectAll,
    shortcut: "⌘A",
    afterClose: true,
    run: (t) => {
      t.restoreSelection();
      if (isTextField(t.element)) t.element.select();
      else edit("selectAll");
    },
  },
]);
