import { useEffect, useRef, useState } from "react";
import { QuickActions } from "@/components/quick-actions";
import {
  SpotlightDialog,
  SpotlightEmpty,
  SpotlightFooter,
  SpotlightInput,
  SpotlightList,
} from "@/components/spotlight";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useNavStore } from "@/lib/store/nav";

/// Cmd+Shift+P: every quick action and setting, nothing else, in the spirit of
/// VS Code's command palette. Cmd+K mixes the same actions into search.
export function CommandsPalette() {
  const open = useNavStore((s) => s.commandsOpen);
  const setOpen = useNavStore((s) => s.setCommandsOpen);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen(!useNavStore.getState().commandsOpen);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

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
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
            Search everything
          </>
        }
      />
    </SpotlightDialog>
  );
}
