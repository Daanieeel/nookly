import { IconLayoutGrid, IconList, IconTable } from "@tabler/icons-react";
import { type NoteGroupBy, NOTE_GROUP_BYS } from "@nookly/shared/note-groups";
import {
  DisplayPopover,
  LayoutTiles,
  OptionRow,
  PropertyChips,
  SelectRow,
} from "#/features/display-menu.tsx";
import { Separator } from "@nookly/ui/components/separator";
import { Switch } from "@nookly/ui/components/switch";

/// How the Notes page shows its Notes: grouped cards by default, grouped lines, or the table.
export type NotesLayout = "cards" | "list" | "table";

/// What a Note shows besides its title; any can be hidden. They are the table's columns and
/// the same details on the cards and lines.
export type NoteProperty = "key" | "preview" | "labels" | "edited";

export const NOTE_PROPERTIES: { id: NoteProperty; label: string }[] = [
  { id: "key", label: "ID" },
  { id: "preview", label: "Preview" },
  { id: "labels", label: "Labels" },
  { id: "edited", label: "Last edited" },
];

export interface NotesDisplay {
  layout: NotesLayout;
  /// What the notes are grouped by.
  groupBy: NoteGroupBy;
  /// The properties left out.
  hidden: NoteProperty[];
  /// The row of the latest edits above the groups.
  showContinue: boolean;
}

const CONTINUE_LABEL = 'Show category "Continue"';

const TILES = [
  { id: "cards", label: "Cards", icon: IconLayoutGrid },
  { id: "list", label: "List", icon: IconList },
  { id: "table", label: "Table", icon: IconTable },
] satisfies { id: NotesLayout; label: string; icon: typeof IconTable }[];

/// The "Display" popover of the Notes page, as on Tasks: the layout and what shows above the
/// groups.
export function NotesDisplayMenu({
  display,
  onChange,
}: {
  display: NotesDisplay;
  onChange: (display: NotesDisplay) => void;
}) {
  return (
    <DisplayPopover variant="secondary">
      <LayoutTiles
        tiles={TILES}
        value={display.layout}
        onSelect={(layout) => onChange({ ...display, layout })}
      />
      <SelectRow
        label="Group by"
        value={display.groupBy}
        options={NOTE_GROUP_BYS}
        fallback="course"
        onChange={(groupBy) => onChange({ ...display, groupBy })}
      />
      <OptionRow label={CONTINUE_LABEL}>
        <Switch
          aria-label={CONTINUE_LABEL}
          checked={display.showContinue}
          onCheckedChange={(showContinue) => onChange({ ...display, showContinue })}
        />
      </OptionRow>
      <Separator />

      <PropertyChips
        properties={NOTE_PROPERTIES}
        selected={NOTE_PROPERTIES.map((p) => p.id).filter((id) => !display.hidden.includes(id))}
        onChange={(shown) =>
          onChange({
            ...display,
            hidden: NOTE_PROPERTIES.map((p) => p.id).filter((id) => !shown.includes(id)),
          })
        }
      />
    </DisplayPopover>
  );
}

export const NOTES_LAYOUTS: NotesLayout[] = TILES.map((t) => t.id);
