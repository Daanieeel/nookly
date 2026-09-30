import { formatForDisplay, type RegisterableHotkey } from "@tanstack/hotkeys";
import { Kbd, KbdGroup } from "@nookly/ui/components/kbd";

/// A shortcut from `HOTKEYS` as key caps, e.g. ⌘ N on macOS and Ctrl N elsewhere, so
/// the hint always matches the binding.
export function ShortcutKeys({ hotkey }: { hotkey: RegisterableHotkey }) {
  return (
    <KbdGroup>
      {formatForDisplay(hotkey, { parts: true }).map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}
