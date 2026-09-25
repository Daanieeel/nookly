import { useEffect } from "react";

/// True while typing somewhere, so single key shortcuts stay out of the way.
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/// C runs `create`, as in Linear, whenever nothing else has the keyboard.
export function useCreateShortcut(create: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isEditable(e.target) || document.querySelector("[role=dialog],[role=menu]")) return;
      e.preventDefault();
      create();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [create]);
}
