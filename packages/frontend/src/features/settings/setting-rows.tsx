import { IconCalendarUser, IconRefresh } from "@tabler/icons-react";
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
  BackupAutoControl,
  BackupFolderControl,
  BackupNowControl,
} from "#/features/backup/backup-controls.tsx";
import { BackupList, RestoreFileControl } from "#/features/backup/backup-restore.tsx";
import {
  CalendarConnectionsDialog,
  useExternalCalendarStatus,
} from "#/features/sessions/external-calendars/CalendarConnectionsDialog.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  NumberControl,
  SnapControl,
  SwitchControl,
  WeekStartControl,
} from "./setting-controls.tsx";
import { qk } from "#/lib/query-keys.ts";
import {
  SETTING_IDS,
  type SettingCategory,
  type SettingId,
  definitionOf,
} from "#/lib/settings/registry.ts";
import type { Searchable } from "#/lib/settings/search.ts";
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
  general: ["Date and time", "Tasks", "About"],
  appearance: ["Theme"],
  calendar: ["Defaults", "Week and day", "Connections"],
  notes: ["Code", "Editing"],
  backup: ["Backup", "Restore"],
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
  "backup.folder": { section: "Backup", control: <BackupFolderControl /> },
  "backup.auto": { section: "Backup", control: <BackupAutoControl /> },
  "notes.defaultCodeLanguage": { section: "Code", control: <CodeLanguageSettings /> },
  "calendar.sessionLengthMinutes": {
    section: "Defaults",
    control: (
      <NumberControl
        settingId="calendar.sessionLengthMinutes"
        label="Session length"
        unit="minutes"
        min={5}
        max={720}
        step={5}
        increments={10}
      />
    ),
  },
  "calendar.calendarEntryLengthMinutes": {
    section: "Defaults",
    control: (
      <NumberControl
        settingId="calendar.calendarEntryLengthMinutes"
        label="Calendar entry length"
        unit="minutes"
        min={5}
        max={720}
        step={5}
        increments={10}
      />
    ),
  },
  "calendar.weekStart": { section: "Week and day", control: <WeekStartControl /> },
  "calendar.dayStartHour": {
    section: "Week and day",
    control: (
      <NumberControl
        settingId="calendar.dayStartHour"
        label="Day starts at"
        unit="o'clock"
        min={0}
        max={23}
      />
    ),
  },
  "calendar.snapMinutes": { section: "Week and day", control: <SnapControl /> },
  "notes.arrowLigatures": {
    section: "Editing",
    control: <SwitchControl settingId="notes.arrowLigatures" label="Turn arrows into symbols" />,
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
    id: "backup.run",
    category: "backup",
    section: "Backup",
    title: "Back up now",
    description:
      "Saves everything in Nookly to one file: every Space, note, file, deck and setting. Files added by reference stay where they are and are not copied.",
    synonyms: ["export", "save", "copy", "archive", "restore", "zip", "backup now"],
    control: <BackupNowControl />,
  },
  {
    id: "backup.restore",
    category: "backup",
    section: "Restore",
    title: "Restore from a backup",
    description:
      "Replace everything in Nookly with a backup from the chosen folder, or from a file. You confirm before anything is replaced.",
    synonyms: ["restore", "import", "recover", "export", "save", "copy", "archive", "zip"],
    control: <RestoreFileControl />,
    footer: <BackupList />,
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
