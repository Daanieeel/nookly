import { accentInsensitiveFilter } from "#/lib/command-filter.ts";
import { useMutation } from "@tanstack/react-query";
import {
  StatusAnnouncer,
  StatusIcon,
  statusOf,
  statusTextClass,
} from "#/components/action-feedback.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@nookly/ui/components/command";
import { MODULE_DESCRIPTIONS, MODULE_ICONS, MODULE_LABELS } from "#/lib/modules.ts";
import type { ModuleKey } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";

/// The searchable list of modules to add: one row per module with an icon chip and a
/// one-line description, not a bare name list. Stays put while `onSelect` runs so the
/// picked row can show pending and errors, and calls `onAdded` once it succeeded.
export function AddModulePicker({
  moduleKeys,
  onSelect,
  onAdded,
}: {
  moduleKeys: ModuleKey[];
  onSelect: (key: ModuleKey) => Promise<void>;
  onAdded: () => void;
}) {
  const add = useMutation({ mutationFn: onSelect, onSuccess: onAdded });
  return (
    <Command filter={accentInsensitiveFilter}>
      <CommandInput placeholder="Add a module…" />
      <CommandList>
        <CommandEmpty>All modules already added.</CommandEmpty>
        <CommandGroup>
          {moduleKeys.map((key) => {
            const Icon = MODULE_ICONS[key];
            const status = add.variables === key ? statusOf(add) : "idle";
            const errorText = `Couldn't add ${MODULE_LABELS[key]}, try again`;
            return (
              <CommandItem
                key={key}
                value={MODULE_LABELS[key]}
                onSelect={() => {
                  if (!add.isPending) add.mutate(key);
                }}
                className="items-start gap-2.5 py-2"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <StatusIcon status={status} idle={<Icon />} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{MODULE_LABELS[key]}</span>
                  <span
                    className={cn(
                      "line-clamp-1 text-xs",
                      statusTextClass(status) ?? "text-muted-foreground",
                    )}
                  >
                    {status === "error" ? errorText : MODULE_DESCRIPTIONS[key]}
                  </span>
                </span>
                <StatusAnnouncer message={status === "error" ? errorText : null} />
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
