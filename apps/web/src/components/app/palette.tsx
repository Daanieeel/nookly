"use client";

import { useEffect, useState } from "react";
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

const NO_ROW = "-";

/// The command palette, live: type to filter, arrow keys to move, as in the app.
export function PaletteMock({ locale }: { locale: Locale }) {
  const t = dictionary(locale).keyboard;
  // The palette scrolls its selected row into view once, as it mounts. This one sits far
  // down the home page, so that would drag the visitor down with it. It mounts with a
  // value that matches no row, and selects the first row right after.
  const [selected, setSelected] = useState(NO_ROW);
  useEffect(() => setSelected(t.items.algorithms), [t.items.algorithms]);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      <Command
        label={t.placeholder}
        value={selected}
        onValueChange={setSelected}
        className="h-auto **:data-[slot=command-input-wrapper]:h-12"
      >
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
