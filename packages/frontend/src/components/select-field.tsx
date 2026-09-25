import { IconCheck, IconSelector } from "@tabler/icons-react";
import { Fragment, type ReactNode, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@nookly/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { cn } from "@nookly/ui/lib/utils";

export interface SelectFieldOption {
  value: string;
  label: string;
  /// Extra words the search matches, like a time zone's country name.
  keywords?: string[];
  icon?: ReactNode;
  /// Draws a divider above this option, for a short list of common choices ahead
  /// of the full list.
  separatorBefore?: boolean;
}

/// A single choice behind a trigger styled like the other inputs, with an
/// optional search for long lists. Options can lead with an icon, like a flag.
export function SelectField({
  options,
  value,
  onChange,
  searchable = false,
  searchPlaceholder = "Search…",
  className,
  "aria-label": ariaLabel,
}: {
  options: SelectFieldOption[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-accent px-2.5 text-left text-sm shadow-xs transition-colors outline-none hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent/80",
            className,
          )}
        >
          {selected?.icon && <span className="flex shrink-0 items-center">{selected.icon}</span>}
          <span className="min-w-0 flex-1 truncate">{selected?.label ?? value}</span>
          <IconSelector size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        <Command loop>
          {searchable && (
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={searchPlaceholder}
            />
          )}
          <CommandList className="max-h-64 p-1">
            <CommandEmpty>No matches.</CommandEmpty>
            {options.map((o) => (
              <Fragment key={o.value}>
                {/* Dividers mark list position, which means nothing once filtered. */}
                {o.separatorBefore && !search && <CommandSeparator className="my-1" />}
                <CommandItem
                  value={o.value}
                  keywords={[o.label, ...(o.keywords ?? [])]}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  {o.icon && <span className="flex shrink-0 items-center">{o.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === value && <IconCheck size={14} className="shrink-0 text-primary" />}
                </CommandItem>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
