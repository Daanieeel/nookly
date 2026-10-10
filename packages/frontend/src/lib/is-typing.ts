/// Whether focus is in something the user types into: a field, or the note editor.
export function isTyping(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"))
  );
}
