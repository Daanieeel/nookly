import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MODULE_DESCRIPTIONS, MODULE_ICONS, MODULE_LABELS } from "@/lib/modules";
import type { ModuleKey } from "@/lib/store/nav";

/// The Notion-style "insert" picker (§ module-add UX): searchable, one row per
/// module with an icon chip + one-line description, not a bare name list.
export function AddModuleMenu({
  moduleKeys,
  onSelect,
  trigger,
}: {
  moduleKeys: ModuleKey[];
  onSelect: (key: ModuleKey) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Add a module…" />
          <CommandList>
            <CommandEmpty>All modules already added.</CommandEmpty>
            <CommandGroup>
              {moduleKeys.map((key) => {
                const Icon = MODULE_ICONS[key];
                return (
                  <CommandItem
                    key={key}
                    value={MODULE_LABELS[key]}
                    onSelect={() => {
                      onSelect(key);
                      setOpen(false);
                    }}
                    className="items-start gap-2.5 py-2"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {MODULE_LABELS[key]}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {MODULE_DESCRIPTIONS[key]}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
