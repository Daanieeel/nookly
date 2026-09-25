import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { MODULE_DESCRIPTIONS, MODULE_ICONS, MODULE_LABELS } from "#/lib/modules.ts";
import type { ModuleKey } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";

/// The Notion-style "insert" picker (§ module-add UX): searchable, one row per
/// module with an icon chip + one-line description, not a bare name list.
/// Stays open while `onSelect` runs so the picked row can show pending and errors.
export function AddModuleMenu({
  moduleKeys,
  onSelect,
  trigger,
  tooltip,
  onOpenChange,
}: {
  moduleKeys: ModuleKey[];
  onSelect: (key: ModuleKey) => Promise<void>;
  trigger: React.ReactNode;
  tooltip?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const setOpenAndNotify = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const add = useMutation({
    mutationFn: onSelect,
    // Success navigates to the new module, which is the confirmation.
    onSuccess: () => setOpenAndNotify(false),
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpenAndNotify(next);
        if (!next) add.reset();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </TooltipTrigger>
        {tooltip && <TooltipContent side="top">{tooltip}</TooltipContent>}
      </Tooltip>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
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
                      <span className="text-sm font-medium text-foreground">
                        {MODULE_LABELS[key]}
                      </span>
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
      </PopoverContent>
    </Popover>
  );
}
