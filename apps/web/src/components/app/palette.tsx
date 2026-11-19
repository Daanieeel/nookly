"use client";

import { IconBook2, IconClipboardList, IconNotes, IconPlus } from "@tabler/icons-react";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@nookly/ui/components/command";
import { Kbd, KbdGroup } from "@nookly/ui/components/kbd";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";

/// The command palette, live: type to filter, arrow keys to move, as in the app.
export function PaletteMock({ locale }: { locale: Locale }) {
  const t = dictionary(locale).keyboard;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      <Command label={t.placeholder} className="h-auto **:data-[slot=command-input-wrapper]:h-12">
        <CommandInput placeholder={t.placeholder} />
        <CommandList className="max-h-none">
          <CommandGroup heading={t.groups.recent}>
            <CommandItem value={t.items.algorithms}>
              <IconBook2 />
              {t.items.algorithms}
              <CommandShortcut className="font-mono">CRS-3</CommandShortcut>
            </CommandItem>
            <CommandItem value={t.items.problemSet}>
              <IconClipboardList />
              {t.items.problemSet}
              <CommandShortcut className="font-mono">ASG-12</CommandShortcut>
            </CommandItem>
            <CommandItem value={t.items.mensa}>
              <IconNotes />
              {t.items.mensa}
              <CommandShortcut className="font-mono">NTE-40</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t.groups.create}>
            <CommandItem value={t.items.newTask}>
              <IconPlus />
              {t.items.newTask}
              <KbdGroup className="ml-auto">
                <Kbd>⌘</Kbd>
                <Kbd>N</Kbd>
              </KbdGroup>
            </CommandItem>
            <CommandItem value={t.items.newNote}>
              <IconPlus />
              {t.items.newNote}
              <KbdGroup className="ml-auto">
                <Kbd>⌘</Kbd>
                <Kbd>⇧</Kbd>
                <Kbd>N</Kbd>
              </KbdGroup>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
