import { IconAlertTriangle, IconArrowBackUp, IconLock } from "@tabler/icons-react";
import { Fragment, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nookly/ui/components/table";
import { cn } from "@nookly/ui/lib/utils";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { Kbd } from "#/components/kbd.tsx";
import { useShortcutMap } from "#/hooks/use-shortcut.ts";
import { useSettingsValues } from "#/lib/settings/settings.ts";
import {
  FIXED_SHORTCUTS,
  SHORTCUT_META,
  SHORTCUT_NAMES,
  SHORTCUT_PAGES,
  type ShortcutName,
  type ShortcutPage,
  displayParts,
  shortcutSettingId,
} from "#/lib/shortcuts.ts";
import { CopyIdButton, ResetButton } from "./SettingRow.tsx";
import { ShortcutControl } from "./ShortcutControl.tsx";
import { resetAllShortcuts } from "./shortcut-editing.ts";

/// The count of shortcuts the user has changed (stored, so not at their default).
function useChangedCount(): number {
  return useSettingsValues(
    (values) => Object.keys(values).filter((id) => id.startsWith("shortcuts.")).length,
  );
}

/// Top of the Shortcuts page: what this is, and Reset all.
function ShortcutsToolbar() {
  const changed = useChangedCount();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-6 pb-3">
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

type Filter = "All" | ShortcutPage;
const FILTERS: Filter[] = ["All", ...SHORTCUT_PAGES];

/// One button per section of shortcuts, in place of a page of the navigation each.
function FilterStrip({ value, onChange }: { value: Filter; onChange: (next: Filter) => void }) {
  return (
    <div role="group" aria-label="Filter shortcuts" className="flex flex-wrap gap-1 pb-4">
      {FILTERS.map((filter) => (
        <Button
          key={filter}
          variant={value === filter ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={value === filter}
          aria-label={`${filter} shortcuts`}
          onClick={() => onChange(filter)}
        >
          {filter}
        </Button>
      ))}
    </div>
  );
}

/// A shortcut that wants a key another one holds: it is stored, but came out unassigned.
function useLostKey(name: ShortcutName): boolean {
  const effective = useShortcutMap()[name];
  const stored = useSettingsValues((values) => values[shortcutSettingId(name)]);
  return effective === null && stored !== null;
}

function ShortcutRow({ name }: { name: ShortcutName }) {
  const id = shortcutSettingId(name);
  const { title, description } = SHORTCUT_META[name];
  const lost = useLostKey(name);
  return (
    <TableRow data-setting-id={id}>
      <TableCell className="min-w-0 py-3 align-top whitespace-normal">
        <CopyIdButton settingId={id} />
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{title}</span>
          <ResetButton settingId={id} title={title} />
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {lost && (
          <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
            <IconAlertTriangle size={12} className="shrink-0" />
            Its key is taken by another shortcut. Pick a new key.
          </p>
        )}
      </TableCell>
      <TableCell className="w-44 py-3 align-top">
        <div className="flex justify-end">
          <ShortcutControl name={name} />
        </div>
      </TableCell>
    </TableRow>
  );
}

/// The section of a shortcut, as the wider type of the pages it can sit under.
function sectionOf(name: ShortcutName): ShortcutPage {
  return SHORTCUT_META[name].section;
}

function SectionTable({ section }: { section: ShortcutPage }) {
  const names = SHORTCUT_NAMES.filter((name) => sectionOf(name) === section);
  if (names.length === 0) return null;
  return (
    <Table aria-label={`${section} shortcuts`}>
      <TableHeader className="sr-only">
        <TableRow>
          <TableHead>Action</TableHead>
          <TableHead>Key</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {names.map((name) => (
          <ShortcutRow key={name} name={name} />
        ))}
      </TableBody>
    </Table>
  );
}

function KeysCell({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {keys.map((key, index) => (
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
  );
}

/// Read only: the keys with a fixed meaning, which rebindable shortcuts can't take. Nothing
/// is drawn when the filter holds none.
function FixedShortcuts({ filter }: { filter: Filter }) {
  const shortcuts = FIXED_SHORTCUTS.filter((fixed) => filter === "All" || fixed.section === filter);
  if (shortcuts.length === 0) return null;
  return (
    <section aria-labelledby="fixed-shortcuts-heading" className="pt-5">
      <h3
        id="fixed-shortcuts-heading"
        className="flex items-center gap-1.5 pb-1 text-xs font-medium text-muted-foreground"
      >
        <IconLock size={12} />
        Fixed shortcuts
      </h3>
      <p className="pb-2 text-xs text-muted-foreground">
        These keys have a fixed meaning and can't be changed.
      </p>
      <Table aria-labelledby="fixed-shortcuts-heading">
        <TableHeader className="sr-only">
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Where</TableHead>
            <TableHead>Key</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shortcuts.map((fixed) => (
            <TableRow key={`${fixed.section}-${fixed.label}`}>
              <TableCell className="py-2.5 whitespace-normal">{fixed.label}</TableCell>
              <TableCell
                className={cn(
                  "w-24 py-2.5 text-xs text-muted-foreground",
                  filter !== "All" && "hidden",
                )}
              >
                {fixed.section === "General" ? "Everywhere" : fixed.section}
              </TableCell>
              <TableCell className="py-2.5 whitespace-normal">
                <KeysCell keys={fixed.keys} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/// The Shortcuts page: a filter strip across the top, one table of rebindable shortcuts per
/// section, and the read only fixed ones after them.
export function ShortcutsPage() {
  const [filter, setFilter] = useState<Filter>("All");
  const sections = filter === "All" ? SHORTCUT_PAGES : [filter];
  return (
    <>
      <ShortcutsToolbar />
      <FilterStrip value={filter} onChange={setFilter} />
      {sections.map((section) => (
        <Fragment key={section}>
          {filter === "All" && SHORTCUT_NAMES.some((n) => sectionOf(n) === section) && (
            <h3 className="pt-5 pb-1 text-xs font-medium text-muted-foreground first-of-type:pt-0">
              {section}
            </h3>
          )}
          <SectionTable section={section} />
        </Fragment>
      ))}
      <FixedShortcuts filter={filter} />
    </>
  );
}
