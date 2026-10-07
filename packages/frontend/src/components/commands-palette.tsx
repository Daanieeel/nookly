import { useEffect, useRef, useState } from "react";
import { QuickActions } from "#/components/quick-actions.tsx";
import {
  SpotlightDialog,
  SpotlightEmpty,
  SpotlightFooter,
  SpotlightInput,
  SpotlightList,
} from "#/components/spotlight.tsx";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { useNavStore } from "#/lib/store/nav.ts";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";

/// Cmd+Shift+P: every quick action and setting, nothing else, in the spirit of
/// VS Code's command palette. Cmd+K mixes the same actions into search.
export function CommandsPalette() {
  const open = useNavStore((s) => s.commandsOpen);
  const setOpen = useNavStore((s) => s.setCommandsOpen);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useAppHotkey("commands", () => setOpen(!useNavStore.getState().commandsOpen));

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <SpotlightDialog
      open={open}
      onOpenChange={setOpen}
      title="Commands"
      dirty={query !== ""}
      onClear={() => setQuery("")}
    >
      <SpotlightInput
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        placeholder="Run a command…"
      />
      <SpotlightList>
        <QuickActions
          query={query}
          mode="commands"
          onDone={() => setOpen(false)}
          onRefocus={() => inputRef.current?.focus()}
        />
        <SpotlightEmpty>No command matches “{query.trim()}”.</SpotlightEmpty>
      </SpotlightList>
      <SpotlightFooter
        aside={
          <>
            <ShortcutKbd name="search" />
            Search everything
          </>
        }
      />
    </SpotlightDialog>
  );
}
