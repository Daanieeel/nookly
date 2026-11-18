/// Other people's carets in a live page, as the desktop draws them: a line in their color
/// with their name above it. In the page's first block there is no room above (the page
/// starts there), so the name goes under the caret instead.
export const CARET_CSS = `
.collaboration-cursor__caret, .ProseMirror-yjs-cursor { position: relative; margin-left: -1px; margin-right: -1px; border-left: 2px solid; border-right: 2px solid; word-break: normal; pointer-events: none; }
.ProseMirror-yjs-cursor > div { position: absolute; top: -1.35em; left: -2px; padding: 1px 5px; border-radius: 4px 4px 4px 0; color: #fff; font: 600 11px/1.3 -apple-system, system-ui, sans-serif; white-space: nowrap; user-select: none; }
.pm > :first-child .ProseMirror-yjs-cursor > div { top: 100%; border-radius: 0 4px 4px 4px; }
`;

/// The caret of one other person, for `yCursorPlugin`'s `cursorBuilder`.
export function remoteCaret(user: { name?: string; color?: string }): HTMLElement {
  const color = user.color ?? "#64748b";
  const caret = document.createElement("span");
  caret.className = "ProseMirror-yjs-cursor";
  caret.style.borderColor = color;
  const label = document.createElement("div");
  label.style.background = color;
  label.textContent = user.name ?? "Someone";
  caret.append(label);
  return caret;
}
