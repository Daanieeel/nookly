import { useEffect, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { FieldError } from "#/components/action-feedback.tsx";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { useShortcut } from "#/hooks/use-shortcut.ts";
import {
  type ShortcutName,
  SHORTCUT_META,
  displayText,
  hotkeyEquals,
  hotkeyFromEvent,
} from "#/lib/shortcuts.ts";
import { requestShortcutChange } from "./shortcut-editing.ts";

/// Swallows the key release that would otherwise click the focused button again.
function swallowKeyUp(event: KeyboardEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/// The key of one shortcut as a button. Click it, press the new combination, done.
/// Escape cancels. While it listens it takes every key press before the rest of the app
/// can see it, so recording a key never triggers a shortcut. Cmd on a Mac and Ctrl
/// elsewhere are saved as `Mod`.
export function ShortcutControl({ name }: { name: ShortcutName }) {
  const hotkey = useShortcut(name);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { title } = SHORTCUT_META[name];

  useEffect(() => {
    if (!recording) return;
    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setError(null);
        setRecording(false);
        return;
      }
      const next = hotkeyFromEvent(event);
      // A modifier on its own: keep listening for the rest of the combination.
      if (next === null) return;
      window.addEventListener("keyup", swallowKeyUp, { capture: true, once: true });
      if (hotkey !== null && hotkeyEquals(next, hotkey)) {
        setError(null);
        setRecording(false);
        return;
      }
      const plan = requestShortcutChange(name, next);
      if (plan.kind === "invalid") setError(plan.message);
      else if (plan.kind === "fixed") {
        setError(`${displayText(next)} is used for "${plan.label}", which can't be reassigned.`);
      } else {
        setError(null);
        setRecording(false);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, name, hotkey]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        aria-label={
          recording
            ? `Press a shortcut for ${title}`
            : `Change ${title} shortcut, ${hotkey ? `now ${displayText(hotkey)}` : "not set"}`
        }
        aria-pressed={recording}
        className="min-w-28"
        onClick={() => {
          if (recording) return;
          setError(null);
          setRecording(true);
        }}
        onBlur={() => {
          setRecording(false);
          setError(null);
        }}
      >
        {recording ? (
          "Press a shortcut"
        ) : hotkey ? (
          <ShortcutKbd name={name} />
        ) : (
          <span className="text-muted-foreground">Not set</span>
        )}
      </Button>
      {recording && !error && <span className="text-xs text-muted-foreground">Esc to cancel</span>}
      <FieldError message={error} />
    </div>
  );
}
