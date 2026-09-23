import { useEffect } from "react";
import { editableAt } from "@/components/context-menu/text-actions";

/// Cmd+A (Ctrl+A) selects text only where there is text to edit: inputs,
/// textareas and editable content like the Notes editor. Anywhere else it would
/// highlight the whole app window like a web page, so it does nothing.
export function useScopedSelectAll() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "a") return;
      if (event.shiftKey || event.altKey) return;
      if (editableAt(event.target)) return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
