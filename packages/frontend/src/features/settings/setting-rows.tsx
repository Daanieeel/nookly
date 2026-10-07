import { IconArchive, IconCalendarUser, IconFolder, IconRefresh } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import { CodeLanguageSettings } from "#/components/code-language-settings.tsx";
import {
  DateFormatSetting,
  TimeFormatSetting,
  TimezoneSetting,
} from "#/components/datetime-settings.tsx";
import { EffortSettings } from "#/components/effort-settings.tsx";
import { FileViewerThemeToggle } from "#/components/file-viewer-theme-toggle.tsx";
import { ThemeToggle } from "#/components/theme-toggle.tsx";
import { UpdateCard } from "#/components/update-card.tsx";
import {
  BackupDialog,
  useBackups,
  useChooseBackupFolder,
} from "#/features/backup/BackupDialog.tsx";
import {
  CalendarConnectionsDialog,
  useExternalCalendarStatus,
} from "#/features/sessions/external-calendars/CalendarConnectionsDialog.tsx";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Switch } from "@nookly/ui/components/switch";
import { qk } from "#/lib/query-keys.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import {
  SETTING_IDS,
  type SettingCategory,
  type SettingId,
  definitionOf,
} from "#/lib/settings/registry.ts";
import type { Searchable } from "#/lib/settings/search.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { checkForUpdate, useAppVersion } from "#/lib/updater.ts";

/// One row of the Settings dialog: a registry setting with its control, or an
/// action with no stored value.
export interface RowSpec extends Searchable {
  /// The setting id, or a key of its own for an action.
  id: string;
  /// Set for registry settings.
  setting?: SettingId;
  category: SettingCategory;
  /// Heading the row sits under, one of `SECTIONS` for its category.
  section: string;
  control: ReactNode;
  footer?: ReactNode;
}

/// Headings within a category, in display order.
const SECTIONS = {
  general: ["Date and time", "Tasks", "Backup", "About"],
  appearance: ["Theme"],
  calendar: ["Defaults", "Connections"],
  notes: ["Code"],
  shortcuts: [],
} satisfies Record<SettingCategory, string[]>;

/// Every registry setting needs an entry here, or the build fails. This is how a
/// setting gets its control.
const SETTING_UI = {
  "appearance.theme": { section: "Theme", control: <ThemeToggle /> },
  "appearance.fileViewerTheme": { section: "Theme", control: <FileViewerThemeToggle /> },
  "general.timezone": { section: "Date and time", control: <TimezoneSetting /> },
  "general.dateFormat": { section: "Date and time", control: <DateFormatSetting /> },
  "general.timeFormat": { section: "Date and time", control: <TimeFormatSetting /> },
  "general.effortScale": { section: "Tasks", control: <EffortSettings /> },
  "general.backupFolder": { section: "Backup", control: <BackupFolderControl /> },
  "general.backupAuto": { section: "Backup", control: <BackupAutoControl /> },
  "notes.defaultCodeLanguage": { section: "Code", control: <CodeLanguageSettings /> },
  "calendar.sessionLengthMinutes": {
    section: "Defaults",
    control: <MinutesControl settingId="calendar.sessionLengthMinutes" label="Session length" />,
  },
  "calendar.calendarEntryLengthMinutes": {
    section: "Defaults",
    control: (
      <MinutesControl
        settingId="calendar.calendarEntryLengthMinutes"
        label="Calendar entry length"
      />
    ),
  },
} satisfies Record<SettingId, { section: string; control: ReactNode }>;

/// Rows that open something or run something instead of storing a value.
const ACTION_ROWS: RowSpec[] = [
  {
    id: "calendar.connections",
    category: "calendar",
    section: "Connections",
    title: "External calendars",
    description: "Show events from other calendars on Sessions. They are read only.",
    synonyms: ["google calendar", "ical", "ics", "outlook", "connect", "sync", "subscribe"],
    control: <CalendarConnectionsControl />,
  },
  {
    id: "general.backup",
    category: "general",
    section: "Backup",
    title: "Back up and restore",
    description: "Back up everything in Nookly now, or restore from a backup.",
    synonyms: ["export", "save", "copy", "archive", "restore", "import", "zip"],
    control: <BackupControl />,
  },
  {
    id: "general.version",
    category: "general",
    section: "About",
    title: "Version",
    description: "The Nookly version you are running, and whether a newer one is out.",
    synonyms: ["update", "upgrade", "release", "about", "check for updates"],
    control: <VersionControl />,
    footer: <UpdateCard />,
  },
];

const FROM_REGISTRY: RowSpec[] = SETTING_IDS.map((id) => {
  const def = definitionOf(id);
  return {
    id,
    setting: id,
    category: def.category,
    title: def.title,
    description: def.description,
    synonyms: def.synonyms,
    ...SETTING_UI[id],
  };
});

/// A category's headings in display order.
export function sectionsOf(category: SettingCategory): string[] {
  return SECTIONS[category];
}

function sectionIndex(row: RowSpec): number {
  return sectionsOf(row.category).indexOf(row.section);
}

/// Every row of the dialog. Within a category rows follow `SECTIONS`, then registry order.
export const ROWS: RowSpec[] = [...FROM_REGISTRY, ...ACTION_ROWS].sort(
  (a, b) => sectionIndex(a) - sectionIndex(b),
);

function BackupFolderControl() {
  const [folder] = useSetting("general.backupFolder");
  const choose = useChooseBackupFolder();
  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      <span className="min-w-0 truncate text-xs text-muted-foreground" title={folder ?? undefined}>
        {folder ?? "No folder chosen"}
      </span>
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        onClick={() => !choose.isPending && choose.mutate()}
      >
        <IconFolder size={14} />
        {folder ? "Change" : "Choose"}
      </Button>
    </div>
  );
}

function BackupAutoControl() {
  const [folder] = useSetting("general.backupFolder");
  const [auto, setAuto] = useSetting("general.backupAuto");
  return (
    <Switch
      aria-label="Back up every day"
      checked={auto}
      disabled={!folder}
      onCheckedChange={setAuto}
    />
  );
}

/// A whole number of minutes. A half typed value is only kept once it is valid.
function MinutesControl({ settingId, label }: { settingId: MinutesId; label: string }) {
  const [value, setValue] = useSetting(settingId);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={MINUTES.min}
        max={MINUTES.max}
        step={5}
        className="w-20 tabular-nums"
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (Number.isInteger(next) && next >= MINUTES.min && next <= MINUTES.max) setValue(next);
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="text-xs text-muted-foreground">minutes</span>
    </div>
  );
}

type MinutesId = "calendar.sessionLengthMinutes" | "calendar.calendarEntryLengthMinutes";
/// What the registry accepts for a number of minutes.
const MINUTES = { min: 5, max: 720 };

/// Entry to the read only external calendar overlay shown on Sessions.
function CalendarConnectionsControl() {
  const [open, setOpen] = useState(false);
  const { data: status } = useExternalCalendarStatus();
  const count = status?.connections.length ?? 0;
  return (
    <>
      <span className="text-xs text-muted-foreground">
        {count === 0 ? "Not connected" : count === 1 ? "1 connected" : `${count} connected`}
      </span>
      <Button variant="secondary" size="sm" className="ml-3" onClick={() => setOpen(true)}>
        <IconCalendarUser size={14} />
        Manage
      </Button>
      <CalendarConnectionsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/// Entry to backing up the whole app to a folder and restoring from one.
function BackupControl() {
  const [open, setOpen] = useState(false);
  const [folder] = useSetting("general.backupFolder");
  const { data: backups } = useBackups(folder);
  const newest = backups?.find((b) => b.manifest)?.manifest?.createdAt;
  return (
    <>
      <span className="text-xs text-muted-foreground">
        {!folder ? "Not set up" : newest ? `Last ${formatEditedAt(newest)}` : "No backup yet"}
      </span>
      <Button variant="secondary" size="sm" className="ml-3" onClick={() => setOpen(true)}>
        <IconArchive size={14} />
        Manage
      </Button>
      <BackupDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function VersionControl() {
  const version = useAppVersion();
  const queryClient = useQueryClient();
  const checkUpdate = useMutation({
    mutationFn: () =>
      queryClient.fetchQuery({
        queryKey: qk.appUpdate,
        queryFn: checkForUpdate,
        staleTime: 0,
      }),
  });
  const status = useActionStatus(checkUpdate);
  return (
    <>
      <span className="text-xs text-muted-foreground tabular-nums">
        {version ? `v${version}` : ""}
      </span>
      <Button
        variant="secondary"
        size="sm"
        className="ml-3"
        onClick={() => !checkUpdate.isPending && checkUpdate.mutate()}
      >
        <StatusButtonContent
          status={status}
          icon={<IconRefresh size={14} />}
          label="Check for updates"
          successLabel={checkUpdate.data ? "Update found" : "Up to date"}
          errorLabel="Couldn't check"
        />
      </Button>
    </>
  );
}
