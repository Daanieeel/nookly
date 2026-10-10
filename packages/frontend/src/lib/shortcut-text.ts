import { displayText } from "#/lib/shortcuts.ts";

/// A code span that is a shortcut: modifiers joined by `+`, then a key (`Mod+Shift+J`).
const SHORTCUT = /`((?:(?:Mod|Cmd|Ctrl|Control|Alt|Option|Shift)\+)+[^`+\s]+)`/g;

/// Rewrites shortcuts written in code in markdown (`` `Mod+Shift+J` ``) the way this system
/// shows them: `⇧⌘J` on a Mac and `Ctrl+Shift+J` elsewhere. Notes written for everyone use
/// `Mod` (or `Cmd`) for the main modifier, so they read right on either.
export function localizeShortcuts(markdown: string, mac?: boolean): string {
  return markdown.replace(SHORTCUT, (_match, combo: string) => {
    const hotkey = combo
      .replace(/\b(?:Cmd|Ctrl|Control)\b/g, "Mod")
      .replace(/\bOption\b/g, "Alt")
      .replace(/\+(Left|Right|Up|Down)$/, "+Arrow$1");
    return `\`${displayText(hotkey, mac)}\``;
  });
}
