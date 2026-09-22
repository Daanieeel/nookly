import { IconFileCode, IconSelector } from "@tabler/icons-react";
import { Command } from "cmdk";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CODE_LANGUAGES, resolveLanguageEntry } from "./code-languages";

/// Searchable language picker for the code block header row — a plain `Select`
/// doesn't filter by typing, and with ~19 languages plus aliases that's slow to
/// scan. Follows the same Popover+cmdk pattern as `EntityPickerPopover`.
export function CodeBlockLanguagePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (language: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = resolveLanguageEntry(value);
  const SelectedIcon = selected?.icon ?? IconFileCode;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 shrink-0 gap-1.5 px-1.5 text-xs">
          <SelectedIcon className="size-3.5 shrink-0" />
          <span className="truncate">{selected?.label ?? "Plain Text"}</span>
          <IconSelector size={12} className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <Command className="flex flex-col">
          <Command.Input
            placeholder="Search languages…"
            className="h-9 border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </Command.Empty>
            <Command.Item
              value="Plain Text"
              onSelect={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
            >
              <IconFileCode size={14} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">Plain Text</span>
            </Command.Item>
            {CODE_LANGUAGES.map((lang) => (
              <Command.Item
                key={lang.value}
                value={lang.label}
                onSelect={() => {
                  onChange(lang.value);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
              >
                <lang.icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{lang.label}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
