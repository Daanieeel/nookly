import { IconArrowBackUp } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { Kbd } from "#/components/kbd.tsx";
import { useSettingsValues } from "#/lib/settings/settings.ts";
import { FIXED_SHORTCUTS, displayParts } from "#/lib/shortcuts.ts";
import { resetAllShortcuts } from "./shortcut-editing.ts";

/// The count of shortcuts the user has changed (stored, so not at their default).
function useChangedCount(): number {
  return useSettingsValues(
    (values) => Object.keys(values).filter((id) => id.startsWith("shortcuts.")).length,
  );
}

/// Top of the Shortcuts tab: what this is, and Reset all.
export function ShortcutsToolbar() {
  const changed = useChangedCount();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-6 pb-2">
      <p className="text-xs text-muted-foreground">
        Click a key to change it, then press the new combination. A key can only do one thing:
        taking one that is in use asks you first.
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        disabled={changed === 0}
        onClick={() => setOpen(true)}
      >
        <IconArrowBackUp size={14} />
        Reset all shortcuts
      </Button>
      <ConfirmPermanentDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset all shortcuts?"
        description="Every shortcut you changed or cleared goes back to the key Nookly ships with, replacing the key you chose. Shortcuts you never changed stay as they are, and no other setting is touched."
        stats={[
          { value: changed, label: changed === 1 ? "Shortcut changed" : "Shortcuts changed" },
        ]}
        actionLabel="Reset all shortcuts"
        errorLabel="Couldn't reset, try again"
        status="idle"
        onConfirm={() => {
          resetAllShortcuts();
          setOpen(false);
        }}
      />
    </div>
  );
}

/// Read only: keys with a fixed meaning, which rebindable shortcuts can't take.
export function FixedShortcuts() {
  return (
    <section aria-labelledby="fixed-shortcuts-heading">
      <h3
        id="fixed-shortcuts-heading"
        className="pt-5 pb-1 text-xs font-medium text-muted-foreground"
      >
        Fixed shortcuts
      </h3>
      <p className="pb-2 text-xs text-muted-foreground">
        These keys have a fixed meaning and can't be changed.
      </p>
      <ul>
        {FIXED_SHORTCUTS.map((fixed) => (
          <li
            key={fixed.label}
            className="flex items-center justify-between gap-6 border-b border-border/60 py-2.5 text-sm last:border-b-0"
          >
            <span>{fixed.label}</span>
            <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              {fixed.keys.map((key, index) => (
                <span key={key} className="flex items-center gap-2">
                  {index > 0 && <span className="text-xs text-muted-foreground">or</span>}
                  <span className="flex items-center gap-0.5">
                    {displayParts(key).map((part, i) => (
                      <Kbd key={`${i}-${part}`}>{part}</Kbd>
                    ))}
                  </span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
