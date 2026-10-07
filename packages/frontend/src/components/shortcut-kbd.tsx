import { useShortcut } from "#/hooks/use-shortcut.ts";
import { type ShortcutName, displayParts } from "#/lib/shortcuts.ts";
import { Kbd, KbdGroup } from "./kbd.tsx";

/// The keycaps of a shortcut as the user has bound it, or nothing while it is unassigned.
export function ShortcutKbd({ name, className }: { name: ShortcutName; className?: string }) {
  const hotkey = useShortcut(name);
  if (!hotkey) return null;
  return (
    <KbdGroup className={className}>
      {displayParts(hotkey).map((part, index) => (
        // The same word can appear twice only in an odd binding; position keeps keys unique.
        <Kbd key={`${index}-${part}`}>{part}</Kbd>
      ))}
    </KbdGroup>
  );
}
